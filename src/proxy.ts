import { NextResponse, type NextRequest } from "next/server";

// Apply the revocable-output policy to HTML, Flight, redirects and errors alike.
// No session lookup: signed-in visitors receive the same public experience.
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set(
    "Cache-Control",
    request.nextUrl.pathname.startsWith("/app/")
      ? "private, no-store"
      : "no-store",
  );
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export const config = {
  matcher: [
    "/",
    "/collection/:path*",
    "/api/search/public",
    "/app/settings/public",
  ],
};
