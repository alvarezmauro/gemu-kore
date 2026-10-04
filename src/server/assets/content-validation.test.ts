import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { monochromePng } from "../../../tests/helpers/png-fixtures";
import { beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  prepareUpload,
  uploadDescription,
  IMAGE_LIMIT,
  MODEL_LIMIT,
} from "./processing";
const formats = [
  { format: "jpeg", mime: "image/jpeg", ext: "jpg" },
  { format: "png", mime: "image/png", ext: "png" },
  { format: "webp", mime: "image/webp", ext: "webp" },
  { format: "avif", mime: "image/avif", ext: "avif" },
] as const;
const images = new Map<string, Buffer>();
function body(bytes: Uint8Array) {
  return new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes);
      c.close();
    },
  });
}
function prepare(
  bytes: Uint8Array,
  mime: string,
  ext: string,
  signal = AbortSignal.timeout(5000),
) {
  return prepareUpload(
    body(bytes),
    uploadDescription(mime, `file.${ext}`),
    randomUUID(),
    signal,
  );
}
beforeAll(async () => {
  for (const entry of formats)
    images.set(
      entry.mime,
      await sharp({
        create: { width: 4, height: 2, channels: 3, background: "blue" },
      })
        .toFormat(entry.format)
        .toBuffer(),
    );
});
for (const source of formats)
  for (const declared of formats.filter((f) => f.mime !== source.mime)) {
    it(`rejects decoded ${source.format} bytes declared as ${declared.mime}`, async () => {
      await expect(
        prepare(images.get(source.mime)!, declared.mime, declared.ext),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    });
  }
it.each([
  ["image/jpeg", "jpg", Buffer.from([0xff, 0xd8, 0xff])],
  ["image/png", "png", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
  ["image/webp", "webp", Buffer.from("RIFF0000WEBP")],
  ["image/avif", "avif", Buffer.from("\x00\x00\x00\x18ftypavif")],
  ["model/gltf-binary", "glb", Buffer.from("glTF")],
] as const)(
  "rejects a plausible %s signature without a decodable file",
  async (mime, ext, bytes) => {
    await expect(prepare(bytes, mime, ext)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  },
);
it.each([
  Buffer.alloc(0),
  Buffer.from("<html>private source text</html>"),
  Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"),
  Buffer.from('{"asset":{"version":"2.0"}}'),
  Buffer.from("GIF89a"),
])("rejects unsupported content disguised as JPEG: %j", async (bytes) => {
  await expect(prepare(bytes, "image/jpeg", "jpg")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
});
it("rejects an incomplete image that still has enough bytes for header inspection", async () => {
  const bytes = await sharp({
    create: { width: 300, height: 300, channels: 3, background: "blue" },
  })
    .jpeg()
    .toBuffer();
  const truncated = bytes.subarray(0, bytes.length - 80);
  expect((await sharp(truncated).metadata()).width).toBe(300);
  await expect(prepare(truncated, "image/jpeg", "jpg")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
});
it("rejects a real multi-frame WebP instead of quietly using its first frame", async () => {
  const pixels = Buffer.alloc(4 * 8 * 3, 255);
  pixels.fill(0, 4 * 4 * 3);
  const animated = await sharp(pixels, {
    raw: { width: 4, height: 8, channels: 3, pageHeight: 4 },
  })
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer();
  expect((await sharp(animated).metadata()).pages).toBe(2);
  await expect(prepare(animated, "image/webp", "webp")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
});
it.each([
  ["image/png", "png", IMAGE_LIMIT],
  ["model/gltf-binary", "glb", MODEL_LIMIT],
] as const)(
  "counts chunked %s bytes beyond its limit even without content length",
  async (mime, ext, limit) => {
    let emitted = 0;
    const chunk = Buffer.alloc(64 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (emitted <= limit) {
          c.enqueue(chunk);
          emitted += chunk.length;
        } else c.close();
      },
    });
    await expect(
      prepareUpload(
        stream,
        uploadDescription(mime, `file.${ext}`),
        randomUUID(),
        AbortSignal.timeout(5000),
      ),
    ).rejects.toMatchObject({ code: "TOO_LARGE" });
  },
);
it("preserves domain cancellation and does not expose a private abort reason", async () => {
  const abort = new AbortController();
  abort.abort(new Error("private abort information"));
  const error = await prepare(
    images.get("image/png")!,
    "image/png",
    "png",
    abort.signal,
  ).catch((e: unknown) => e);
  expect(error).toMatchObject({ code: "UNAVAILABLE" });
  expect(String(error)).not.toContain("private abort information");
});
it("normalizes an interrupted source error without revealing upstream details", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.error(new Error("private stream content"));
    },
  });
  const error = await prepareUpload(
    stream,
    uploadDescription("image/png", "file.png"),
    randomUUID(),
    AbortSignal.timeout(5000),
  ).catch((e: unknown) => e);
  expect(error).toMatchObject({ code: "INVALID_INPUT" });
  expect(String(error)).not.toContain("private stream content");
});

it("rejects a compact valid PNG whose decoded pixel count exceeds the budget", async () => {
  const bytes = monochromePng(64001, 1000);
  expect(bytes.length).toBeLessThan(100000);
  expect(await sharp(bytes).metadata()).toMatchObject({
    width: 64001,
    height: 1000,
    format: "png",
  });
  await expect(prepare(bytes, "image/png", "png")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
});
