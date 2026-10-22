import { z } from "zod";
import { resourceUrl } from "./resource-url";

// Explicit supported contracts, never inferred from a release/platform name.
// Dimensions and variant suitability still require curator evidence.
export const boxFamily = z.enum(["nes-cardboard", "snes-cardboard"]);
export type BoxFamily = z.infer<typeof boxFamily>;
export const authoredFamily = z.enum([
  "genesis-clamshell",
  "playstation-jewel",
  "ps2-dvd",
  "switch-case",
]);
export type AuthoredFamily = z.infer<typeof authoredFamily>;
export const authoredShapeLabels: Record<AuthoredFamily, string> = {
  "genesis-clamshell": "clamshell",
  "playstation-jewel": "jewel case",
  "ps2-dvd": "DVD case",
  "switch-case": "Switch case",
};
export const packagingFamily = z.enum([
  ...boxFamily.options,
  ...authoredFamily.options,
]);
export type PackagingFamily = z.infer<typeof packagingFamily>;
export const boxFormatLabels: Record<PackagingFamily, string> = {
  "genesis-clamshell": "Genesis clamshell",
  "playstation-jewel": "PlayStation jewel case",
  "ps2-dvd": "PS2 DVD case",
  "switch-case": "Switch case",
  "nes-cardboard": "NES cardboard box",
  "snes-cardboard": "SNES cardboard box",
};

export const boxFaces = [
  { face: 0, name: "EDGE_POS_X", label: "Opposite edge", required: false },
  { face: 1, name: "SPINE", label: "Spine", required: true },
  { face: 2, name: "TOP", label: "Top", required: false },
  { face: 3, name: "BOTTOM", label: "Bottom", required: false },
  { face: 4, name: "FRONT", label: "Front", required: true },
  { face: 5, name: "BACK", label: "Back", required: true },
] as const;
const mm = z.number().finite().min(0.1).max(2000);
export const boxDimensions = z.strictObject({
  schemaVersion: z.literal(1),
  widthMm: mm,
  heightMm: mm,
  depthMm: mm,
});
export const textureTransform = z.strictObject({
  schemaVersion: z.literal(1),
  crop: z
    .strictObject({
      x: z.number().finite().min(0).max(1),
      y: z.number().finite().min(0).max(1),
      width: z.number().finite().positive().max(1),
      height: z.number().finite().positive().max(1),
    })
    .refine(
      (c) => c.x + c.width <= 1 && c.y + c.height <= 1,
      "Keep the crop inside the image.",
    ),
  quarterTurns: z.number().int().min(0).max(3),
});
export const fullArtwork = {
  schemaVersion: 1,
  crop: { x: 0, y: 0, width: 1, height: 1 },
  quarterTurns: 0,
} as const;
export type TextureTransform = z.infer<typeof textureTransform>;
export const packagingLimits = {
  bytes: 12 * 1024 * 1024,
  imageBytes: 2 * 1024 * 1024,
  edge: 2048,
  outputEdge: 1024,
  pixels: 8_000_000,
} as const;
export const artworkResource = z
  .strictObject({
    id: z.uuid(),
    url: z.string(),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    byteLength: z.number().int().positive().max(packagingLimits.imageBytes),
    width: z.number().int().positive().max(packagingLimits.edge),
    height: z.number().int().positive().max(packagingLimits.edge),
  })
  .refine((r) => resourceUrl(r.id, r.url));
export type ArtworkResource = z.infer<typeof artworkResource>;

