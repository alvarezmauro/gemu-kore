import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  crawl: vi.fn(),
  index: vi.fn(),
  map: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/services/public-collection/seo", () => ({
  getPublicCrawlPolicy: state.crawl,
  getPublicSitemapIndex: state.index,
  getPublicSitemap: state.map,
}));
import {
  robotsRequest,
  sitemapRequest,
  publicSitemapRequest,
} from "./public-seo";
import { PublicCollectionError } from "@/server/services/public-collection/common";
beforeEach(() => {
  vi.clearAllMocks();
  state.crawl.mockResolvedValue({
    index: false,
    origin: "https://collection.example",
  });
  state.index.mockResolvedValue([]);
  state.map.mockResolvedValue([]);
});
it("lets crawlers read public noindex HTML while withholding sitemap advertising and binary media", async () => {
  const r = await robotsRequest(),
    text = await r.text();
  expect(r.headers.get("Cache-Control")).toBe("no-store");
  expect(text).toContain("Allow: /collection");
  expect(text).toContain("Disallow: /");
  expect(text).not.toContain("Sitemap:");
  expect(text).not.toContain("/api/media/public/seo/");
  state.crawl.mockResolvedValue({
    index: true,
    origin: "https://collection.example",
  });
  expect(await (await robotsRequest()).text()).toContain(
    "Sitemap: https://collection.example/sitemap.xml",
  );
});
it("escapes sitemap locations and never publishes disabled entries or invented timestamps", async () => {
  const empty = await sitemapRequest();
  expect(await empty.text()).not.toContain("<loc>");
  state.map.mockResolvedValue([
    "https://collection.example/collection?one=1&two=<bad>",
  ]);
  const r = await sitemapRequest("pages"),
    text = await r.text();
  expect(text).toContain("&amp;two=&lt;bad&gt;");
  expect(text).not.toContain("<lastmod>");
  expect(r.headers.get("Cache-Control")).toBe("no-store");
});
it("returns generic no-store 503s on policy failure and 404s on invalid maps", async () => {
  state.crawl.mockRejectedValue(new Error("database://secret"));
  const r = await robotsRequest();
  expect(r.status).toBe(503);
  expect(await r.text()).not.toContain("secret");
  state.index.mockRejectedValue(new Error("database://secret"));
  expect((await sitemapRequest()).status).toBe(503);
  state.map.mockRejectedValue(new PublicCollectionError("NOT_FOUND"));
  expect((await sitemapRequest("bad")).status).toBe(404);
});

it("accepts only a single part selector at the root sitemap URL", async () => {
  await publicSitemapRequest(
    new Request("https://collection.example/sitemap.xml?part=ab"),
  );
  expect(state.map).toHaveBeenCalledWith("ab");
  await publicSitemapRequest(
    new Request("https://collection.example/sitemap.xml?part=ab&part=cd"),
  );
  expect(state.map).toHaveBeenLastCalledWith("invalid");
  await publicSitemapRequest(
    new Request("https://collection.example/sitemap.xml?audience=private"),
  );
  expect(state.map).toHaveBeenLastCalledWith("invalid");
});
