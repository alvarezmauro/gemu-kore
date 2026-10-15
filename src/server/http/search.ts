import "server-only";
import {
  searchFilteredCollection,
  browsePrivateCollection,
} from "../services/search/filtered";
import { requirePrivateAccess, PrivateAccessError } from "../auth/access";
import { PermissionError } from "../auth/permissions";
import { getAuthEnv } from "../config/env";
import {
  searchPrivateCollection,
  searchPrivatePalette,
  SearchError,
} from "../services/search";
const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
};
class BodyError extends Error {
  constructor(public status: number) {
    super("Invalid search request.");
  }
}
async function readInput(request: Request): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
      "application/json" ||
    !request.body
  )
    throw new BodyError(400);
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 4096))
    throw new BodyError(413);
  const reader = request.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(5000)]);
  let onAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => {
      void reader.cancel().catch(() => {});
      reject(new BodyError(400));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    signal.throwIfAborted();
    while (true) {
      const part = await Promise.race([reader.read(), aborted]);
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 4096) {
        void reader.cancel().catch(() => {});
        throw new BodyError(413);
      }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof BodyError) throw error;
    throw new BodyError(400);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
export async function privateSearchRequest(
  request: Request,
): Promise<Response> {
  return handlePrivateSearch(request, searchPrivateCollection);
}
export async function privatePaletteRequest(
  request: Request,
): Promise<Response> {
  return handlePrivateSearch(request, searchPrivatePalette);
}
export async function privateFilteredRequest(
  request: Request,
): Promise<Response> {
  return handlePrivateSearch(request, searchFilteredCollection);
}
export async function privateCollectionRequest(
  request: Request,
): Promise<Response> {
  return handlePrivateSearch(request, browsePrivateCollection);
}
async function handlePrivateSearch(
  request: Request,
  search:
    | typeof searchPrivateCollection
    | typeof searchPrivatePalette
    | typeof searchFilteredCollection,
): Promise<Response> {
  try {
    const context = await requirePrivateAccess(request.headers);
    const auth = getAuthEnv();
    if (
      !auth ||
      request.headers.get("origin") !== auth.baseURL ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new PermissionError("FORBIDDEN");
    return Response.json(await search(context, await readInput(request)), {
      headers,
    });
  } catch (error) {
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
          headers,
        },
      );
    if (error instanceof PermissionError)
      return Response.json(
        { error: "This operation is not permitted." },
        { status: 403, headers },
      );
    if (error instanceof BodyError)
      return Response.json(
        { error: "The search request is invalid or too large." },
        { status: error.status, headers },
      );
    if (error instanceof SearchError && error.code === "INVALID_INPUT")
      return Response.json({ error: error.message }, { status: 400, headers });
    return Response.json(
      { error: "Search is unavailable right now. Please try again." },
      { status: 503, headers },
    );
  }
}
