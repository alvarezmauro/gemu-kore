import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import sharp from "sharp";
import { validateBytes } from "gltf-validator";
import type { StorageContentType } from "../storage/contracts";
import { AssetError, type Artifact } from "./contracts";

export const IMAGE_LIMIT = 25 * 1024 * 1024;
export const MODEL_LIMIT = 50 * 1024 * 1024;
export const PIXEL_LIMIT = 64_000_000;
const imageOptions = {
  failOn: "warning",
  limitInputPixels: PIXEL_LIMIT,
  limitInputChannels: 4,
  unlimited: false,
} as const;
sharp.cache(false);
sharp.concurrency(1);

export function uploadDescription(
  mimeType: string | null,
  encodedFilename: string | null,
) {
  const extensions: Record<string, readonly string[]> = {
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "image/webp": ["webp"],
    "image/avif": ["avif"],
    "model/gltf-binary": ["glb"],
  };
  if (
    !mimeType ||
    !(mimeType in extensions) ||
    !encodedFilename ||
    encodedFilename.length > 1500
  )
    throw new AssetError("INVALID_INPUT");
  let name: string;
  try {
    name = decodeURIComponent(encodedFilename)
      .split(/[\\/]/)
      .at(-1)!
      .normalize("NFC");
  } catch {
    throw new AssetError("INVALID_INPUT");
  }
  if (
    !name ||
    name.length > 255 ||
    /[\x00-\x1f\x7f]/.test(name) ||
    !extensions[mimeType].includes(name.split(".").at(-1)!.toLowerCase())
  )
    throw new AssetError("INVALID_INPUT");
  return {
    mimeType: mimeType as StorageContentType,
    filename: name,
    kind:
      mimeType === "model/gltf-binary"
        ? ("MODEL_3D" as const)
        : ("IMAGE" as const),
  };
}

