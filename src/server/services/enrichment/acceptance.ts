import "server-only";
import { z } from "zod";
import type { PrivateAccessContext } from "@/server/auth/access";
import * as repository from "@/server/repositories/enrichment";
import * as catalog from "@/server/repositories/catalog/enrichment";
import { setCatalogReferences } from "@/server/repositories/catalog/management";
import { setDevelopers } from "@/server/repositories/catalog/games";
import { normalizedWebUrl } from "@/features/catalog/validation";
import { applyEnrichment } from "@/features/enrichment/validation";
import { playtimeSet } from "@/features/games/playtime-validation";
import { trailerReference } from "@/features/games/trailer-validation";
import type { EnrichmentReceipt } from "@/features/enrichment/contracts";
import {
  authorizedRun,
  equal,
  guarded,
  json,
  jsonNullable,
  loadTarget,
  manualReplacement,
  parse,
  targetOf,
  unchanged,
} from "./common";
import { referencesSchema, validateAcceptedField } from "./proposals";
import { EnrichmentError } from "./errors";

const scalars = z.strictObject({
  name: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(16000).optional(),
  aliases: z.array(z.string().min(1).max(200)).max(30).optional(),
  trailer: trailerReference.optional(),
});
const receiptSchema = z.strictObject({
  runId: z.uuid(),
  suggestionIds: z.array(z.uuid()).max(32),
  changeIds: z.array(z.uuid()).max(32),
  revision: z.number().int().positive(),
});
const sourceSchema = z.object({
  schemaVersion: z.literal(1),
  data: z.object({
    provider: z.literal("IGDB"),
    scope: z.literal("GAME"),
    bindings: z
      .array(
        z.strictObject({
          externalId: z.string(),
          companyId: z.uuid(),
          revision: z.number().int().positive(),
        }),
      )
      .max(30),
  }),
});

