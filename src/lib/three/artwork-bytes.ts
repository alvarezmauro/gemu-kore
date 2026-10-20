import { ModelError } from "./contracts";
import { imageSize } from "./profile";
import {
  artworkResource,
  packagingLimits,
  type ArtworkResource,
} from "./packaging-contracts";
export function inspectArtwork(bytes: Uint8Array, resource: ArtworkResource) {
  if (
    bytes.byteLength !== resource.byteLength ||
    bytes.byteLength > packagingLimits.imageBytes
  )
    throw new ModelError();
  let size: [number, number];
  if (resource.mimeType !== "image/webp") {
    size = imageSize(bytes, resource.mimeType);
    if (resource.mimeType === "image/png") {
      const view = new DataView(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
      );
      let end = false;
      for (let offset = 8; offset < bytes.length;) {
        if (offset + 12 > bytes.length) throw new ModelError();
        const length = view.getUint32(offset),
          name = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
        if (
          offset + length + 12 > bytes.length ||
          ["acTL", "fcTL", "fdAT"].includes(name)
        )
          throw new ModelError();
        offset += length + 12;
        if (name === "IEND") {
          if (length || offset !== bytes.length) throw new ModelError();
          end = true;
        }
      }
      if (!end) throw new ModelError();
    }
  } else {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tag = (offset: number) =>
      String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const u24 = (offset: number) =>
      bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536;
    if (
      bytes.length < 30 ||
      tag(0) !== "RIFF" ||
      tag(8) !== "WEBP" ||
      view.getUint32(4, true) + 8 !== bytes.length
    )
      throw new ModelError();
    let dimensions: [number, number] | undefined,
      images = 0;
    for (let offset = 12; offset < bytes.length;) {
      if (offset + 8 > bytes.length) throw new ModelError();
      const name = tag(offset),
        length = view.getUint32(offset + 4, true),
        start = offset + 8;
      if (start + length > bytes.length || name === "ANIM" || name === "ANMF")
        throw new ModelError();
      if (name === "VP8X") {
        if (length !== 10 || bytes[start] & 2 || dimensions || images)
          throw new ModelError();
        dimensions = [u24(start + 4) + 1, u24(start + 7) + 1];
      } else if (name === "VP8 ") {
        if (
          length < 10 ||
          bytes[start] & 1 ||
          bytes[start + 3] !== 0x9d ||
          bytes[start + 4] !== 1 ||
          bytes[start + 5] !== 0x2a
        )
          throw new ModelError();
        const frame: [number, number] = [
          view.getUint16(start + 6, true) & 0x3fff,
          view.getUint16(start + 8, true) & 0x3fff,
        ];
        if (
          dimensions &&
          (frame[0] !== dimensions[0] || frame[1] !== dimensions[1])
        )
          throw new ModelError();
        dimensions = frame;
        images++;
      } else if (name === "VP8L") {
        if (length < 5 || bytes[start] !== 0x2f) throw new ModelError();
        const bits = view.getUint32(start + 1, true);
        if (bits >>> 29) throw new ModelError();
        const frame: [number, number] = [
          (bits & 0x3fff) + 1,
          ((bits >>> 14) & 0x3fff) + 1,
        ];
        if (
          dimensions &&
          (frame[0] !== dimensions[0] || frame[1] !== dimensions[1])
        )
          throw new ModelError();
        dimensions = frame;
        images++;
      }
      offset = start + length + (length % 2);
      if (offset > bytes.length) throw new ModelError();
    }
    if (!dimensions || images !== 1) throw new ModelError();
    size = dimensions;
  }
  if (
    size[0] !== resource.width ||
    size[1] !== resource.height ||
    size.some((v) => v <= 0 || v > packagingLimits.edge)
  )
    throw new ModelError();
  return size;
}
export async function fetchArtwork(
  resource: ArtworkResource,
  signal: AbortSignal,
  progress: (bytes: number) => void,
) {
  if (!artworkResource.safeParse(resource).success) throw new ModelError();
  const response = await fetch(resource.url, {
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal,
  });
  if (
    response.status !== 200 ||
    response.redirected ||
    response.headers.get("content-type")?.split(";")[0].trim() !==
      resource.mimeType ||
    response.headers.get("content-length") !== String(resource.byteLength) ||
    !response.body
  ) {
    await response.body?.cancel().catch(() => {});
    throw new ModelError(
      [401, 403].includes(response.status)
        ? "Your access changed. Sign in again before viewing packaging."
        : "This artwork could not be loaded. Refresh or try again.",
    );
  }
  const reader = response.body.getReader(),
    parts: Uint8Array[] = [];
  let total = 0,
    complete = false;
  try {
    while (true) {
      const part = await reader.read();
      signal.throwIfAborted();
      if (part.done) break;
      total += part.value.length;
      if (total > resource.byteLength || total > packagingLimits.imageBytes)
        throw new ModelError();
      parts.push(part.value);
      progress(part.value.length);
    }
    if (total !== resource.byteLength) throw new ModelError();
    const result = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }
    inspectArtwork(result, resource);
    complete = true;
    return result;
  } finally {
    if (!complete) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
