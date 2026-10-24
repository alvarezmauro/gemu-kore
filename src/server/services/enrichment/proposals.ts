import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  prepareEnrichment,
  type ProposalField,
} from "@/features/enrichment/validation";
import type { EnrichmentValue } from "@/features/enrichment/contracts";
import { accessoryFields } from "@/features/accessories/validation";
import type { AccessoryMetadataResult } from "@/server/providers/accessory-metadata/contracts";
import { gameFields } from "@/features/games/validation";
import { playtimeSet } from "@/features/games/playtime-validation";
import { trailerReference } from "@/features/games/trailer-validation";
import { normalizedWebUrl } from "@/features/catalog/validation";
import type {
  EvidenceSource,
  GameMetadataResult,
} from "@/server/providers/game-metadata/contracts";
import { bounded, equal, type TargetSnapshot } from "./common";
import { EnrichmentError } from "./errors";

export type Choices = z.infer<typeof prepareEnrichment>;
type Binding = {
  externalId: string;
  companyId: string;
  revision: number;
};
type Proposal = {
  id: string;
  fieldPath: ProposalField;
  before: EnrichmentValue;
  proposed: EnrichmentValue;
  sourceSnapshot: EnrichmentValue;
  origin: "PROVIDER";
};
const developersSchema = z
  .array(
    z.strictObject({
      companyId: z.uuid(),
      creditLabel: z.string().max(200).nullable(),
    }),
  )
  .max(30)
  .refine((rows) => new Set(rows.map((r) => r.companyId)).size === rows.length);
export const referencesSchema = z
  .array(
    z.strictObject({
      id: z.uuid().optional(),
      provider: z.string().min(1).max(100),
      providerObjectType: z.string().max(100).nullable(),
      externalId: z.string().max(300).nullable(),
      url: z.string().max(2048).nullable(),
    }),
  )
  .max(30)
  .superRefine((rows, ctx) => {
    const keys = new Set<string>();
    for (const row of rows) {
      if (
        (!row.externalId && !row.url) ||
        (row.externalId && !row.providerObjectType)
      )
        ctx.addIssue({
          code: "custom",
          message: "Invalid external reference.",
        });
      if (row.url) {
        try {
          normalizedWebUrl(row.url);
        } catch {
          ctx.addIssue({ code: "custom", message: "Invalid source URL." });
        }
      }
      const key = JSON.stringify([
        row.provider.toLowerCase(),
        row.providerObjectType?.toUpperCase(),
        row.externalId,
        row.url,
      ]);
      if (keys.has(key))
        ctx.addIssue({
          code: "custom",
          message: "Duplicate external reference.",
        });
      keys.add(key);
    }
  });
export function validateAcceptedField(
  target: TargetSnapshot,
  field: string,
  value: unknown,
): EnrichmentValue {
  if (field === "references") return referencesSchema.parse(value);
  if (target.target.kind === "accessory") {
    if (field === "name") return accessoryFields.shape.name.parse(value);
    if (field === "description") {
      const parsed = accessoryFields.shape.description.parse(value);
      if (parsed) return parsed;
    }
    if (field === "releaseYear") {
      const year = z.number().int().min(1).max(9999).parse(value);
      return accessoryFields.shape.releaseYear.parse(String(year));
    }
    if (field === "producerId") return z.uuid().parse(value);
    if (field === "trailer") return trailerReference.parse(value);
    throw new EnrichmentError("INVALID_INPUT");
  }
  if (target.target.kind !== "game") throw new EnrichmentError("INVALID_INPUT");
  if (field === "trailer") return trailerReference.parse(value);
  if (field === "playtime") {
    const estimates = playtimeSet.parse(value);
    if (estimates.sourceType !== "PROVIDER")
      throw new EnrichmentError("INVALID_INPUT");
    return estimates;
  }
  const old = target.fields;
  const fields = { ...old, [field]: value };
  const parsed = gameFields.parse({
    name: fields.name,
    slug: "retained-slug",
    description: fields.description ?? "",
    aliases: z.array(z.string()).parse(fields.aliases).join("\n"),
    developers: developersSchema
      .parse(fields.developers)
      .map((row) => ({ ...row, creditLabel: row.creditLabel ?? "" })),
  });
  if (field === "name") return parsed.name;
  if (field === "description" && parsed.description) return parsed.description;
  if (field === "aliases") return parsed.aliases;
  if (field === "developers") return parsed.developers;
  throw new EnrichmentError("INVALID_INPUT");
}

