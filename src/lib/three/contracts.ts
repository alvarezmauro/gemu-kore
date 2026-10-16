import { z } from "zod";
const finite = z.number().finite();
const point = z.tuple([finite, finite, finite]);
const privateImage = z
  .object({
    url: z.string().regex(/^\/api\/media\/private\/[0-9a-f-]{36}$/i),
    alt: z.string().max(500),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();
export type ModelPoster = z.infer<typeof privateImage>;
export const modelSettings = z
  .object({
    preset: z.enum(["console", "object"]).default("object"),
    orientation: z
      .tuple([
        finite.min(-Math.PI * 2).max(Math.PI * 2),
        finite.min(-Math.PI * 2).max(Math.PI * 2),
        finite.min(-Math.PI * 2).max(Math.PI * 2),
      ])
      .default([0, 0, 0]),
    scale: finite.min(0.001).max(1000).default(1),
    fov: finite.min(20).max(70).default(35),
    targetOffset: point
      .refine((p) => p.every((v) => Math.abs(v) <= 1))
      .default([0, 0, 0]),
    distanceFactor: finite.min(1).max(3).default(1),
  })
  .strict();
export type ModelSettings = z.infer<typeof modelSettings>;
export const modelPresentation = z
  .object({
    schemaVersion: z.literal(1),
    presentationKey: z.string().min(1).max(300),
    title: z.string().min(1).max(500),
    source: z.string().min(1).max(100),
    description: z.string().max(1000),
    resource: z
      .object({
        id: z.uuid(),
        url: z.string(),
        mimeType: z.literal("model/gltf-binary"),
        byteLength: z
          .number()
          .int()
          .positive()
          .max(50 * 1024 * 1024),
      })
      .strict()
      .refine((r) => r.url === `/api/media/private/${r.id}`),
    poster: privateImage.nullable(),
    settings: modelSettings,
  })
  .strict();
export type ModelPresentation = z.infer<typeof modelPresentation>;
export type ModelPresentationResult =
  | { status: "success"; data: ModelPresentation }
  | { status: "error"; message: string };
export class ModelError extends Error {
  constructor(
    message = "This file cannot be previewed in 3D. Its private download is still available.",
  ) {
    super(message);
    this.name = "ModelError";
  }
}
export const modelLimits = {
  bytes: 8 * 1024 * 1024,
  json: 1024 * 1024,
  triangles: 200_000,
  draws: 80,
  nodes: 256,
  materials: 64,
  textures: 8,
  pixels: 8_000_000,
  textureEdge: 2048,
  geometryBytes: 24 * 1024 * 1024,
  textureBytes: 64 * 1024 * 1024,
  canvasPixels: 2_000_000,
} as const;
