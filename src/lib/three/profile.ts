import { z } from "zod";
import { ModelError, modelLimits as limits } from "./contracts";
const n = z.number().int().nonnegative().max(1_000_000);
const byte = z.number().int().nonnegative().max(limits.bytes);
const index = z.number().int().nonnegative().max(4095);
const array = <T extends z.ZodType>(schema: T, maximum = 4096) =>
  z.array(schema).max(maximum).default([]);
const object = z.object({}).passthrough();
const schema = z.object({
  asset: z.object({
    version: z.literal("2.0"),
    minVersion: z.literal("2.0").optional(),
  }),
  scene: index.default(0),
  scenes: array(z.object({ nodes: array(index) })),
  extensionsUsed: array(z.string()),
  extensionsRequired: array(z.string()),
  animations: array(object, 0),
  skins: array(object, 0),
  buffers: array(z.object({ byteLength: byte }), 1),
  bufferViews: array(
    z.object({
      buffer: z.literal(0).default(0),
      byteOffset: byte.default(0),
      byteLength: byte,
      byteStride: n.optional(),
    }),
  ),
  accessors: array(
    z.object({
      bufferView: index.optional(),
      byteOffset: byte.default(0),
      count: n,
      componentType: z.number(),
      type: z.enum(["SCALAR", "VEC2", "VEC3", "VEC4", "MAT2", "MAT3", "MAT4"]),
    }),
  ),
  images: array(
    z.object({
      bufferView: index,
      mimeType: z.enum(["image/png", "image/jpeg"]),
    }),
  ),
  textures: array(z.object({ source: index })),
  materials: array(
    z.object({
      doubleSided: z.boolean().optional(),
      alphaMode: z.enum(["OPAQUE", "MASK", "BLEND"]).optional(),
    }),
  ),
  meshes: array(
    z.object({
      primitives: array(
        z.object({
          mode: z.literal(4).default(4),
          indices: index.optional(),
          attributes: z.object({ POSITION: index }).passthrough(),
          material: index.optional(),
          targets: array(object, 0),
        }),
      ),
    }),
  ),
  nodes: array(z.object({ mesh: index.optional(), children: array(index) })),
});
export type ModelInspection = {
  triangles: number;
  draws: number;
  textureCount: number;
  texturePixels: number;
  geometryBytes: number;
};
const fail = (): never => {
  throw new ModelError();
};
function imageSize(
  bytes: Uint8Array,
  mime: "image/png" | "image/jpeg",
): [number, number] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mime === "image/png") {
    if (
      bytes.length < 33 ||
      view.getUint32(0) !== 0x89504e47 ||
      view.getUint32(4) !== 0x0d0a1a0a ||
      view.getUint32(8) !== 13 ||
      view.getUint32(12) !== 0x49484452
    )
      return fail();
    return [view.getUint32(16), view.getUint32(20)];
  }
  if (bytes.length < 4 || view.getUint16(0) !== 0xffd8) return fail();
  let offset = 2,
    markers = 0;
  const sof = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
  ]);
  while (offset + 4 <= bytes.length && ++markers <= 4096) {
    if (bytes[offset++] !== 0xff) return fail();
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) return fail();
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return fail();
    const size = view.getUint16(offset);
    if (size < 2 || offset + size > bytes.length) return fail();
    if (sof.has(marker)) {
      if (size < 8) return fail();
      return [view.getUint16(offset + 5), view.getUint16(offset + 3)];
    }
    offset += size;
  }
  return fail();
}
// Admission inspects headers/JSON, not image decoders or WebGL. Upload validation remains server-side.
export function inspectModel(bytes: ArrayBuffer): ModelInspection {
  try {
    return inspect(bytes);
  } catch {
    return fail();
  }
}
function inspect(bytes: ArrayBuffer): ModelInspection {
  if (bytes.byteLength < 20 || bytes.byteLength > limits.bytes) return fail();
  const view = new DataView(bytes);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.byteLength ||
    view.getUint32(16, true) !== 0x4e4f534a
  )
    return fail();
  const jsonLength = view.getUint32(12, true),
    binHeader = 20 + jsonLength;
  if (
    !jsonLength ||
    jsonLength > limits.json ||
    jsonLength % 4 ||
    binHeader > bytes.byteLength
  )
    return fail();
  const raw: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(
      new Uint8Array(bytes, 20, jsonLength),
    ),
  );
  let values = 0;
  function visit(value: unknown, depth: number) {
    if (++values > 100_000 || depth > 32) return fail();
    if (Array.isArray(value)) {
      if (value.length > 4096) return fail();
      value.forEach((v) => visit(v, depth + 1));
    } else if (value && typeof value === "object")
      for (const [key, v] of Object.entries(value)) {
        if (key === "uri") return fail();
        if (
          key === "extensions" &&
          (!v ||
            typeof v !== "object" ||
            Object.keys(v).some((name) => name !== "KHR_materials_unlit"))
        )
          return fail();
        visit(v, depth + 1);
      }
    else if (typeof value === "number" && !Number.isFinite(value))
      return fail();
  }
  visit(raw, 0);
  const doc = schema.parse(raw);
  if (
    doc.extensionsRequired.length ||
    doc.extensionsUsed.some((e) => e !== "KHR_materials_unlit") ||
    doc.nodes.length > limits.nodes ||
    doc.materials.length > limits.materials ||
    doc.textures.length > limits.textures ||
    doc.images.length > limits.textures
  )
    return fail();
  if (
    doc.scene >= doc.scenes.length ||
    doc.scenes.some((s, i) => i !== doc.scene && s.nodes.length)
  )
    return fail();
  const binOffset = binHeader + 8;
  if (
    binOffset > bytes.byteLength ||
    view.getUint32(binHeader + 4, true) !== 0x004e4942 ||
    view.getUint32(binHeader, true) % 4 ||
    binOffset + view.getUint32(binHeader, true) !== bytes.byteLength ||
    doc.buffers.length !== 1 ||
    doc.buffers[0].byteLength > bytes.byteLength - binOffset
  )
    return fail();
  for (const b of doc.bufferViews)
    if (
      !b.byteLength ||
      b.byteOffset + b.byteLength > doc.buffers[0].byteLength
    )
      return fail();
  const components = {
    SCALAR: 1,
    VEC2: 2,
    VEC3: 3,
    VEC4: 4,
    MAT2: 4,
    MAT3: 9,
    MAT4: 16,
  };
  let geometryBytes = 0,
    elements = 0;
  for (const a of doc.accessors) {
    if (
      ![5120, 5121, 5122, 5123, 5125, 5126].includes(a.componentType) ||
      !a.count ||
      (a.bufferView !== undefined && !doc.bufferViews[a.bufferView])
    )
      return fail();
    // Four-byte components conservatively cover sparse/deinterleaved allocations.
    geometryBytes += a.count * components[a.type] * 4;
    elements += a.count;
  }
  if (geometryBytes > limits.geometryBytes || elements > 1_000_000)
    return fail();
  const dimensions = doc.images.map((image) => {
    const b = doc.bufferViews[image.bufferView];
    if (!b) return fail();
    const size = imageSize(
      new Uint8Array(bytes, binOffset + b.byteOffset, b.byteLength),
      image.mimeType,
    );
    if (size.some((v) => !v || v > limits.textureEdge)) return fail();
    return size;
  });
  let texturePixels = 0;
  for (const texture of doc.textures) {
    const size = dimensions[texture.source];
    if (!size) return fail();
    texturePixels += size[0] * size[1];
  }
  // Also bound unused embedded images, before the loader has a chance to decode any.
  if (
    dimensions.reduce((sum, [w, h]) => sum + w * h, 0) > limits.pixels ||
    texturePixels > limits.pixels ||
    (texturePixels * 4 * 4) / 3 + 8 * 1024 * 1024 > limits.textureBytes
  )
    return fail();
  let triangles = 0,
    draws = 0;
  const visited = new Set<number>();
  function node(i: number) {
    if (visited.has(i) || !doc.nodes[i]) return fail();
    visited.add(i);
    const entry = doc.nodes[i];
    if (entry.mesh !== undefined) {
      const mesh = doc.meshes[entry.mesh];
      if (!mesh || !mesh.primitives.length) return fail();
      for (const p of mesh.primitives) {
        const position = doc.accessors[p.attributes.POSITION];
        const indices =
          p.indices === undefined ? null : doc.accessors[p.indices];
        const material =
          p.material === undefined ? null : doc.materials[p.material];
        if (
          !position ||
          position.type !== "VEC3" ||
          (p.indices !== undefined &&
            (!indices || indices.type !== "SCALAR")) ||
          (p.material !== undefined && !material)
        )
          return fail();
        const count = indices?.count ?? position.count;
        if (count % 3) return fail();
        triangles += count / 3;
        draws +=
          material?.doubleSided && material.alphaMode === "BLEND" ? 2 : 1;
        if (triangles > limits.triangles || draws > limits.draws) return fail();
      }
    }
    entry.children.forEach(node);
  }
  doc.scenes[doc.scene].nodes.forEach(node);
  if (!triangles || !draws) return fail();
  return {
    triangles,
    draws,
    textureCount: doc.textures.length,
    texturePixels,
    geometryBytes,
  };
}
