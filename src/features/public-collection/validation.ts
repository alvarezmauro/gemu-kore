import { z } from "zod";
import { searchInput } from "@/features/search/validation";

export const publicCollectionInput = searchInput
  .extend({
    q: searchInput.shape.q.default(""),
    type: z.enum(["CONSOLE", "GAME", "ACCESSORY"]).optional(),
    platform: z.uuid().optional(),
    region: z.uuid().optional(),
    company: z.uuid().optional(),
    year: z.number().int().min(1).max(9999).optional(),
    hasBox: z.enum(["true", "false", "unknown"]).optional(),
    hasDefects: z.boolean().optional(),
    location: z.uuid().optional(),
    sort: z
      .enum(["relevance", "name-asc", "name-desc", "newest", "oldest"])
      .default("name-asc"),
  })
  .strict();
export const publicDetailInput = z.strictObject({ id: z.uuid() });
export const publicSettingsValues = z.strictObject({
  publicCollectionEnabled: z.boolean(),
  allowSearchEngineIndexing: z.boolean(),
  showSerialNumbers: z.boolean(),
  showLocations: z.boolean(),
  showNotes: z.boolean(),
  showDefects: z.boolean(),
  showPersonalPhotos: z.boolean(),
});
const revision = z.number().int().min(1).max(2147483646);
export const settingsReviewInput = z.strictObject({
  expectedRevision: revision,
  settings: publicSettingsValues,
});
const reviewToken = z.string().regex(/^[a-f0-9]{32}$/);
export const settingsMutation = settingsReviewInput
  .extend({ reviewed: z.literal(true), reviewToken })
  .strict();
export const itemReviewInput = publicDetailInput
  .extend({ published: z.boolean().default(true) })
  .strict();
export const itemPublicationMutation = z.strictObject({
  id: z.uuid(),
  expectedRevision: revision,
  expectedSettingsRevision: revision,
  published: z.boolean(),
  reviewed: z.literal(true),
  reviewToken,
});
export type PublicCollectionInput = z.output<typeof publicCollectionInput>;
export type PublicSettingsValues = z.output<typeof publicSettingsValues>;