export async function applyEnrichmentSuggestions(
  context: PrivateAccessContext,
  input: unknown,
): Promise<EnrichmentReceipt> {
  const command = parse(applyEnrichment, input);
  command.suggestionIds.sort();
  command.manualReplacementIds.sort();
  const outcome = await guarded(
    context,
    async (actor, tx) => {
      const run = await authorizedRun(command.runId, actor, tx);
      if (
        !run.reviewToken ||
        command.reviewToken !== run.reviewToken ||
        run.fetchStatus !== "COMPLETED"
      )
        throw new EnrichmentError("STALE");
      if (run.receipt) {
        const receipt = receiptSchema.parse(run.receipt);
        if (!equal(receipt.suggestionIds, command.suggestionIds))
          throw new EnrichmentError("CONFLICT");
        return { receipt };
      }
      const all = await repository.suggestions(run.id, tx);
      const selected = all.filter((row) =>
        command.suggestionIds.includes(row.id),
      );
      if (
        selected.length !== command.suggestionIds.length ||
        command.manualReplacementIds.some(
          (id) => !command.suggestionIds.includes(id),
        )
      )
        throw new EnrichmentError("INVALID_INPUT");
      const target = await loadTarget(targetOf(run), tx);
      if (
        !unchanged(run, target) ||
        selected.some((row) => row.reviewStatus === "CONFLICT")
      ) {
        await repository.decideSuggestions(
          run.id,
          all
            .filter((row) => row.reviewStatus === "PENDING")
            .map((row) => row.id),
          "CONFLICT",
          null,
          new Date(),
          tx,
        );
        await repository.updateRun(run.id, {}, tx);
        return { conflict: true as const };
      }
      if (selected.some((row) => row.reviewStatus !== "PENDING"))
        throw new EnrichmentError("STALE");
      const origins = new Map(
        (
          await repository.fieldOrigins(
            target.target.kind,
            target.target.id,
            tx,
          )
        ).map((row) => [row.fieldPath, row.origin]),
      );
      for (const row of selected) {
        if (
          row.origin !== "PROVIDER" ||
          !equal(row.before, target.fields[row.fieldPath] ?? null)
        )
          throw new EnrichmentError("CONFLICT");
        if (
          manualReplacement(row.before, origins.get(row.fieldPath)) &&
          !command.manualReplacementIds.includes(row.id)
        )
          throw new EnrichmentError("INVALID_INPUT");
        validateAcceptedField(target, row.fieldPath, row.proposed);
        const source = sourceSchema.parse(row.sourceSnapshot);
        const bindings = source.data.bindings;
        if (bindings.length) {
          const current = await catalog.companies(
            bindings.map((binding) => binding.companyId),
            tx,
          );
          if (
            bindings.some(
              (binding) =>
                !current.some(
                  (company) =>
                    company.id === binding.companyId &&
                    company.revision === binding.revision &&
                    !company.archivedAt,
                ),
            )
          ) {
            await repository.decideSuggestions(
              run.id,
              all
                .filter((item) => item.reviewStatus === "PENDING")
                .map((item) => item.id),
              "CONFLICT",
              null,
              new Date(),
              tx,
            );
            await repository.updateRun(run.id, {}, tx);
            return { conflict: true as const };
          }
        }
        if (row.fieldPath === "developers") {
          const ids = z
            .array(z.object({ companyId: z.uuid() }))
            .parse(row.proposed)
            .map((item) => item.companyId);
          const current = await catalog.companies(ids, tx);
          if (
            ids.some(
              (id) =>
                !current.some(
                  (company) => company.id === id && !company.archivedAt,
                ),
            )
          )
            throw new EnrichmentError("INVALID_INPUT");
        }
      }
      const scalar = scalars.parse(
        Object.fromEntries(
          selected
            .filter((row) =>
              ["name", "description", "aliases", "trailer"].includes(
                row.fieldPath,
              ),
            )
            .map((row) => [row.fieldPath, row.proposed]),
        ),
      );
      const changed = await catalog.writeAcceptedFields(
        target.target.kind,
        target.target.id,
        scalar,
        tx,
      );
      for (const row of selected) {
        if (row.fieldPath === "developers")
          await setDevelopers(
            target.target.id,
            z
              .array(
                z.strictObject({
                  companyId: z.uuid(),
                  creditLabel: z.string().nullable(),
                }),
              )
              .parse(row.proposed),
            tx,
          );
        if (row.fieldPath === "references")
          await setCatalogReferences(
            target.target.kind,
            target.target.id,
            referencesSchema.parse(row.proposed).map((reference) => ({
              ...reference,
              normalizedUrl: reference.url
                ? normalizedWebUrl(reference.url)
                : null,
            })),
            tx,
          );
        if (row.fieldPath === "playtime") {
          const estimates = playtimeSet.parse(row.proposed);
          await catalog.writeAcceptedPlaytime(
            target.target.kind,
            target.target.id,
            {
              ...estimates,
              sourceType: "PROVIDER",
              observedAt: new Date(estimates.observedAt),
            },
            tx,
          );
        }
      }
      const saved = await loadTarget(target.target, tx);
      const changeIds: string[] = [];
      for (const row of selected) {
        const change = await catalog.recordAcceptedChange(
          {
            kind: target.target.kind,
            targetId: target.target.id,
            fieldPath: row.fieldPath,
            revision: changed.revision,
            actorId: actor.userId,
            before: jsonNullable(row.before),
            after: jsonNullable(saved.fields[row.fieldPath] ?? null),
            sourceSnapshot: json(row.sourceSnapshot),
            suggestionId: row.id,
          },
          tx,
        );
        changeIds.push(change.id);
      }
      await repository.decideSuggestions(
        run.id,
        command.suggestionIds,
        "ACCEPTED",
        actor.userId,
        new Date(),
        tx,
      );
      await repository.decideSuggestions(
        run.id,
        all
          .filter(
            (row) =>
              row.reviewStatus === "PENDING" &&
              !command.suggestionIds.includes(row.id),
          )
          .map((row) => row.id),
        "CONFLICT",
        null,
        new Date(),
        tx,
      );
      const receipt: EnrichmentReceipt = {
        runId: run.id,
        suggestionIds: command.suggestionIds,
        changeIds,
        revision: changed.revision,
      };
      await repository.updateRun(run.id, { receipt: json(receipt) }, tx);
      return { receipt };
    },
    true,
  );
  if ("conflict" in outcome) throw new EnrichmentError("CONFLICT");
  return outcome.receipt;
}
