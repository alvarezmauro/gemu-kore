import { afterEach, expect, it, vi } from "vitest";
import sharp from "sharp";
import { fetchArtwork, inspectArtwork } from "./artwork-bytes";
import type { ArtworkResource } from "./packaging-contracts";
import { monochromePng, pngChunk } from "../../../tests/helpers/png-fixtures";
const resource = (
  bytes: Uint8Array,
  mimeType: ArtworkResource["mimeType"] = "image/png",
): ArtworkResource => {
  const id = crypto.randomUUID();
  return {
    id,
    url: `/api/media/private/${id}`,
    mimeType,
    byteLength: bytes.length,
    width: 32,
    height: 16,
  };
};
afterEach(() => vi.unstubAllGlobals());
it("preflights genuine static PNG, JPEG and WebP headers and rejects dimensions before decoding", async () => {
  for (const format of ["png", "jpeg", "webp"] as const) {
    const bytes = await sharp({
      create: { width: 32, height: 16, channels: 3, background: "red" },
    })
      [format]()
      .toBuffer();
    const r = resource(bytes, `image/${format}`);
    expect(inspectArtwork(bytes, r)).toEqual([32, 16]);
    expect(() => inspectArtwork(bytes, { ...r, width: 999 })).toThrow();
    expect(() => inspectArtwork(bytes.subarray(1), r)).toThrow();
  }
});
it("rejects animated PNG and WebP and truncated chunks before image decoding", async () => {
  const png = monochromePng(32, 16),
    animated = Buffer.concat([
      png.subarray(0, 33),
      pngChunk("acTL", Buffer.alloc(8)),
      png.subarray(33),
    ]);
  expect(() => inspectArtwork(animated, resource(animated))).toThrow();
  const webp = await sharp({
    create: { width: 32, height: 16, channels: 3, background: "red" },
  })
    .webp()
    .toBuffer();
  const animation = Buffer.concat([
    webp,
    Buffer.from([65, 78, 73, 77, 0, 0, 0, 0]),
  ]);
  animation.writeUInt32LE(animation.length - 8, 4);
  expect(() =>
    inspectArtwork(animation, resource(animation, "image/webp")),
  ).toThrow();
  const short = png.subarray(0, png.length - 1);
  expect(() => inspectArtwork(short, resource(short))).toThrow();
});
it("requires same-origin descriptors, exact MIME and streamed byte bounds; closes rejected readers", async () => {
  const bytes = monochromePng(32, 16),
    r = resource(bytes),
    progress = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(bytes, {
          headers: {
            "Content-Type": "image/png",
            "Content-Length": String(bytes.length),
          },
        }),
    ),
  );
  expect(await fetchArtwork(r, new AbortController().signal, progress)).toEqual(
    new Uint8Array(bytes),
  );
  expect(progress).toHaveBeenCalled();
  await expect(
    fetchArtwork(
      { ...r, url: "https://other.example/art" },
      new AbortController().signal,
      progress,
    ),
  ).rejects.toThrow();
  const cancel = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new Uint8Array(bytes.length + 1));
            },
            cancel,
          }),
          {
            headers: {
              "Content-Type": "image/png",
              "Content-Length": String(bytes.length),
            },
          },
        ),
    ),
  );
  await expect(
    fetchArtwork(r, new AbortController().signal, progress),
  ).rejects.toThrow();
  expect(cancel).toHaveBeenCalledTimes(1);
});
