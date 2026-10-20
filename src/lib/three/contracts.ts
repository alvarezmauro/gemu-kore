import { z } from "zod";
import {
  artworkResource,
  boxDimensions,
  boxFamily,
  glbSlotTarget,
  packageModelResource,
  boxFaces,
  textureTransform,
  packagingLimits,
} from "./packaging-contracts";
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
    preset: z.enum(["console", "object", "package"]).default("object"),
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
export const packagingPresentation = z
  .strictObject({
    schemaVersion: z.literal(2),
    presentationKey: z.string().min(1).max(300),
    title: z.string().min(1).max(500),
    source: z.string().min(1).max(100),
    description: z.string().max(1000),
    poster: privateImage.nullable(),
    settings: modelSettings,
    content: z.discriminatedUnion("rendererVersion", [
      z.strictObject({
        kind: z.literal("PACKAGING"),
        rendererVersion: z.literal("box-v1"),
        // Version-2 SNES descriptors predating format expansion remain readable.
        familyKey: boxFamily.default("snes-cardboard"),
        componentId: z.uuid(),
        templateId: z.uuid(),
        templateRevision: z.number().int().positive(),
        synthetic: z.boolean(),
        dimensions: boxDimensions,
        slots: z
          .array(
            z.strictObject({
              face: z.number().int().min(0).max(5),
              name: z.string(),
              required: z.boolean(),
              resource: artworkResource.nullable(),
              transform: textureTransform,
            }),
          )
          .length(6),
        artworkComplete: z.boolean(),
      }),
      z.strictObject({
        kind: z.literal("PACKAGING"),
        rendererVersion: z.literal("gltf-slots-v1"),
        familyKey: z.literal("genesis-clamshell"),
        componentId: z.uuid(),
        templateId: z.uuid(),
        templateRevision: z.number().int().positive(),
        synthetic: z.boolean(),
        dimensions: boxDimensions,
        geometry: packageModelResource,
        slots: z
          .array(
            z.strictObject({
              name: z.enum(["FRONT", "BACK", "SPINE"]),
              required: z.literal(true),
              target: glbSlotTarget,
              resource: artworkResource.nullable(),
              transform: textureTransform,
            }),
          )
          .length(3),
        artworkComplete: z.boolean(),
      }),
    ]),
  })
  .superRefine((p, ctx) => {
    const slots = p.content.slots,
      resources = new Map<string, string>();
    let bytes =
        p.content.rendererVersion === "gltf-slots-v1"
          ? p.content.geometry.byteLength
          : 0,
      pixels = 0;
    if (p.content.rendererVersion === "box-v1") {
      const slots = p.content.slots;
      if (
        new Set(slots.map((s) => s.face)).size !== 6 ||
        slots.some(
          (s) =>
            boxFaces[s.face].name !== s.name ||
            boxFaces[s.face].required !== s.required,
        )
      )
        ctx.addIssue({ code: "custom", message: "Invalid box faces" });
    } else {
      const slots = p.content.slots,
        geometryId = p.content.geometry.id;
      if (
        new Set(slots.map((s) => s.name)).size !== 3 ||
        new Set(
          slots.map(
            (s) =>
              `${s.target.nodeIndex}:${s.target.meshIndex}:${s.target.primitiveIndex}`,
          ),
        ).size !== 3 ||
        slots.some((s) => s.resource?.id === geometryId)
      )
        ctx.addIssue({ code: "custom", message: "Invalid authored slots" });
    }
    for (const slot of slots)
      if (slot.resource) {
        const r = slot.resource,
          fingerprint = JSON.stringify(r);
        if (resources.has(r.id) && resources.get(r.id) !== fingerprint)
          ctx.addIssue({
            code: "custom",
            message: "Conflicting artwork resource",
          });
        if (!resources.has(r.id)) {
          resources.set(r.id, fingerprint);
          bytes += r.byteLength;
          pixels += r.width * r.height;
        }
      }
    if (
      bytes > packagingLimits.bytes ||
      pixels > packagingLimits.pixels ||
      p.content.artworkComplete !==
        slots.every((s) => !s.required || s.resource !== null)
    )
      ctx.addIssue({
        code: "custom",
        message: "Artwork exceeds preview limits or completeness is invalid",
      });
  });
export type PackagingPresentation = z.infer<typeof packagingPresentation>;
export type BoxPresentation = PackagingPresentation & {
  content: Extract<
    PackagingPresentation["content"],
    { rendererVersion: "box-v1" }
  >;
};
export const viewerPresentation = z.union([
  modelPresentation,
  packagingPresentation,
]);
export type ViewerPresentation = z.infer<typeof viewerPresentation>;
export type ModelPresentationResult =
  | { status: "success"; data: ViewerPresentation }
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
