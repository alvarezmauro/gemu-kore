import { deflateSync } from "node:zlib";
import { buildGlb, modelFixture } from "./model-fixture";
import { pngChunk } from "./png-fixtures";
// Original procedural study meshes and artwork, never catalog/default console assets.
export function modelBenchmark(kind: "plain" | "shiny" | "textured") {
  if (kind === "plain")
    return { bytes: modelFixture().bytes, triangles: 4, pixels: 0 };
  const columns = 256,
    rows = 128,
    vertices = (columns + 1) * (rows + 1);
  const positions = new Float32Array(vertices * 3),
    normals = new Float32Array(vertices * 3),
    uv = new Float32Array(vertices * 2);
  for (let row = 0; row <= rows; row++)
    for (let column = 0; column <= columns; column++) {
      const u = (column / columns) * Math.PI * 2,
        v = (row / rows) * Math.PI * 2,
        vertex = row * (columns + 1) + column;
      positions.set(
        [
          (0.7 + 0.24 * Math.cos(v)) * Math.cos(u),
          0.24 * Math.sin(v),
          (0.7 + 0.24 * Math.cos(v)) * Math.sin(u),
        ],
        vertex * 3,
      );
      normals.set(
        [Math.cos(v) * Math.cos(u), Math.sin(v), Math.cos(v) * Math.sin(u)],
        vertex * 3,
      );
      uv.set([column / columns, row / rows], vertex * 2);
    }
  const indices = new Uint16Array(rows * columns * 6);
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const a = row * (columns + 1) + column,
        b = a + columns + 1;
      indices.set([a, b, a + 1, b, b + 1, a + 1], (row * columns + column) * 6);
    }
  const arrays: Buffer[] = [
    Buffer.from(positions.buffer),
    Buffer.from(normals.buffer),
    Buffer.from(uv.buffer),
    Buffer.from(indices.buffer),
  ];
  let image: Buffer | undefined;
  if (kind === "textured") {
    const edge = 2048,
      header = Buffer.alloc(13),
      pixels = Buffer.alloc((edge * 3 + 1) * edge);
    header.writeUInt32BE(edge);
    header.writeUInt32BE(edge, 4);
    header[8] = 8;
    header[9] = 2;
    for (let y = 0; y < edge; y++)
      for (let x = 0; x < edge; x++) {
        const offset = y * (edge * 3 + 1) + 1 + x * 3,
          tile = (Math.floor(x / 64) + Math.floor(y / 64)) % 2;
        pixels.set(tile ? [60, 130, 210] : [230, 190, 110], offset);
      }
    image = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      pngChunk("IHDR", header),
      pngChunk("IDAT", deflateSync(pixels)),
      pngChunk("IEND", Buffer.alloc(0)),
    ]);
    arrays.push(image);
  }
  let offset = 0;
  const bufferViews = arrays.map((array) => {
    const view = { buffer: 0, byteOffset: offset, byteLength: array.length };
    offset += array.length;
    return view;
  });
  const binary = Buffer.concat(arrays);
  const document = {
    asset: { version: "2.0", generator: "GemuKore original performance study" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    buffers: [{ byteLength: binary.length }],
    bufferViews,
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: vertices,
        type: "VEC3",
        min: [-0.94, -0.24, -0.94],
        max: [0.94, 0.24, 0.94],
      },
      { bufferView: 1, componentType: 5126, count: vertices, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: vertices, type: "VEC2" },
      {
        bufferView: 3,
        componentType: 5123,
        count: indices.length,
        type: "SCALAR",
      },
    ],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
            indices: 3,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      kind === "shiny"
        ? {
            alphaMode: "BLEND",
            doubleSided: true,
            pbrMetallicRoughness: {
              baseColorFactor: [0.3, 0.45, 0.8, 0.6],
              metallicFactor: 0.8,
              roughnessFactor: 0.15,
            },
          }
        : {
            pbrMetallicRoughness: {
              baseColorTexture: { index: 0 },
              metallicFactor: 0,
              roughnessFactor: 0.5,
            },
          },
    ],
    ...(image
      ? {
          images: [{ bufferView: 4, mimeType: "image/png" }],
          textures: [{ source: 0 }],
        }
      : {}),
  };
  return {
    bytes: buildGlb(document, binary),
    triangles: rows * columns * 2,
    pixels: image ? 2048 * 2048 : 0,
  };
}
