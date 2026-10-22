import "server-only";
import {
  getPublicCrawlPolicy,
  getPublicSitemapIndex,
  getPublicSitemap,
} from "@/server/services/public-collection/seo";
import { PublicCollectionError } from "@/server/services/public-collection/common";
const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
};
function error(e: unknown) {
  const missing = e instanceof PublicCollectionError && e.code === "NOT_FOUND";
  return new Response(
    missing
      ? "This page is unavailable."
      : "The collection is unavailable right now.",
    { status: missing ? 404 : 503, headers },
  );
}
const escape = (url: string) =>
  url
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
export async function robotsRequest() {
  try {
    const p = await getPublicCrawlPolicy();
    // Crawlers must reach public HTML to observe noindex after withdrawal.
    const body = [
      "User-agent: *",
      "Disallow: /",
      "Allow: /collection",
      "Allow: /_next/static/",
      ...(p.index && p.origin
        ? [
            "Allow: /sitemap.xml",
            "Allow: /api/media/public/seo/",
            `Sitemap: ${p.origin}/sitemap.xml`,
          ]
        : []),
      "",
    ].join("\n");
    return new Response(body, {
      headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (e) {
    return error(e);
  }
}
export async function sitemapRequest(part?: string) {
  try {
    const urls =
      part === undefined
        ? await getPublicSitemapIndex()
        : await getPublicSitemap(part);
    const index = part === undefined,
      tag = index ? "sitemapindex" : "urlset",
      entry = index ? "sitemap" : "url";
    const xml = `<?xml version="1.0" encoding="UTF-8"?><${tag} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<${entry}><loc>${escape(url)}</loc></${entry}>`).join("")}</${tag}>`;
    if (Buffer.byteLength(xml) > 50 * 1024 * 1024)
      throw new PublicCollectionError("UNAVAILABLE");
    return new Response(xml, {
      headers: { ...headers, "Content-Type": "application/xml; charset=utf-8" },
    });
  } catch (e) {
    return error(e);
  }
}

// Every partition lives at the site root, as required for URLs outside a
// subdirectory sitemap's scope. Request parameters never reach XML directly.
export function publicSitemapRequest(request: Request) {
  const q = new URL(request.url).searchParams;
  if (!q.size) return sitemapRequest();
  return sitemapRequest(
    [...q.keys()].every((k) => k === "part") && q.getAll("part").length === 1
      ? q.get("part")!
      : "invalid",
  );
}
