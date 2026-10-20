import { z } from "zod";

// Explicit supported contracts, never inferred from a release/platform name.
// Dimensions and variant suitability still require curator evidence.
export const boxFamily = z.enum(["nes-cardboard", "snes-cardboard"]);
export type BoxFamily = z.infer<typeof boxFamily>;
export const boxFormatLabels: Record<BoxFamily, string> = {
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
  .refine((r) => r.url === `/api/media/private/${r.id}`);
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
