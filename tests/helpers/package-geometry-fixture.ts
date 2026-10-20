import type { BufferGeometry } from "three";
import { buildGlb } from "./model-fixture";
export type FixturePart = {
  name: string;
  geometry: BufferGeometry;
  material: number;
};
export type FixtureMaterial = {
  name: string;
  alphaMode?: "OPAQUE" | "BLEND";
  pbrMetallicRoughness: {
    baseColorFactor: number[];
    metallicFactor: number;
    roughnessFactor: number;
  };
};
export function packageGeometryFixture(
  parts: FixturePart[],
  materials: FixtureMaterial[],
  generator: string,
) {
  const binaryParts: Buffer[] = [],
    bufferViews: {
      buffer: number;
      byteOffset: number;
      byteLength: number;
      target: number;
    }[] = [],
    accessors: {
      bufferView: number;
      componentType: number;
      count: number;
      type: string;
      min?: number[];
      max?: number[];
    }[] = [];
  let offset = 0;
  const add = (
    data: Buffer,
    componentType: number,
    count: number,
    type: string,
    target: number,
    min?: number[],
    max?: number[],
  ) => {
    const padded = Buffer.concat([
      data,
      Buffer.alloc((4 - (data.length % 4)) % 4),
    ]);
    bufferViews.push({
      buffer: 0,
      byteOffset: offset,
      byteLength: data.length,
      target,
    });
    binaryParts.push(padded);
    offset += padded.length;
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType,
      count,
      type,
      ...(min ? { min, max } : {}),
    });
    return accessors.length - 1;
  };
  const meshes = parts.map(({ geometry, material }) => {
    // One primitive per part; clear Three's face groups used only for extrusion.
    const attributes: Record<string, number> = {};
    for (const [name, semantic] of [
      ["position", "POSITION"],
      ["normal", "NORMAL"],
      ["uv", "TEXCOORD_0"],
    ]) {
      const attr = geometry.getAttribute(name),
        values = Float32Array.from(attr.array),
        min = Array.from({ length: attr.itemSize }, (_, i) =>
          Math.min(
            ...Array.from(values).filter((_, j) => j % attr.itemSize === i),
          ),
        ),
        max = Array.from({ length: attr.itemSize }, (_, i) =>
          Math.max(
            ...Array.from(values).filter((_, j) => j % attr.itemSize === i),
          ),
        );
      attributes[semantic] = add(
        Buffer.from(values.buffer),
        5126,
        attr.count,
        attr.itemSize === 2 ? "VEC2" : "VEC3",
        34962,
        semantic === "POSITION" ? min : undefined,
        semantic === "POSITION" ? max : undefined,
      );
    }
    const index = geometry.index,
      indices = index
        ? add(
            Buffer.from(Uint16Array.from(index.array).buffer),
            5123,
            index.count,
            "SCALAR",
            34963,
          )
        : undefined;
    geometry.dispose();
    return {
      primitives: [
        { attributes, material, ...(indices === undefined ? {} : { indices }) },
      ],
    };
  });
  const binary = Buffer.concat(binaryParts);
  const document = {
    asset: {
      version: "2.0",
      generator,
    },
    scene: 0,
    scenes: [{ nodes: parts.map((_, i) => i) }],
    nodes: parts.map((p, i) => ({ name: p.name, mesh: i })),
    meshes,
    materials,
    buffers: [{ byteLength: binary.length }],
    bufferViews,
    accessors,
  };
  return { document, binary, bytes: buildGlb(document, binary) };
}
