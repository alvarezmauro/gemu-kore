import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const auth = getAuth();
  if (!auth)
    return Response.json(
      { error: "Sign-in is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  const handlers = toNextJsHandler(auth);
  const response = await (request.method === "GET"
    ? handlers.GET(request)
    : handlers.POST(request));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const GET = handle;
export const POST = handle;