export function buildProposals(
  target: TargetSnapshot,
  result: GameMetadataResult | AccessoryMetadataResult,
  choices: Choices,
  bindings: Binding[],
) {
  if (result.provider === "WIKIDATA")
    return buildAccessoryProposals(target, result, choices, bindings);
  const proposals: Proposal[] = [];
  const unavailable: { field: string; reason: string }[] = [];
  const add = (
    field: ProposalField,
    value: unknown,
    evidenceIds: string[],
    transformation = "COPY",
  ) => {
    const before = target.fields[field] ?? null;
    const proposed = validateAcceptedField(target, field, value);
    if (equal(before, proposed)) return;
    const evidence = evidenceIds.map((id) =>
      result.evidence.find((source) => source.id === id),
    );
    if (!evidence.length || evidence.some((source) => !source))
      throw new EnrichmentError("INVALID_INPUT");
    proposals.push({
      id: randomUUID(),
      fieldPath: field,
      before,
      proposed,
      origin: "PROVIDER",
      sourceSnapshot: {
        schemaVersion: 1,
        data: {
          provider: result.provider,
          game: result.identity.ref,
          mappingVersion: result.mappingVersion,
          resultSchemaVersion: result.schemaVersion,
          pipelineVersion: "1",
          retrievedAt: result.retrievedAt,
          scope: "GAME",
          transformation,
          evidence: evidence as EvidenceSource[],
          bindings: field === "developers" ? bindings : [],
          ...(field === "playtime" ? { recordedAtBasis: "RETRIEVED_AT" } : {}),
        },
      },
    });
  };
  if (choices.trailerExternalId && !choices.fields.includes("trailer"))
    throw new EnrichmentError("INVALID_INPUT");
  if (choices.companyBindings.length && !choices.fields.includes("developers"))
    throw new EnrichmentError("INVALID_INPUT");
  for (const field of choices.fields) {
    if (field === "references") {
      const refs = referencesSchema.parse(target.fields.references);
      const ref = result.identity.ref;
      if (
        !refs.some(
          (item) =>
            item.provider.toLowerCase() === ref.provider.toLowerCase() &&
            item.providerObjectType?.toUpperCase() === ref.objectType &&
            item.externalId === ref.externalId,
        )
      ) {
        const source = result.evidence.find((e) =>
          result.identity.evidenceIds.includes(e.id),
        );
        add(
          field,
          [
            ...refs,
            {
              provider: ref.provider.toLowerCase(),
              providerObjectType: ref.objectType,
              externalId: ref.externalId,
              url: source?.sourceUrl ?? null,
            },
          ],
          result.identity.evidenceIds,
          "APPEND_PRESERVING_EXISTING",
        );
      }
      continue;
    }
    if (target.target.kind !== "game") {
      unavailable.push({
        field,
        reason:
          "The provider match does not establish this physical release's scope. Enrich its Game instead.",
      });
      continue;
    }
    if (field === "name")
      add(field, result.identity.name, result.identity.evidenceIds);
    else if (field === "aliases")
      add(
        field,
        [
          ...new Set([
            ...z.array(z.string()).parse(target.fields.aliases),
            ...result.identity.aliases,
          ]),
        ],
        result.identity.evidenceIds,
        "APPEND_PRESERVING_EXISTING",
      );
    else if (
      field === "description" &&
      "data" in result.description &&
      result.description.data.scope.kind === "GAME"
    )
      add(
        field,
        result.description.data.value,
        result.description.data.evidenceIds,
      );
    else if (field === "trailer" && "data" in result.videos) {
      const selected = result.videos.data.find(
        (video) =>
          video.value.ref.externalId === choices.trailerExternalId &&
          video.scope.kind === "GAME",
      );
      if (!selected) throw new EnrichmentError("INVALID_INPUT");
      add(field, selected.value.video, selected.evidenceIds);
    } else if (
      field === "playtime" &&
      "data" in result.playtime &&
      result.playtime.data.scope.kind === "GAME"
    ) {
      const value = result.playtime.data;
      const source = result.evidence.find((e) =>
        value.evidenceIds.includes(e.id),
      );
      add(
        field,
        {
          mainMinutes: value.value.mainMinutes,
          mainExtrasMinutes: value.value.mainExtrasMinutes,
          completionistMinutes: value.value.completionistMinutes,
          sourceType: "PROVIDER",
          sourceName: result.provider,
          sourceUrl: source?.sourceUrl ?? null,
          observedAt: result.retrievedAt,
        },
        value.evidenceIds,
        "WHOLE_ESTIMATE_SET",
      );
    } else if (field === "developers" && "data" in result.companies) {
      const eligible = result.companies.data.filter(
        (company) =>
          company.value.role === "DEVELOPER" && company.scope.kind === "GAME",
      );
      if (
        choices.companyBindings.some(
          (binding) =>
            !eligible.some(
              (company) => company.value.ref.externalId === binding.externalId,
            ),
        )
      )
        throw new EnrichmentError("INVALID_INPUT");
      const old = developersSchema.parse(target.fields.developers);
      const resolved = eligible.map((company) => ({
        company,
        binding: bindings.find(
          (binding) => binding.externalId === company.value.ref.externalId,
        ),
      }));
      if (resolved.some((item) => !item.binding)) {
        unavailable.push({
          field,
          reason:
            "Choose an existing active company for every developer; unresolved mappings cannot be applied.",
        });
        continue;
      }
      if (resolved.length)
        add(
          field,
          [
            ...old,
            ...resolved
              .filter(
                (item) =>
                  !old.some(
                    (current) => current.companyId === item.binding!.companyId,
                  ),
              )
              .map((item) => ({
                companyId: item.binding!.companyId,
                creditLabel: null,
              })),
          ].filter(
            (value, index, array) =>
              array.findIndex((item) => item.companyId === value.companyId) ===
              index,
          ),
          resolved.flatMap((item) => item.company.evidenceIds),
          "APPEND_PRESERVING_EXISTING",
        );
    } else
      unavailable.push({
        field,
        reason: "No supported, scoped evidence is available for this field.",
      });
  }
  bounded({ result, proposals });
  return { proposals, unavailable };
}

