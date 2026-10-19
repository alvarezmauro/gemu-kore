import { z } from "zod";
import { normalizedWebUrl } from "@/features/catalog/validation";
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => v || null);
const url = optional(512).refine((v) => {
  try {
    if (v) normalizedWebUrl(v);
    return true;
  } catch {
    return false;
  }
}, "Use an HTTP or HTTPS URL without credentials.");
export const screenshotUpload = z
  .strictObject({
    caption: optional(1000),
    altText: optional(1000),
    sourceType: z.enum(["USER_UPLOAD", "CURATED"]),
    provider: optional(100),
    sourceUrl: url,
    author: optional(160),
    licenseName: optional(160),
    licenseUrl: url,
    attribution: optional(500),
    usageRestrictions: optional(500),
    retrievedAt: z
      .string()
      .regex(/^(?:\d{4}-\d{2}-\d{2})?$/)
      .refine(
        (v) =>
          (() => {
            try {
              return (
                !v ||
                (Number(v.slice(0, 4)) >= 1 &&
                  new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v)
              );
            } catch {
              return false;
            }
          })(),
        "Use a valid date.",
      )
      .nullable()
      .transform((v) => v || null),
  })
  .refine(
    (v) => new TextEncoder().encode(JSON.stringify(v)).length <= 1800,
    "Keep the combined caption and source details under 1,800 UTF-8 bytes.",
  );
export const emptyScreenshotUpload: z.input<typeof screenshotUpload> = {
  caption: "",
  altText: "",
  sourceType: "USER_UPLOAD",
  provider: "",
  sourceUrl: "",
  author: "",
  licenseName: "",
  licenseUrl: "",
  attribution: "",
  usageRestrictions: "",
  retrievedAt: "",
};
export const screenshotPage = z.strictObject({
  releaseId: z.uuid(),
  page: z.number().int().min(1).max(1000).default(1),
});
const scope = {
  releaseId: z.uuid(),
  id: z.uuid(),
  expectedRevision: z.number().int().min(1).max(2147483646),
};
export const screenshotMutation = z.discriminatedUnion("operation", [
  z.strictObject({
    ...scope,
    operation: z.literal("update"),
    caption: optional(1000),
    altText: optional(1000),
  }),
  z.strictObject({
    ...scope,
    operation: z.literal("move"),
    direction: z.enum(["up", "down"]),
  }),
  z.strictObject({ ...scope, operation: z.literal("delete") }),
]);
export function safeScreenshotUrl(value: string | null) {
  try {
    return value ? normalizedWebUrl(value) : null;
  } catch {
    return null;
  }
}