// The geometry uses physical aspect; output stays within the preview/source budget.
export function artworkLayout(
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number,
  transform: TextureTransform,
) {
  if (
    ![width, height, targetWidth, targetHeight].every(
      (v) => Number.isFinite(v) && v > 0,
    )
  )
    throw new Error("Invalid artwork dimensions");
  const { crop, quarterTurns } = textureTransform.parse(transform);
  const cw = width * crop.width,
    ch = height * crop.height;
  if (cw < 1 || ch < 1) throw new Error("Crop is smaller than one pixel");
  const rw = quarterTurns % 2 ? ch : cw,
    rh = quarterTurns % 2 ? cw : ch;
  const aspect = targetWidth / targetHeight;
  const edge = Math.min(packagingLimits.outputEdge, Math.max(rw, rh));
  const outputWidth = Math.max(
    1,
    Math.round(aspect >= 1 ? edge : edge * aspect),
  );
  const outputHeight = Math.max(
    1,
    Math.round(aspect >= 1 ? edge / aspect : edge),
  );
  const scale = Math.min(1, outputWidth / rw, outputHeight / rh);
  return {
    sourceX: crop.x * width,
    sourceY: crop.y * height,
    sourceWidth: cw,
    sourceHeight: ch,
    outputWidth,
    outputHeight,
    drawWidth: rw * scale,
    drawHeight: rh * scale,
  };
}
export function faceSize(
  face: number,
  d: z.infer<typeof boxDimensions>,
): [number, number] {
  return face < 2
    ? [d.depthMm, d.heightMm]
    : face < 4
      ? [d.widthMm, d.depthMm]
      : [d.widthMm, d.heightMm];
}

const glbIndex = z.number().int().min(0).max(4095);
export const glbSlotTarget = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal("GLB_PRIMITIVE"),
  sceneIndex: z.literal(0),
  nodeIndex: glbIndex,
  meshIndex: glbIndex,
  primitiveIndex: glbIndex,
  materialIndex: glbIndex,
  uvChannel: z.literal(0),
  nodeName: z.string().min(1).max(200),
  materialName: z.string().min(1).max(200),
  artWidthMm: mm,
  artHeightMm: mm,
});
export type GlbSlotTarget = z.infer<typeof glbSlotTarget>;
export const clamshellSlot = z.strictObject({
  name: z.enum(["FRONT", "BACK", "SPINE"]),
  target: glbSlotTarget,
});
export const clamshellSlots = z
  .array(clamshellSlot)
  .length(3)
  .refine(
    (slots) =>
      new Set(slots.map((s) => s.name)).size === 3 &&
      new Set(
        slots.map(
          (s) =>
            `${s.target.nodeIndex}:${s.target.meshIndex}:${s.target.primitiveIndex}`,
        ),
      ).size === 3,
    "Choose three distinct front, back and spine primitives.",
  );
export const authoredSlotName = z.enum([
  "FRONT",
  "BACK",
  "SPINE",
  "OPPOSITE_SPINE",
]);
export const jewelSlots = z
  .array(z.strictObject({ name: authoredSlotName, target: glbSlotTarget }))
  .length(4)
  .refine(
    (slots) =>
      new Set(slots.map((s) => s.name)).size === 4 &&
      new Set(
        slots.map(
          (s) =>
            `${s.target.nodeIndex}:${s.target.meshIndex}:${s.target.primitiveIndex}`,
        ),
      ).size === 4,
    "Choose distinct front, back and both spine primitives.",
  );
export function authoredSlots(
  family: AuthoredFamily,
): z.ZodType<
  { name: z.infer<typeof authoredSlotName>; target: GlbSlotTarget }[]
> {
  return family === "playstation-jewel" ? jewelSlots : clamshellSlots;
}
export function requiredAuthoredSlot(name: z.infer<typeof authoredSlotName>) {
  return name !== "OPPOSITE_SPINE";
}
export const packageModelResource = z
  .strictObject({
    id: z.uuid(),
    url: z.string(),
    mimeType: z.literal("model/gltf-binary"),
    byteLength: z
      .number()
      .int()
      .positive()
      .max(8 * 1024 * 1024),
  })
  .refine((r) => resourceUrl(r.id, r.url));

export type PackageModelResource = z.infer<typeof packageModelResource>;