function buildAccessoryProposals(
  target: TargetSnapshot,
  result: AccessoryMetadataResult,
  choices: Choices,
  bindings: Binding[],
) {
  const proposals: Proposal[] = [],
    unavailable: { field: string; reason: string }[] = [];
  const add = (
    field: ProposalField,
    value: unknown,
    ids: string[],
    transformation = "COPY",
  ) => {
    const before = target.fields[field] ?? null,
      proposed = validateAcceptedField(target, field, value);
    if (equal(before, proposed)) return;
    const evidence = ids.map((id) => result.evidence.find((e) => e.id === id));
    if (!evidence.length || evidence.some((e) => !e))
      throw new EnrichmentError("INVALID_INPUT");
    proposals.push({
      id: randomUUID(),
      fieldPath: field,
      before,
      proposed,
      origin: "PROVIDER",
      sourceSnapshot: {
        schemaVersion: 1,
        data: {
          provider: result.provider,
          item: result.identity.ref,
          mappingVersion: result.mappingVersion,
          resultSchemaVersion: 1,
          pipelineVersion: "1",
          retrievedAt: result.retrievedAt,
          scope: "ACCESSORY",
          transformation,
          evidence: evidence as AccessoryMetadataResult["evidence"],
          bindings: field === "producerId" ? bindings : [],
        },
      },
    });
  };
  if (choices.trailerExternalId && !choices.fields.includes("trailer"))
    throw new EnrichmentError("INVALID_INPUT");
  if (choices.companyBindings.length && !choices.fields.includes("producerId"))
    throw new EnrichmentError("INVALID_INPUT");
  for (const field of choices.fields) {
    if (field === "references") {
      const refs = referencesSchema.parse(target.fields.references),
        ref = result.identity.ref;
      if (
        !refs.some(
          (r) =>
            r.provider.toUpperCase() === ref.provider &&
            r.providerObjectType?.toUpperCase() === ref.objectType &&
            r.externalId === ref.externalId,
        )
      )
        add(
          field,
          [
            ...refs,
            {
              provider: "wikidata",
              providerObjectType: "ITEM",
              externalId: ref.externalId,
              url: result.evidence.find((e) =>
                result.identity.evidenceIds.includes(e.id),
              )!.sourceUrl,
            },
          ],
          result.identity.evidenceIds,
          "APPEND_PRESERVING_EXISTING",
        );
      continue;
    }
    if (target.target.kind !== "accessory") {
      unavailable.push({
        field,
        reason:
          "Product evidence does not establish this variant's exact edition, markets or compatibility. Review its accessory family instead.",
      });
      continue;
    }
    if (field === "name")
      add(field, result.identity.name, result.identity.evidenceIds);
    else if (field === "description" && "data" in result.description)
      add(
        field,
        result.description.data.value,
        result.description.data.evidenceIds,
      );
    else if (field === "releaseYear" && "data" in result.releaseYear)
      add(
        field,
        result.releaseYear.data.value,
        result.releaseYear.data.evidenceIds,
      );
    else if (field === "trailer" && "data" in result.videos) {
      const video = result.videos.data.find(
        (v) => v.value.externalId === choices.trailerExternalId,
      );
      if (!video) throw new EnrichmentError("INVALID_INPUT");
      add(field, video.value.video, video.evidenceIds);
    } else if (field === "producerId" && "data" in result.producers) {
      const matched = result.producers.data.flatMap((p) => {
        const binding = bindings.find(
          (b) => b.externalId === p.value.ref.externalId,
        );
        return binding ? [{ producer: p, binding }] : [];
      });
      if (matched.length !== 1) {
        unavailable.push({
          field,
          reason:
            "Choose exactly one sourced manufacturer and bind it to an existing active company.",
        });
        continue;
      }
      add(field, matched[0].binding.companyId, matched[0].producer.evidenceIds);
    } else
      unavailable.push({
        field,
        reason: "No eligible accessory evidence was supplied for this field.",
      });
  }
  return { proposals, unavailable };
}
