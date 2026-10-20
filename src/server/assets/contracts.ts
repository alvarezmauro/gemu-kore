import "server-only";
import { z } from "zod";
import { screenshotUpload } from "@/features/games/screenshot-validation";

export const legacyTargetSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("collection"),
      id: z.uuid(),
      type: z
        .enum([
          "PHOTO",
          "FRONT",
          "BACK",
          "LEFT",
          "RIGHT",
          "TOP",
          "BOTTOM",
          "SERIAL",
          "BOX",
          "DAMAGE",
          "OTHER",
          "CUSTOM_LOGO",
          "CUSTOM_MODEL",
        ])
        .default("PHOTO"),
    })
    .strict(),
  z
    .object({
      kind: z.literal("catalog"),
      id: z.uuid(),
      target: z.enum([
        "company",
        "consolePlatform",
        "consoleModel",
        "game",
        "gameRelease",
        "accessory",
        "accessoryVariant",
      ]),
      role: z.enum([
        "LOGO",
        "COVER",
        "SCREENSHOT",
        "GALLERY",
        "MODEL_3D",
        "PREVIEW",
      ]),
      screenshot: screenshotUpload.optional(),
      artwork: screenshotUpload.optional(),
    })
    .strict()
    .refine(
      (v) =>
        !v.screenshot ||
        (v.target === "gameRelease" && v.role === "SCREENSHOT"),
      "Screenshot details require a game release screenshot target.",
    )
    .refine(
      (v) => !v.artwork || (v.target === "gameRelease" && v.role === "GALLERY"),
      "Artwork details require a release gallery target.",
    ),
  z
    .object({
      kind: z.literal("application"),
      role: z.literal("COLLECTION_LOGO"),
    })
    .strict(),
]);
export const packagingGeometryTarget = z.strictObject({
  kind: z.literal("packagingGeometry"),
  id: z.uuid(),
  expectedRevision: z.number().int().positive().max(2147483646),
  source: screenshotUpload,
});
export const targetSchema = z.union([
  legacyTargetSchema,
  packagingGeometryTarget,
]);
export type UploadTarget = z.infer<typeof targetSchema>;
export const artifactSchema = z
  .object({
    id: z.uuid(),
    mimeType: z.enum([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/avif",
      "model/gltf-binary",
    ]),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(50 * 1024 * 1024),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    variant: z.enum(["original", "thumbnail", "display"]),
  })
  .strict();
const legacyManifest = z
  .object({
    schemaVersion: z.literal(1),
    data: z
      .object({
        target: legacyTargetSchema,
        useId: z.uuid(),
        artifacts: z.array(artifactSchema).min(1).max(3),
      })
      .strict(),
  })
  .strict();
export const manifestSchema = z.discriminatedUnion("schemaVersion", [
  legacyManifest,
  z.strictObject({
    schemaVersion: z.literal(2),
    data: z.strictObject({
      target: packagingGeometryTarget,
      artifacts: z
        .array(
          artifactSchema.extend({
            mimeType: z.literal("model/gltf-binary"),
            variant: z.literal("original"),
            sizeBytes: z
              .number()
              .int()
              .positive()
              .max(8 * 1024 * 1024),
          }),
        )
        .length(1),
    }),
  }),
]);
export type UploadManifest = z.infer<typeof manifestSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export class AssetError extends Error {
  constructor(
    public readonly code:
      | "INVALID_INPUT"
      | "TOO_LARGE"
      | "NOT_FOUND"
      | "CONFLICT"
      | "BUSY"
      | "UNAVAILABLE",
    public readonly uploadId?: string,
  ) {
    super(
      {
        INVALID_INPUT: "The file or upload details are invalid.",
        TOO_LARGE: "The file exceeds an upload limit.",
        NOT_FOUND: "The file is unavailable.",
        CONFLICT: "The upload cannot be completed in its current state.",
        BUSY: "Another file is being processed. Try again shortly.",
        UNAVAILABLE: "The upload is temporarily unavailable.",
      }[code],
    );
    this.name = "AssetError";
  }
}
