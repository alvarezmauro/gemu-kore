import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { prepareUpload, uploadDescription, IMAGE_LIMIT } from "./processing";
const body = (bytes: Uint8Array) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes);
      c.close();
    },
  });
function glb(doc: unknown) {
  const raw = Buffer.from(JSON.stringify(doc));
  const json = Buffer.concat([
    raw,
    Buffer.alloc((4 - (raw.length % 4)) % 4, 32),
  ]);
  const result = Buffer.alloc(20 + json.length);
  result.writeUInt32LE(0x46546c67, 0);
  result.writeUInt32LE(2, 4);
  result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(json.length, 12);
  result.writeUInt32LE(0x4e4f534a, 16);
  json.copy(result, 20);
  return result;
}
it("accepts a bounded self-contained GLB and preserves bytes", async () => {
  const bytes = glb({ asset: { version: "2.0" }, scenes: [{}], scene: 0 });
  const upload = await prepareUpload(
    body(bytes),
    uploadDescription("model/gltf-binary", "model.glb"),
    randomUUID(),
    AbortSignal.timeout(5000),
  );
  try {
    expect(upload.artifacts).toHaveLength(1);
    expect(await readFile(upload.artifacts[0].path)).toEqual(bytes);
  } finally {
    await upload.cleanup();
  }
});
it.each([
  {
    asset: { version: "2.0" },
    buffers: [{ byteLength: 8, uri: "https://example.com/model.bin" }],
  },
  {
    asset: { version: "2.0" },
    buffers: [
      {
        byteLength: 8,
        uri: "data:application/octet-stream;base64,AAAAAAAAAAA=",
      },
    ],
  },
  {
    asset: { version: "2.0" },
    extensionsRequired: ["KHR_draco_mesh_compression"],
  },
  { asset: { version: "2.0" }, accessors: [{ count: 1000001 }] },
  { asset: { version: "1.0" } },
])(
  "rejects external resources, unsupported decoding and invalid model bounds: %j",
  async (doc) => {
    await expect(
      prepareUpload(
        body(glb(doc)),
        uploadDescription("model/gltf-binary", "model.glb"),
        randomUUID(),
        AbortSignal.timeout(5000),
      ),
    ).rejects.toBeInstanceOf(Error);
  },
);
it("bounds actual streamed bytes without trusting content length", async () => {
  await expect(
    prepareUpload(
      body(Buffer.alloc(IMAGE_LIMIT + 1)),
      uploadDescription("image/png", "file.png"),
      randomUUID(),
      AbortSignal.timeout(5000),
    ),
  ).rejects.toMatchObject({ code: "TOO_LARGE" });
});
it("rejects valid images whose content differs from the declared MIME", async () => {
  const png = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  await expect(
    prepareUpload(
      body(png),
      uploadDescription("image/jpeg", "file.jpg"),
      randomUUID(),
      AbortSignal.timeout(5000),
    ),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
it("rejects APNG animation markers even when the decoder would show only the first frame", async () => {
  const png = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const chunk = Buffer.alloc(20);
  chunk.writeUInt32BE(8);
  chunk.write("acTL", 4);
  chunk.writeUInt32BE(2, 8);
  const animated = Buffer.concat([
    png.subarray(0, 33),
    chunk,
    png.subarray(33),
  ]);
  await expect(
    prepareUpload(
      body(animated),
      uploadDescription("image/png", "animation.png"),
      randomUUID(),
      AbortSignal.timeout(5000),
    ),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
