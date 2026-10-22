import "server-only";
import { Readable } from "node:stream";
import { mediaDelivery } from "@/server/services/public-collection/media";
import { PublicCollectionError } from "@/server/services/public-collection/common";
import { StorageError } from "@/server/storage/errors";
import { getObjectStorage } from "@/server/storage";
const base = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Robots-Tag": "noindex, nofollow",
};
export function publicMediaError(error: unknown) {
  const missing =
    (error instanceof PublicCollectionError || error instanceof StorageError) &&
    error.code === "NOT_FOUND";
  return Response.json(
    {
      error: missing
        ? "This page is unavailable."
        : "The collection is unavailable right now.",
    },
    { status: missing ? 404 : 503, headers: base },
  );
}
export async function publicMediaRequest(request: Request, input: unknown) {
  try {
    // Query controls never select alternative derivatives or private resources.
    const asset = await mediaDelivery(
      new URL(request.url).search ? null : input,
    );
    const headers = new Headers({
      ...base,
      "X-Robots-Tag": asset.indexable ? "index, follow" : "noindex, nofollow",
      "Content-Type": asset.mimeType,
      "Accept-Ranges": "bytes",
      "Content-Disposition": "inline",
    });
    let range: { start: number; end: number } | undefined;
    const raw = request.headers.get("range");
    const invalidRange = () =>
      new Response(null, {
        status: 416,
        headers: { ...base, "Content-Range": `bytes */${asset.sizeBytes}` },
      });
    if (raw) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(raw);
      if (!m || !(m[1] || m[2])) return invalidRange();
      const start = m[1]
        ? Number(m[1])
        : Math.max(0, asset.sizeBytes - Number(m[2]));
      const end =
        m[1] && m[2]
          ? Math.min(Number(m[2]), asset.sizeBytes - 1)
          : asset.sizeBytes - 1;
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= asset.sizeBytes ||
        (!m[1] && Number(m[2]) === 0)
      )
        return invalidRange();
      range = { start, end };
      headers.set("Content-Range", `bytes ${start}-${end}/${asset.sizeBytes}`);
    }
    const size = range ? range.end - range.start + 1 : asset.sizeBytes;
    headers.set("Content-Length", String(size));
    const storage = getObjectStorage();
    if (request.method === "HEAD") {
      const info = await storage.stat(asset.locator, {
        signal: request.signal,
      });
      if (
        !info ||
        info.sizeBytes !== asset.sizeBytes ||
        info.contentType !== asset.mimeType
      )
        throw new PublicCollectionError("NOT_FOUND");
      return new Response(null, { status: range ? 206 : 200, headers });
    }
    // Conditional headers are deliberately not answered with cached 304s.
    const object = await storage.get(asset.locator, {
      range,
      signal: request.signal,
    });
    if (object.contentType !== asset.mimeType || object.sizeBytes !== size) {
      object.body.destroy();
      throw new PublicCollectionError("UNAVAILABLE");
    }
    return new Response(
      Readable.toWeb(object.body) as ReadableStream<Uint8Array>,
      { status: range ? 206 : 200, headers },
    );
  } catch (error) {
    return publicMediaError(error);
  }
}
