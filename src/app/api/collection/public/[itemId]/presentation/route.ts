import { getPublicPresentation } from "@/server/services/public-collection/viewer";
import { publicMediaError } from "@/server/http/public-media";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    const { itemId } = await params,
      q = new URL(request.url).searchParams;
    const valid =
      [...q.keys()].every((k) => k === "component") &&
      q.getAll("component").length <= 1;
    return Response.json(
      await getPublicPresentation(
        valid
          ? {
              itemId,
              ...(q.has("component")
                ? { componentId: q.get("component") }
                : {}),
            }
          : null,
      ),
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  } catch (e) {
    return publicMediaError(e);
  }
}
