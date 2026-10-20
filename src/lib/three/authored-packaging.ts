import { Box3, Matrix4, Quaternion, Vector3 } from "three";
import { z } from "zod";
import { inspectModel } from "./profile";
import { ModelError } from "./contracts";
import {
  boxDimensions,
  authoredFamily,
  authoredSlots,
  type AuthoredFamily,
} from "./packaging-contracts";
const finite = z.number().finite();
const index = z.number().int().nonnegative().max(4095);
const vector = z.tuple([finite, finite, finite]);
const docSchema = z.object({
  scene: z.literal(0).default(0),
  scenes: z.array(z.object({ nodes: z.array(index) })).length(1),
  nodes: z.array(
    z.object({
      name: z.string().optional(),
      mesh: index.optional(),
      children: z.array(index).default([]),
      matrix: z.array(finite).length(16).optional(),
      translation: vector.optional(),
      rotation: z.tuple([finite, finite, finite, finite]).optional(),
      scale: vector.optional(),
    }),
  ),
  meshes: z.array(
    z.object({
      primitives: z.array(
        z.object({
          attributes: z.strictObject({
            POSITION: index,
            NORMAL: index.optional(),
            TEXCOORD_0: index.optional(),
          }),
          indices: index.optional(),
          material: index,
        }),
      ),
    }),
  ),
  materials: z.array(
    z.object({
      name: z.string().optional(),
      doubleSided: z.boolean().optional(),
      alphaMode: z.enum(["OPAQUE", "MASK", "BLEND"]).default("OPAQUE"),
      emissiveFactor: vector.optional(),
      pbrMetallicRoughness: z
        .object({
          baseColorFactor: z.tuple([finite, finite, finite, finite]).optional(),
          metallicFactor: finite.min(0).max(1).optional(),
          roughnessFactor: finite.min(0).max(1).optional(),
        })
        .optional(),
    }),
  ),
  buffers: z
    .array(z.object({ byteLength: z.number().int().positive() }))
    .length(1),
  bufferViews: z.array(
    z.object({
      buffer: z.literal(0).default(0),
      byteOffset: z.number().int().nonnegative().default(0),
      byteLength: z.number().int().positive(),
      byteStride: z.number().int().positive().optional(),
    }),
  ),
  accessors: z.array(
    z.object({
      bufferView: index,
      byteOffset: z.number().int().nonnegative().default(0),
      componentType: z.number().int(),
      count: z.number().int().positive(),
      type: z.enum(["SCALAR", "VEC2", "VEC3"]),
      normalized: z.literal(false).optional(),
      sparse: z.never().optional(),
    }),
  ),
});
const fail = (): never => {
  throw new ModelError(
    "Check the authored model's dimensions, neutral art planes and explicit slot mappings.",
  );
};
// A deliberately narrow first authored profile: static PBR geometry, no embedded
// images, custom extensions/extras or alternate scenes. Artwork has its own path.
export function inspectAuthoredPackage(
  bytes: ArrayBuffer,
  dimensionsInput: unknown,
  slotsInput: unknown,
  familyInput: AuthoredFamily = "genesis-clamshell",
) {
  const inspection = inspectModel(bytes),
    dimensions = boxDimensions.parse(dimensionsInput),
    family = authoredFamily.parse(familyInput),
    slots = authoredSlots(family).parse(slotsInput);
  const view = new DataView(bytes),
    jsonLength = view.getUint32(12, true),
    binOffset = 28 + jsonLength;
  const raw: unknown = JSON.parse(
    new TextDecoder().decode(new Uint8Array(bytes, 20, jsonLength)),
  );
  function boundedProfile(value: unknown) {
    if (Array.isArray(value)) {
      for (const item of value) boundedProfile(item);
      return;
    }
    if (value && typeof value === "object")
      for (const [key, item] of Object.entries(value)) {
        if (
          [
            "images",
            "textures",
            "samplers",
            "extensionsUsed",
            "extensionsRequired",
            "cameras",
          ].includes(key) &&
          (!Array.isArray(item) || item.length)
        )
          fail();
        if (
          ["extensions", "extras"].includes(key) &&
          item &&
          Object.keys(item).length
        )
          fail();
        boundedProfile(item);
      }
  }
  boundedProfile(raw);
  const doc = docSchema.parse(raw);
  if (
    doc.materials.length + slots.length > 64 ||
    doc.materials.some(
      (m) =>
        (m.alphaMode !== "OPAQUE" &&
          !(
            family === "playstation-jewel" &&
            m.alphaMode === "BLEND" &&
            (m.pbrMetallicRoughness?.baseColorFactor?.[3] ?? 1) >= 0.05 &&
            (m.pbrMetallicRoughness?.baseColorFactor?.[3] ?? 1) <= 0.8 &&
            (m.pbrMetallicRoughness?.metallicFactor ?? 1) === 0 &&
            !m.emissiveFactor?.some((v) => v !== 0)
          )) ||
        m.doubleSided ||
        m.pbrMetallicRoughness?.baseColorFactor?.some((v) => v < 0 || v > 1) ||
        (m.alphaMode === "OPAQUE" &&
          (m.pbrMetallicRoughness?.baseColorFactor?.[3] ?? 1) !== 1),
    )
  )
    fail();
  function accessor(id: number, components: number) {
    const a = doc.accessors[id],
      b = a && doc.bufferViews[a.bufferView];
    const sizes: Record<number, number> = {
      5121: 1,
      5123: 2,
      5125: 4,
      5126: 4,
    };
    if (
      !a ||
      !b ||
      !sizes[a.componentType] ||
      a.type !==
        (components === 3 ? "VEC3" : components === 2 ? "VEC2" : "SCALAR") ||
      (components > 1 && a.componentType !== 5126) ||
      (components === 1 && a.componentType === 5126)
    )
      fail();
    const componentSize = sizes[a.componentType],
      stride = b.byteStride ?? componentSize * components,
      start = b.byteOffset + a.byteOffset;
    if (
      stride < componentSize * components ||
      start + (a.count - 1) * stride + components * componentSize >
        b.byteOffset + b.byteLength ||
      start + (a.count - 1) * stride + components * componentSize >
        doc.buffers[0].byteLength
    )
      fail();
    const read = (i: number, k: number) => {
      if (i < 0 || i >= a.count) fail();
      const offset = binOffset + start + i * stride + k * componentSize;
      const n =
        a.componentType === 5126
          ? view.getFloat32(offset, true)
          : a.componentType === 5125
            ? view.getUint32(offset, true)
            : a.componentType === 5123
              ? view.getUint16(offset, true)
              : view.getUint8(offset);
      if (!Number.isFinite(n)) fail();
      return n;
    };
    return { count: a.count, read };
  }
  let transparentDraws = 0;
  const worlds = new Map<number, Matrix4>(),
    bounds = new Box3();
  function node(id: number, parent: Matrix4) {
    if (worlds.has(id)) fail();
    const n = doc.nodes[id];
    if (!n) fail();
    const local = new Matrix4();
    if (n.matrix) {
      if (
        n.translation ||
        n.rotation ||
        n.scale ||
        n.matrix[3] ||
        n.matrix[7] ||
        n.matrix[11] ||
        n.matrix[15] !== 1
      )
        fail();
      local.fromArray(n.matrix);
    } else {
      const q = new Quaternion(...(n.rotation ?? [0, 0, 0, 1]));
      if (Math.abs(q.length() - 1) > 0.001 || n.scale?.some((v) => v <= 0))
        fail();
      local.compose(
        new Vector3(...(n.translation ?? [0, 0, 0])),
        q,
        new Vector3(...(n.scale ?? [1, 1, 1])),
      );
    }
    const world = parent.clone().multiply(local);
    if (!Number.isFinite(world.determinant()) || world.determinant() <= 0)
      fail();
    worlds.set(id, world);
    if (n.mesh !== undefined) {
      const mesh = doc.meshes[n.mesh];
      if (!mesh) fail();
      for (const p of mesh.primitives) {
        if (
          doc.materials[p.material]?.alphaMode === "BLEND" &&
          ++transparentDraws > 8
        )
          fail();
        const positions = accessor(p.attributes.POSITION, 3);
        for (let i = 0; i < positions.count; i++)
          bounds.expandByPoint(
            new Vector3(
              positions.read(i, 0),
              positions.read(i, 1),
              positions.read(i, 2),
            ).applyMatrix4(world!),
          );
      }
    }
    for (const child of n.children) node(child, world);
  }
  for (const id of doc.scenes[0].nodes) node(id, new Matrix4());
  const close = (actual: number, mm: number) =>
    Math.abs(actual - mm / 1000) <= Math.max(0.001, (mm / 1000) * 0.02);
  const size = bounds.getSize(new Vector3());
  if (
    size.toArray().some((v) => !Number.isFinite(v) || v <= 0) ||
    ![dimensions.widthMm, dimensions.heightMm, dimensions.depthMm].every(
      (mm, i) => close(size.getComponent(i), mm),
    )
  )
    fail();
  for (const slot of slots) {
    const t = slot.target,
      n = doc.nodes[t.nodeIndex],
      world = worlds.get(t.nodeIndex),
      p = doc.meshes[t.meshIndex]?.primitives[t.primitiveIndex],
      m = doc.materials[t.materialIndex];
    if (
      !n ||
      !world ||
      n.mesh !== t.meshIndex ||
      n.name !== t.nodeName ||
      !p ||
      p.material !== t.materialIndex ||
      !m ||
      m.name !== t.materialName ||
      m.alphaMode !== "OPAQUE" ||
      m.doubleSided ||
      m.emissiveFactor?.some((v) => v !== 0) ||
      m.pbrMetallicRoughness?.baseColorFactor?.some((v) => v !== 1) ||
      p.attributes.TEXCOORD_0 === undefined
    )
      fail();
    const position = accessor(p.attributes.POSITION, 3),
      uv = accessor(p.attributes.TEXCOORD_0!, 2),
      indices = p.indices === undefined ? null : accessor(p.indices, 1);
    if (position.count !== uv.count || (indices?.count ?? position.count) !== 6)
      fail();
    const corners = new Map<string, Vector3>(),
      triangleIndices = Array.from({ length: 6 }, (_, i) =>
        indices ? indices.read(i, 0) : i,
      );
    let uvArea = 0;
    for (const i of triangleIndices) {
      if (!Number.isInteger(i) || i >= position.count) fail();
      const u = uv.read(i, 0),
        v = uv.read(i, 1);
      if (![u, v].every((x) => Math.abs(x) < 1e-6 || Math.abs(x - 1) < 1e-6))
        fail();
      const key = `${Math.round(u)},${Math.round(v)}`,
        point = new Vector3(
          position.read(i, 0),
          position.read(i, 1),
          position.read(i, 2),
        ).applyMatrix4(world!),
        previous = corners.get(key);
      if (previous && previous.distanceTo(point) > 1e-7) fail();
      corners.set(key, point);
    }
    if (corners.size !== 4) fail();
    const first = new Set(
        triangleIndices
          .slice(0, 3)
          .map(
            (i) => `${Math.round(uv.read(i, 0))},${Math.round(uv.read(i, 1))}`,
          ),
      ),
      second = new Set(
        triangleIndices
          .slice(3)
          .map(
            (i) => `${Math.round(uv.read(i, 0))},${Math.round(uv.read(i, 1))}`,
          ),
      ),
      shared = [...first].filter((key) => second.has(key));
    if (
      first.size !== 3 ||
      second.size !== 3 ||
      shared.length !== 2 ||
      shared[0].split(",").some((v, i) => v === shared[1].split(",")[i])
    )
      fail();
    const origin = corners.get("0,0")!,
      right = corners.get("1,0")!.clone().sub(origin),
      down = corners.get("0,1")!.clone().sub(origin);
    if (
      !close(right.length(), t.artWidthMm) ||
      !close(down.length(), t.artHeightMm) ||
      Math.abs(right.clone().normalize().dot(down.clone().normalize())) >
        1e-4 ||
      corners.get("1,1")!.distanceTo(origin.clone().add(right).add(down)) > 1e-7
    )
      fail();
    const expectedRight = new Vector3(
        ...(slot.name === "FRONT"
          ? ([1, 0, 0] as const)
          : slot.name === "BACK"
            ? ([-1, 0, 0] as const)
            : slot.name === "OPPOSITE_SPINE"
              ? ([0, 0, -1] as const)
              : ([0, 0, 1] as const)),
      ),
      expectedNormal = new Vector3(
        ...(slot.name === "FRONT"
          ? ([0, 0, 1] as const)
          : slot.name === "BACK"
            ? ([0, 0, -1] as const)
            : slot.name === "OPPOSITE_SPINE"
              ? ([1, 0, 0] as const)
              : ([-1, 0, 0] as const)),
      );
    if (
      right.clone().normalize().dot(expectedRight) < 0.999 ||
      down
        .clone()
        .normalize()
        .negate()
        .dot(new Vector3(0, 1, 0)) < 0.999
    )
      fail();
    for (let j = 0; j < 6; j += 3) {
      const ids = triangleIndices.slice(j, j + 3),
        points = ids.map((i) =>
          new Vector3(
            position.read(i, 0),
            position.read(i, 1),
            position.read(i, 2),
          ).applyMatrix4(world!),
        );
      const normal = points[1]
        .clone()
        .sub(points[0])
        .cross(points[2].clone().sub(points[0]));
      if (
        normal.length() < 1e-12 ||
        normal.normalize().dot(expectedNormal) < 0.999
      )
        fail();
      uvArea +=
        Math.abs(
          (uv.read(ids[1], 0) - uv.read(ids[0], 0)) *
            (uv.read(ids[2], 1) - uv.read(ids[0], 1)) -
            (uv.read(ids[2], 0) - uv.read(ids[0], 0)) *
              (uv.read(ids[1], 1) - uv.read(ids[0], 1)),
        ) / 2;
    }
    if (Math.abs(uvArea - 1) > 1e-6) fail();
  }
  return inspection;
}