async function digest(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

// The official validator checks accessors, buffer ranges and glTF semantics.
// The preflight bounds work and refuses every external resource before validation.
async function validateGlb(bytes: Buffer) {
  if (
    bytes.length < 20 ||
    bytes.readUInt32LE(0) !== 0x46546c67 ||
    bytes.readUInt32LE(4) !== 2 ||
    bytes.readUInt32LE(8) !== bytes.length ||
    bytes.readUInt32LE(16) !== 0x4e4f534a
  )
    throw new AssetError("INVALID_INPUT");
  const length = bytes.readUInt32LE(12);
  if (length > 1024 * 1024 || length % 4 || 20 + length > bytes.length)
    throw new AssetError("INVALID_INPUT");
  const root: unknown = JSON.parse(
    bytes.subarray(20, 20 + length).toString("utf8"),
  );
  let nodes = 0;
  function visit(value: unknown, depth: number) {
    if (++nodes > 100_000 || depth > 32) throw new AssetError("TOO_LARGE");
    if (Array.isArray(value)) {
      if (value.length > 4096) throw new AssetError("TOO_LARGE");
      for (const entry of value) visit(entry, depth + 1);
    } else if (value && typeof value === "object")
      for (const [key, entry] of Object.entries(value)) {
        if (key === "uri") throw new AssetError("INVALID_INPUT");
        visit(entry, depth + 1);
      }
  }
  visit(root, 0);
  const doc = root as {
    extensionsRequired?: unknown[];
    accessors?: { count: number }[];
    images?: { bufferView: number; mimeType: string }[];
    bufferViews?: {
      buffer?: number;
      byteOffset?: number;
      byteLength: number;
    }[];
  };
  // Decoder extensions and data URIs need an explicit future ingestion policy.
  if (
    (doc.accessors ?? []).some(
      (a) =>
        !Number.isSafeInteger(a.count) || a.count < 0 || a.count > 1_000_000,
    )
  )
    throw new AssetError("INVALID_INPUT");
  if (
    doc.extensionsRequired?.length ||
    (doc.accessors ?? []).reduce((sum, a) => sum + a.count, 0) > 1_000_000 ||
    (doc.images?.length ?? 0) > 32
  )
    throw new AssetError("TOO_LARGE");
  const binStart = 20 + length;
  if (
    binStart < bytes.length &&
    (binStart + 8 > bytes.length ||
      bytes.readUInt32LE(binStart + 4) !== 0x004e4942 ||
      bytes.readUInt32LE(binStart) % 4 ||
      binStart + 8 + bytes.readUInt32LE(binStart) !== bytes.length)
  )
    throw new AssetError("INVALID_INPUT");
  let pixels = 0;
  for (const image of doc.images ?? []) {
    const view = doc.bufferViews?.[image.bufferView];
    if (
      !view ||
      (view.buffer ?? 0) !== 0 ||
      !["image/png", "image/jpeg"].includes(image.mimeType)
    )
      throw new AssetError("INVALID_INPUT");
    const start = binStart + 8 + (view.byteOffset ?? 0);
    if (start < binStart + 8 || start + view.byteLength > bytes.length)
      throw new AssetError("INVALID_INPUT");
    const input = bytes.subarray(start, start + view.byteLength);
    const info = await sharp(input, imageOptions).metadata();
    if (
      !info.width ||
      !info.height ||
      (info.pages ?? 1) !== 1 ||
      (image.mimeType === "image/png"
        ? info.format !== "png"
        : info.format !== "jpeg")
    )
      throw new AssetError("INVALID_INPUT");
    pixels += info.width * info.height;
    if (pixels > PIXEL_LIMIT) throw new AssetError("TOO_LARGE");
    await sharp(input, imageOptions)
      .resize(1, 1)
      .timeout({ seconds: 10 })
      .raw()
      .toBuffer();
  }
  const report = await validateBytes(bytes, {
    format: "glb",
    maxIssues: 32,
    writeTimestamp: false,
    externalResourceFunction: async () => {
      throw new AssetError("INVALID_INPUT");
    },
  });
  if (report.issues.numErrors || report.issues.truncated)
    throw new AssetError("INVALID_INPUT");
}

export async function prepareUpload(
  body: ReadableStream<Uint8Array>,
  description: ReturnType<typeof uploadDescription>,
  originalId: string,
  signal: AbortSignal,
) {
  const directory = await mkdtemp(join(tmpdir(), "gemukore-upload-"));
  const cleanup = () => rm(directory, { recursive: true, force: true });
  const path = join(directory, "original");
  try {
    let size = 0;
    const maximum = description.kind === "IMAGE" ? IMAGE_LIMIT : MODEL_LIMIT;
    const bound = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        size += chunk.length;
        done(size > maximum ? new AssetError("TOO_LARGE") : null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(
        body as import("node:stream/web").ReadableStream<Uint8Array>,
      ),
      bound,
      createWriteStream(path, { mode: 0o600, flags: "wx" }),
      { signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]) },
    );
    if (!size) throw new AssetError("INVALID_INPUT");
    const original: Artifact & { path: string } = {
      id: originalId,
      path,
      variant: "original",
      mimeType: description.mimeType,
      sizeBytes: size,
      sha256: await digest(path),
    };
    if (description.kind === "MODEL_3D") {
      await validateGlb(await readFile(path));
      return { artifacts: [original], cleanup };
    }
    if (description.mimeType === "image/png") {
      const bytes = await readFile(path);
      let offset = 8;
      let chunks = 0;
      while (offset + 12 <= bytes.length) {
        if (++chunks > 4096) throw new AssetError("TOO_LARGE");
        const length = bytes.readUInt32BE(offset);
        if (offset + length + 12 > bytes.length)
          throw new AssetError("INVALID_INPUT");
        if (bytes.toString("ascii", offset + 4, offset + 8) === "acTL")
          throw new AssetError("INVALID_INPUT");
        offset += length + 12;
      }
    }
    const metadata = await sharp(path, imageOptions)
      .timeout({ seconds: 10 })
      .metadata();
    const expected = {
      "image/jpeg": "jpeg",
      "image/png": "png",
      "image/webp": "webp",
      "image/avif": "heif",
    }[
      description.mimeType as
        "image/jpeg" | "image/png" | "image/webp" | "image/avif"
    ];
    if (
      metadata.format !== expected ||
      !["uchar", "ushort"].includes(metadata.depth) ||
      (expected === "heif" && metadata.compression !== "av1") ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > PIXEL_LIMIT ||
      (metadata.pages ?? 1) !== 1
    )
      throw new AssetError("INVALID_INPUT");
    original.width = metadata.width;
    original.height = metadata.height;
    const artifacts = [original];
    for (const [variant, edge] of [
      ["thumbnail", 320],
      ["display", 1600],
    ] as const) {
      signal.throwIfAborted();
      // Runtime scratch files live outside the checkout and are never deployment inputs.
      const output = join(/* turbopackIgnore: true */ directory, variant);
      const result = await sharp(path, imageOptions)
        .autoOrient()
        .resize({
          width: edge,
          height: edge,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 85 })
        .timeout({ seconds: 10 })
        .toFile(output);
      if (result.size > IMAGE_LIMIT) throw new AssetError("TOO_LARGE");
      artifacts.push({
        id: randomUUID(),
        path: output,
        variant,
        mimeType: "image/webp",
        sizeBytes: result.size,
        sha256: await digest(output),
        width: result.width,
        height: result.height,
      });
    }
    return { artifacts, cleanup };
  } catch (error) {
    await cleanup();
    if (error instanceof AssetError) throw error;
    if (signal.aborted) throw new AssetError("UNAVAILABLE");
    throw new AssetError("INVALID_INPUT");
  }
}
