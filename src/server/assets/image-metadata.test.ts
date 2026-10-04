import { createHash, randomUUID } from "node:crypto";
import { readFile, access } from "node:fs/promises";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { prepareUpload, uploadDescription } from "./processing";

const colors = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 255, 0],
];
function quadrantImage() {
  const width = 80,
    height = 40,
    pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const color = colors[(y < height / 2 ? 0 : 2) + (x < width / 2 ? 0 : 1)];
      for (let c = 0; c < 3; c++) pixels[(y * width + x) * 3 + c] = color[c];
    }
  return sharp(pixels, { raw: { width, height, channels: 3 } });
}
function stream(bytes: Buffer) {
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (let offset = 0; offset < bytes.length; offset += 127)
        c.enqueue(new Uint8Array(bytes.subarray(offset, offset + 127)));
      c.close();
    },
  });
}
async function prepare(bytes: Buffer, mime = "image/png", extension = "png") {
  return prepareUpload(
    stream(bytes),
    uploadDescription(mime, `private.${extension}`),
    randomUUID(),
    AbortSignal.timeout(10000),
  );
}
function hash(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("image metadata normalization from actual decoded bytes", () => {
  it.each([
    [1, [0, 1, 2, 3]],
    [2, [1, 0, 3, 2]],
    [3, [3, 2, 1, 0]],
    [4, [2, 3, 0, 1]],
    [5, [0, 2, 1, 3]],
    [6, [2, 0, 3, 1]],
    [7, [3, 1, 2, 0]],
    [8, [1, 3, 0, 2]],
  ] as const)(
    "normalizes EXIF orientation %s including mirrored pixel positions",
    async (orientation, order) => {
      const bytes = await quadrantImage()
        .png()
        .withMetadata({ orientation })
        .withExif({
          IFD0: {
            ImageDescription: "private collector information",
            Artist: "Private owner",
          },
        })
        .toBuffer();
      const originalMetadata = await sharp(bytes).metadata();
      expect(originalMetadata.exif).toBeDefined();
      expect(originalMetadata.orientation).toBe(orientation);
      const upload = await prepare(bytes);
      try {
        const [original, ...derivatives] = upload.artifacts;
        expect(original).toMatchObject({
          width: 80,
          height: 40,
          sizeBytes: bytes.length,
          sha256: hash(bytes),
        });
        expect(await readFile(original.path)).toEqual(bytes);
        for (const derivative of derivatives) {
          const output = await readFile(derivative.path);
          const metadata = await sharp(output).metadata();
          const rotated = orientation >= 5;
          expect(derivative).toMatchObject({
            width: rotated ? 40 : 80,
            height: rotated ? 80 : 40,
            mimeType: "image/webp",
            sizeBytes: output.length,
            sha256: hash(output),
          });
          expect(metadata).toMatchObject({
            width: derivative.width,
            height: derivative.height,
            format: "webp",
          });
          for (const field of [
            "exif",
            "xmp",
            "iptc",
            "icc",
            "orientation",
          ] as const)
            expect(metadata[field]).toBeUndefined();
          const { data, info } = await sharp(output)
            .raw()
            .toBuffer({ resolveWithObject: true });
          const points = [
            [0.25, 0.25],
            [0.75, 0.25],
            [0.25, 0.75],
            [0.75, 0.75],
          ];
          for (let corner = 0; corner < 4; corner++) {
            const [x, y] = points[corner];
            const start =
              (Math.floor(y * info.height) * info.width +
                Math.floor(x * info.width)) *
              info.channels;
            for (let channel = 0; channel < 3; channel++)
              expect(
                Math.abs(
                  data[start + channel] - colors[order[corner]][channel],
                ),
              ).toBeLessThan(25);
          }
        }
        expect(new Set(upload.artifacts.map((a) => a.id)).size).toBe(3);
      } finally {
        await upload.cleanup();
      }
    },
  );
  it.each([
    [2400, 1200, 320, 160, 1600, 800],
    [1200, 2400, 160, 320, 800, 1600],
    [2400, 2400, 320, 320, 1600, 1600],
    [40, 80, 40, 80, 40, 80],
    [1600, 800, 320, 160, 1600, 800],
  ])(
    "preserves aspect ratio and avoids enlargement for %s×%s",
    async (width, height, tw, th, dw, dh) => {
      const bytes = await sharp({
        create: { width, height, channels: 3, background: "blue" },
      })
        .png()
        .toBuffer();
      const upload = await prepare(bytes);
      try {
        expect(upload.artifacts[1]).toMatchObject({
          width: tw,
          height: th,
          variant: "thumbnail",
        });
        expect(upload.artifacts[2]).toMatchObject({
          width: dw,
          height: dh,
          variant: "display",
        });
      } finally {
        await upload.cleanup();
      }
    },
  );
  it.each([
    ["jpeg", "image/jpeg", "jpg"],
    ["png", "image/png", "png"],
    ["webp", "image/webp", "webp"],
    ["avif", "image/avif", "avif"],
  ] as const)(
    "retains original bytes and checksum for %s while normalizing display format",
    async (format, mime, extension) => {
      const bytes = await quadrantImage().toFormat(format).toBuffer();
      const upload = await prepare(bytes, mime, extension);
      try {
        expect(upload.artifacts[0]).toMatchObject({
          mimeType: mime,
          sha256: hash(bytes),
          sizeBytes: bytes.length,
        });
        expect(await readFile(upload.artifacts[0].path)).toEqual(bytes);
        for (const entry of upload.artifacts.slice(1))
          expect(
            (await sharp(await readFile(entry.path)).metadata()).format,
          ).toBe("webp");
      } finally {
        await upload.cleanup();
      }
    },
  );
  it("keeps transparent pixels transparent in both display derivatives", async () => {
    const bytes = await sharp({
      create: {
        width: 40,
        height: 20,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();
    const upload = await prepare(bytes);
    try {
      for (const entry of upload.artifacts.slice(1)) {
        const output = await readFile(entry.path);
        expect((await sharp(output).metadata()).hasAlpha).toBe(true);
        const { data, info } = await sharp(output)
          .raw()
          .toBuffer({ resolveWithObject: true });
        expect(info.channels).toBe(4);
        for (let offset = 3; offset < data.length; offset += 4)
          expect(data[offset]).toBe(0);
      }
    } finally {
      await upload.cleanup();
    }
  });
  it("removes successful temporary files and permits repeated cleanup", async () => {
    const upload = await prepare(await quadrantImage().png().toBuffer());
    await upload.cleanup();
    await upload.cleanup();
    for (const entry of upload.artifacts)
      await expect(access(entry.path)).rejects.toMatchObject({
        code: "ENOENT",
      });
  });
});
