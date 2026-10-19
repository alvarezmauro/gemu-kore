import { z } from "zod";

export const enrichmentTarget = z.strictObject({
  kind: z.enum(["game", "release"]),
  id: z.uuid(),
});
export type EnrichmentTarget = z.infer<typeof enrichmentTarget>;
const version = z.number().int().positive().max(2147483646);
export const startEnrichment = z.strictObject({
  target: enrichmentTarget,
  expectedRevision: version,
  requestKey: z.uuid(),
  query: z
    .string()
    .trim()
    .min(2)
    .max(200)
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value)),
});
export const runIdentity = z.strictObject({ runId: z.uuid() });
export const runCommand = runIdentity.extend({ expectedRunVersion: version });
export const chooseEnrichmentCandidate = runCommand.extend({
  externalId: z.string().regex(/^[1-9][0-9]{0,15}$/),
});
export const proposalFields = [
  "name",
  "description",
  "aliases",
  "developers",
  "references",
  "trailer",
  "playtime",
  "descriptionOverride",
  "credits",
  "markets",
  "firstReleaseYear",
] as const;
export type ProposalField = (typeof proposalFields)[number];
export const prepareEnrichment = runCommand.extend({
  fields: z
    .array(z.enum(proposalFields))
    .min(1)
    .max(32)
    .refine((values) => new Set(values).size === values.length),
  trailerExternalId: z.string().min(1).max(128).optional(),
  companyBindings: z
    .array(
      z.strictObject({
        externalId: z.string().min(1).max(128),
        companyId: z.uuid(),
      }),
    )
    .max(30)
    .default([])
    .refine(
      (values) =>
        new Set(values.map((value) => value.externalId)).size === values.length,
    ),
});
export const applyEnrichment = runIdentity.extend({
  reviewToken: z.string().regex(/^[a-f0-9]{64}$/),
  suggestionIds: z
    .array(z.uuid())
    .min(1)
    .max(32)
    .refine((values) => new Set(values).size === values.length),
  manualReplacementIds: z
    .array(z.uuid())
    .max(32)
    .default([])
    .refine((values) => new Set(values).size === values.length),
});
export const rejectEnrichment = runCommand.extend({
  suggestionIds: z
    .array(z.uuid())
    .min(1)
    .max(32)
    .refine((values) => new Set(values).size === values.length),
});
