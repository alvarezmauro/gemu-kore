import "server-only";
import { z } from "zod";
import type {
  ProviderContext,
  ProviderResult,
} from "../game-metadata/contracts";
const text = (max: number) => z.string().trim().min(1).max(max);
export const itemId = z.string().regex(/^Q[1-9][0-9]{0,15}$/);
export const accessoryReference = z.strictObject({
  provider: z.literal("WIKIDATA"),
  objectType: z.literal("ITEM"),
  externalId: itemId,
});
const accessoryEvidence = z.strictObject({
  id: text(128),
  sourceUrl: z
    .url()
    .max(2048)
    .refine((value) => {
      const u = new URL(value);
      return (
        u.protocol === "https:" &&
        u.hostname === "www.wikidata.org" &&
        !u.username &&
        !u.password
      );
    }),
  fieldPath: text(200),
  retrievedAt: z.iso.datetime(),
  sourceUpdatedAt: z.iso.datetime().nullable(),
  normalization: z.enum(["NONE", "PLAIN_TEXT", "PARTIAL_DATE"]),
});
const evidenceIds = z.array(text(128)).min(1).max(128);
const fact = <T extends z.ZodType>(value: T) =>
  z.strictObject({ value, evidenceIds });
const section = <T extends z.ZodType>(value: T) =>
  z.union([
    z.strictObject({ state: z.enum(["present", "limited"]), data: value }),
    z.strictObject({ state: z.enum(["absent", "unsupported", "invalid"]) }),
  ]);
const identity = z.strictObject({
  ref: accessoryReference,
  name: text(200),
  evidenceIds,
});
const diagnostic = z.strictObject({
  section: text(40),
  code: z.enum([
    "LIMIT_REACHED",
    "INVALID_OPTIONAL",
    "AMBIGUOUS_VALUE",
    "UNSUPPORTED_SCOPE",
  ]),
});
export const accessorySearchPage = z
  .strictObject({
    schemaVersion: z.literal(1),
    provider: z.literal("WIKIDATA"),
    retrievedAt: z.iso.datetime(),
    candidates: z
      .array(z.strictObject({ identity, description: text(16000).nullable() }))
      .max(20),
    diagnostics: z.array(diagnostic).max(100),
  })
  .superRefine((page, ctx) => {
    const ids = page.candidates.map((c) => c.identity.ref.externalId);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        message: "Ambiguous candidate identifiers.",
      });
  });
export const accessoryMetadataResult = z
  .strictObject({
    schemaVersion: z.literal(1),
    provider: z.literal("WIKIDATA"),
    mappingVersion: z.literal("1"),
    retrievedAt: z.iso.datetime(),
    identity,
    description: section(fact(text(16000))),
    releaseYear: section(fact(z.number().int().min(1).max(9999))),
    producers: section(
      z
        .array(
          fact(z.strictObject({ ref: accessoryReference, name: text(200) })),
        )
        .max(10),
    ),
    videos: section(
      z
        .array(
          fact(
            z.strictObject({
              externalId: text(128),
              title: text(200).nullable(),
              video: z.strictObject({
                provider: z.literal("YOUTUBE"),
                id: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
              }),
            }),
          ),
        )
        .max(20),
    ),
    observations: z
      .array(
        z.strictObject({
          label: text(100),
          value: text(1000),
          sourceUrl: z
            .url()
            .max(2048)
            .refine((value) => {
              const u = new URL(value);
              return (
                u.protocol === "https:" &&
                ["www.wikidata.org", "commons.wikimedia.org"].includes(
                  u.hostname,
                ) &&
                !u.username &&
                !u.password
              );
            }),
          evidenceIds,
        }),
      )
      .max(30),
    evidence: z.array(accessoryEvidence).min(1).max(128),
    diagnostics: z.array(diagnostic).max(100),
  })
  .superRefine((result, ctx) => {
    const ids = result.evidence.map((e) => e.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        message: "Duplicate evidence identifiers.",
      });
    if (
      result.evidence.some(
        (e) =>
          new URL(e.sourceUrl).pathname !==
          `/wiki/${result.identity.ref.externalId}`,
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Evidence belongs to a different product identity.",
      });
    const referenced = [
      ...result.identity.evidenceIds,
      ...("data" in result.description
        ? result.description.data.evidenceIds
        : []),
      ...("data" in result.releaseYear
        ? result.releaseYear.data.evidenceIds
        : []),
      ...("data" in result.producers
        ? result.producers.data.flatMap((v) => v.evidenceIds)
        : []),
      ...("data" in result.videos
        ? result.videos.data.flatMap((v) => v.evidenceIds)
        : []),
      ...result.observations.flatMap((o) => o.evidenceIds),
    ];
    if (referenced.some((id) => !ids.includes(id)))
      ctx.addIssue({ code: "custom", message: "Missing evidence." });
    for (const rows of [
      "data" in result.producers
        ? result.producers.data.map((p) => p.value.ref.externalId)
        : [],
      "data" in result.videos
        ? result.videos.data.map((v) => v.value.externalId)
        : [],
    ])
      if (new Set(rows).size !== rows.length)
        ctx.addIssue({
          code: "custom",
          message: "Ambiguous choice identifiers.",
        });
  });
export type AccessoryMetadataResult = z.infer<typeof accessoryMetadataResult>;
export type AccessorySearchPage = z.infer<typeof accessorySearchPage>;
export type AccessoryMetadataProvider = {
  id: "WIKIDATA";
  search(
    input: { query: string; limit: number },
    context: ProviderContext,
  ): Promise<ProviderResult<AccessorySearchPage>>;
  fetch(
    input: { item: z.infer<typeof accessoryReference> },
    context: ProviderContext,
  ): Promise<ProviderResult<AccessoryMetadataResult>>;
};
