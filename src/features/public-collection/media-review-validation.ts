import { z } from "zod";
export const mediaReviewInput = z.strictObject({
  kind: z.enum(["personal", "catalog", "site"]),
  useId: z.uuid(),
  displayAssetId: z.uuid(),
  approved: z.boolean(),
});
export const mediaReviewSave = mediaReviewInput.extend({
  reviewToken: z.string().length(64),
  reviewed: z.literal(true),
});
export const componentReviewInput = z.strictObject({
  componentId: z.uuid(),
  approved: z.boolean(),
});
export const componentReviewSave = componentReviewInput.extend({
  reviewToken: z.string().length(64),
  reviewed: z.literal(true),
});
