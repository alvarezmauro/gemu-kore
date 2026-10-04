import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const auth = getAuth();
  if (!auth)
    return Response.json(
      { error: "Sign-in is not configured." },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  const handlers = toNextJsHandler(auth);
  const response = await (request.method === "GET"
    ? handlers.GET(request)
    : handlers.POST(request));
  const location = response.headers.get("Location");
  if (location && response.status >= 300 && response.status < 400) {
    const destination = new URL(location, auth.options.baseURL);
    if (destination.searchParams.has("error")) {
      // Provider descriptions and arbitrary error codes must not survive in
      // browser history, login URLs or their subsequent referrers.
      response.headers.set(
        "Location",
        new URL("/login?error=sign_in_failed", auth.options.baseURL).href,
      );
    }
  }
  response.headers.set("Cache-Control", "private, no-store");
  // OAuth callback URLs themselves may contain a short-lived code or state.
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export const GET = handle;
export const POST = handle;
