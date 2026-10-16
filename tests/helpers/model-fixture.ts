// Original synthetic asymmetric tetrahedron; no downloaded models, artwork or rights assumptions.
export function buildGlb(document: unknown, binary = Buffer.alloc(4)) {
  const raw = Buffer.from(JSON.stringify(document));
  const json = Buffer.concat([
    raw,
    Buffer.alloc((4 - (raw.length % 4)) % 4, 32),
  ]);
  const bin = Buffer.concat([
    binary,
    Buffer.alloc((4 - (binary.length % 4)) % 4),
  ]);
  const bytes = Buffer.alloc(28 + json.length + bin.length);
  bytes.writeUInt32LE(0x46546c67, 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(json.length, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  json.copy(bytes, 20);
  bytes.writeUInt32LE(bin.length, 20 + json.length);
  bytes.writeUInt32LE(0x004e4942, 24 + json.length);
  bin.copy(bytes, 28 + json.length);
  return bytes;
}
export function modelFixture() {
  const positions = new Float32Array([
    -1, -0.5, 0, 1, -0.5, 0, -0.4, 0.8, 0, 0, 0.1, 0.9,
  ]);
  const indices = new Uint16Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3]);
  const binary = Buffer.concat([
    Buffer.from(positions.buffer),
    Buffer.from(indices.buffer),
  ]);
  const document = {
    asset: { version: "2.0", generator: "GemuKore synthetic test fixture" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      {
        buffer: 0,
        byteOffset: positions.byteLength,
        byteLength: indices.byteLength,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 4,
        type: "VEC3",
        min: [-1, -0.5, 0],
        max: [1, 0.8, 0.9],
      },
      { bufferView: 1, componentType: 5123, count: 12, type: "SCALAR" },
    ],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [0.2, 0.45, 0.8, 1],
          metallicFactor: 0.3,
          roughnessFactor: 0.5,
        },
      },
    ],
    meshes: [
      {
        primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }],
      },
    ],
  };
  return { document, binary, bytes: buildGlb(document, binary) };
}
export function texturedFixture(
  image: Buffer,
  mimeType: "image/png" | "image/jpeg" = "image/png",
) {
  const fixture = modelFixture();
  const binary = Buffer.concat([fixture.binary, image]);
  const document = {
    ...fixture.document,
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      ...fixture.document.bufferViews,
      {
        buffer: 0,
        byteOffset: fixture.binary.length,
        byteLength: image.length,
      },
    ],
    images: [{ bufferView: 2, mimeType }],
    textures: [{ source: 0 }],
    materials: [
      {
        pbrMetallicRoughness: {
          ...fixture.document.materials[0].pbrMetallicRoughness,
          baseColorTexture: { index: 0 },
        },
      },
    ],
  };
  return { document, binary, bytes: buildGlb(document, binary) };
}
export const arrayBuffer = (bytes: Uint8Array) => Uint8Array.from(bytes).buffer;
