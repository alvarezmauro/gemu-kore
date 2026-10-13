import { z } from "zod";
import { photoTypes } from "./contracts";
export const mediaItemId = z.uuid();
const scope = {
  collectionItemId: mediaItemId,
  expectedRevision: z.number().int().min(1).max(2147483646),
};
export const mediaMutation = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("update"),
      ...scope,
      id: z.uuid(),
      type: z.enum(photoTypes),
      caption: z
        .string()
        .trim()
        .max(2000)
        .nullish()
        .transform((value) => value || null),
      altText: z
        .string()
        .trim()
        .max(1000)
        .nullish()
        .transform((value) => value || null),
    })
    .strict(),
  z.object({ operation: z.literal("delete"), ...scope, id: z.uuid() }).strict(),
  z
    .object({
      operation: z.literal("reorder"),
      ...scope,
      ids: z
        .array(z.uuid())
        .min(1)
        .refine((ids) => new Set(ids).size === ids.length),
    })
    .strict(),
]);
