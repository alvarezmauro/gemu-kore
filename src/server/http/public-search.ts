import "server-only";
import {
  getPublicCollection,
  PublicCollectionError,
} from "@/server/services/public-collection";
import {
  parsePublicBrowse,
  publicUrlParams,
} from "@/features/public-collection/browsing";

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
};
export async function publicSearchRequest(request: Request) {
  const parsed = parsePublicBrowse(
    publicUrlParams(new URL(request.url).searchParams),
  );
  try {
    // Never use a private context, Cookie, client role, or private search DTO.
    const data = await getPublicCollection(parsed?.input ?? null);
    return Response.json(data, { headers });
  } catch (error) {
    if (error instanceof PublicCollectionError)
      return Response.json(
        { error: error.message },
        {
          status:
            error.code === "NOT_FOUND"
              ? 404
              : error.code === "INVALID_INPUT"
                ? 400
                : 503,
          headers,
        },
      );
    return Response.json(
      { error: "The collection is unavailable right now." },
      { status: 503, headers },
    );
  }
}
