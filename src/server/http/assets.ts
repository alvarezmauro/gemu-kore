import "server-only";
import { Readable } from "node:stream";
import { getAuthEnv } from "../config/env";
import { PrivateAccessError, requirePrivateAccess } from "../auth/access";
import { PermissionError } from "../auth/permissions";
import { AssetError } from "../assets/contracts";
import { completeUpload, privateAsset, uploadAsset } from "../services/assets";
import { getObjectStorage } from "../storage";
import { StorageError } from "../storage/errors";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};
export function assetResponseError(error: unknown): Response {
  if (error instanceof PrivateAccessError)
    return Response.json(
      { error: "Private access is unavailable." },
      {
        status:
          error.code === "UNAUTHENTICATED"
            ? 401
            : error.code === "DENIED"
              ? 403
              : 503,
        headers: privateHeaders,
      },
    );
  if (error instanceof PermissionError)
    return Response.json(
      { error: "This operation is not permitted." },
      { status: 403, headers: privateHeaders },
    );
  if (error instanceof AssetError)
    return Response.json(
      {
        error: error.message,
        ...(error.uploadId ? { uploadId: error.uploadId } : {}),
      },
      {
        status: {
          INVALID_INPUT: 400,
          TOO_LARGE: 413,
          NOT_FOUND: 404,
          CONFLICT: 409,
          BUSY: 429,
          UNAVAILABLE: 503,
        }[error.code],
        headers: privateHeaders,
      },
    );
  if (error instanceof StorageError && error.code === "NOT_FOUND")
    return Response.json(
      { error: "The file is unavailable." },
      { status: 404, headers: privateHeaders },
    );
  return Response.json(
    { error: "File storage is temporarily unavailable." },
    { status: 503, headers: privateHeaders },
  );
}
function sameOrigin(request: Request) {
  const auth = getAuthEnv();
  if (
    !auth ||
    request.headers.get("origin") !== auth.baseURL ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new PermissionError("FORBIDDEN");
}
export async function uploadRequest(request: Request) {
  try {
    const context = await requirePrivateAccess(request.headers);
    sameOrigin(request);
    const targetHeader = request.headers.get("x-gemukore-target");
    if (!targetHeader || targetHeader.length > 2048)
      throw new AssetError("INVALID_INPUT");
    let target: unknown;
    try {
      target = JSON.parse(targetHeader);
    } catch {
      throw new AssetError("INVALID_INPUT");
    }
    const declared = request.headers.get("content-length");
    const result = await uploadAsset(
      context,
      {
        target,
        mimeType: request.headers.get("content-type"),
        filename: request.headers.get("x-file-name"),
        body: request.body,
        ...(declared === null
          ? {}
          : { declaredSize: /^\d+$/.test(declared) ? Number(declared) : NaN }),
      },
      AbortSignal.any([request.signal, AbortSignal.timeout(180_000)]),
    );
    return Response.json(result, { status: 201, headers: privateHeaders });
  } catch (error) {
    return assetResponseError(error);
  }
}
export async function completeRequest(request: Request, id: string) {
  try {
    const context = await requirePrivateAccess(request.headers);
    sameOrigin(request);
    return Response.json(
      await completeUpload(
        context,
        id,
        AbortSignal.any([request.signal, AbortSignal.timeout(180_000)]),
      ),
      { headers: privateHeaders },
    );
  } catch (error) {
    return assetResponseError(error);
  }
}
export async function privateMediaRequest(request: Request, id: string) {
  try {
    const context = await requirePrivateAccess(request.headers);
    const asset = await privateAsset(context, id);
    const headers = new Headers({
      ...privateHeaders,
      "Content-Type": asset.mimeType,
      "Accept-Ranges": "bytes",
      "Content-Disposition": `${asset.deliveryClass === "ORIGINAL" ? "attachment" : "inline"}; filename="asset.${asset.mimeType === "model/gltf-binary" ? "glb" : asset.mimeType.split("/")[1]}"`,
    });
    let range: { start: number; end: number } | undefined;
    const rawRange = request.headers.get("range");
    if (rawRange) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rawRange);
      if (!match || !(match[1] || match[2]))
        return new Response(null, {
          status: 416,
          headers: {
            ...privateHeaders,
            "Content-Range": `bytes */${asset.sizeBytes}`,
          },
        });
      const start = match[1]
        ? Number(match[1])
        : Math.max(0, asset.sizeBytes - Number(match[2]));
      const end =
        match[1] && match[2]
          ? Math.min(Number(match[2]), asset.sizeBytes - 1)
          : asset.sizeBytes - 1;
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= asset.sizeBytes ||
        (!match[1] && Number(match[2]) === 0)
      )
        return new Response(null, {
          status: 416,
          headers: {
            ...privateHeaders,
            "Content-Range": `bytes */${asset.sizeBytes}`,
          },
        });
      range = { start, end };
      headers.set("Content-Range", `bytes ${start}-${end}/${asset.sizeBytes}`);
    }
    headers.set(
      "Content-Length",
      String(range ? range.end - range.start + 1 : asset.sizeBytes),
    );
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
        throw new AssetError("NOT_FOUND");
      return new Response(null, { status: range ? 206 : 200, headers });
    }
    const object = await storage.get(asset.locator, {
      range,
      signal: request.signal,
    });
    if (
      object.contentType !== asset.mimeType ||
      object.sizeBytes !==
        (range ? range.end - range.start + 1 : asset.sizeBytes)
    ) {
      object.body.destroy();
      throw new AssetError("UNAVAILABLE");
    }
    return new Response(
      Readable.toWeb(object.body) as ReadableStream<Uint8Array>,
      { status: range ? 206 : 200, headers },
    );
  } catch (error) {
    return assetResponseError(error);
  }
}
