import "server-only";
import { z } from "zod";

export const targetSchema = z.discriminatedUnion("kind", [
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
    })
    .strict(),
  z
    .object({
      kind: z.literal("application"),
      role: z.literal("COLLECTION_LOGO"),
    })
    .strict(),
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
export const manifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    data: z
      .object({
        target: targetSchema,
        useId: z.uuid(),
        artifacts: z.array(artifactSchema).min(1).max(3),
      })
      .strict(),
  })
  .strict();
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
