import {
  expect,
  test,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { fixture, signIn } from "../helpers/model-browser";
const origin = "https://127.0.0.1:3111";
async function noindex(page: Page) {
  const directives = await page
    .locator('meta[name="robots"]')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("content") ?? ""),
    );
  expect(directives.length).toBeGreaterThan(0);
  expect(directives.every((value) => value.includes("noindex"))).toBe(true);
}
async function sitemapUrls(request: APIRequestContext) {
  const index = await request.get("/sitemap.xml");
  expect(index.status()).toBe(200);
  expect(index.headers()["cache-control"]).toContain("no-store");
  const maps = [...(await index.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (m) => m[1],
  );
  const urls: string[] = [];
  for (const map of maps) {
    const response = await request.get(map);
    expect(response.status()).toBe(200);
    urls.push(
      ...[...(await response.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(
        (m) => m[1],
      ),
    );
  }
  return urls;
}
test.beforeEach(async () => {
  await fixture("reset-public");
  await fixture("reset-search");
  await fixture("reset");
});
test.afterAll(async () => {
  await fixture("reset-public");
  await fixture("reset-search");
  await fixture("reset");
});
test("default noindex, explicit current indexing and canonical metadata agree for anonymous and signed-in visitors", async ({
  page,
  context,
  request,
}) => {
  const data = await fixture("seed-public-detail"),
    url = `/collection/consoles/${data.ids[0]}`;
  await page.goto(url);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow",
  );
  expect(await sitemapUrls(request)).toEqual([]);
  expect(await (await request.get("/robots.txt")).text()).not.toContain(
    "Sitemap:",
  );
  await fixture(
    "public-policy",
    JSON.stringify({ allowSearchEngineIndexing: true }),
  );
  for (const role of [undefined, "ADMIN", "EDITOR", "VIEWER"] as const) {
    if (role)
      await signIn(context, role, `seo-${role.toLowerCase()}@example.com`);
    await page.goto(url);
    await expect(page).toHaveTitle("Super Nintendo | GemuKore");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "index, follow",
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${origin}${url}`,
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      `${origin}/api/media/public/seo/${data.ids[0]}/${data.imageUseId}`,
    );
    const head = await page.locator("head").innerHTML();
    for (const hidden of [
      "PRIVATE-SERIAL",
      "PRIVATE-NOTE",
      "@example.com",
      "objectKey",
      "/api/media/private",
      data.privateId,
    ])
      expect(head).not.toContain(hidden);
  }
  const crawler = await request.get(url, {
      headers: {
        "User-Agent": "Googlebot",
        "X-Forwarded-Host": "attacker.example",
      },
    }),
    html = await crawler.text();
  expect(html).toContain(`<link rel="canonical" href="${origin}${url}"`);
  expect(html).not.toContain("attacker.example");
  expect(crawler.headers()["cache-control"]).toContain("no-store");
  const robots = await request.get("/robots.txt");
  const rules = await robots.text();
  expect(rules).toContain(`Sitemap: ${origin}/sitemap.xml`);
  expect(rules).toContain("Allow: /sitemap.xml");
});
test("sitemaps list only public copy UUIDs and base category pages, then remove unapproved, paused and indexing-disabled output", async ({
  request,
}) => {
  const data = await fixture("seed-public-detail");
  await fixture(
    "public-policy",
    JSON.stringify({ allowSearchEngineIndexing: true }),
  );
  const urls = await sitemapUrls(request);
  expect(urls).toHaveLength(7);
  for (const [i, category] of ["consoles", "games", "accessories"].entries())
    expect(urls).toContain(`${origin}/collection/${category}/${data.ids[i]}`);
  expect(urls).not.toContain(`${origin}/collection/search`);
  expect(JSON.stringify(urls)).not.toContain(data.privateId);
  await fixture("public-unpublish", data.ids[1]);
  expect(await sitemapUrls(request)).not.toContain(
    `${origin}/collection/games/${data.ids[1]}`,
  );
  await fixture(
    "public-policy",
    JSON.stringify({ allowSearchEngineIndexing: false }),
  );
  expect(await sitemapUrls(request)).toEqual([]);
  await fixture(
    "public-policy",
    JSON.stringify({
      publicCollectionEnabled: false,
      allowSearchEngineIndexing: true,
    }),
  );
  expect(await sitemapUrls(request)).toEqual([]);
  expect(await (await request.get("/robots.txt")).text()).not.toContain(
    "Sitemap:",
  );
  for (const path of [
    "/robots.txt",
    "/sitemap.xml",
    "/sitemap.xml?part=pages",
  ]) {
    const response = await request.head(path);
    expect(response.headers()["cache-control"]).toContain("no-store");
    const method = await request.post(path);
    expect(method.status()).toBe(405);
    expect(method.headers()["cache-control"]).toContain("no-store");
  }
});
test("filtered search, wrong/private copies, paused pages and optional copy observations never enter SEO fields", async ({
  page,
  request,
}) => {
  const data = await fixture("seed-public-detail");
  await fixture(
    "public-policy",
    JSON.stringify({
      allowSearchEngineIndexing: true,
      showSerialNumbers: true,
      showNotes: true,
      showDefects: true,
    }),
  );
  await page.goto(`/collection/consoles/${data.ids[0]}`);
  await expect(
    page.getByText("PRIVATE-SERIAL-0", { exact: true }),
  ).toBeVisible();
  expect(await page.locator("head").innerHTML()).not.toMatch(
    /PRIVATE-SERIAL|PRIVATE-NOTE|Private active defect/,
  );
  for (const path of [
    "/collection/search?q=PRIVATE-NOTE",
    "/collection/games?q=PRIVATE-NOTE&page=2",
    "/collection/consoles?audience=ADMIN",
    `/collection/consoles/${data.privateId}`,
    `/collection/games/${data.ids[0]}`,
  ]) {
    await page.goto(path);
    await noindex(page);
    expect(await page.locator("head").innerHTML()).not.toContain(
      "PRIVATE-NOTE",
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(0);
  }
  await fixture(
    "public-policy",
    JSON.stringify({ publicCollectionEnabled: false }),
  );
  await page.goto(`/collection/consoles/${data.ids[0]}`);
  await noindex(page);
  expect(await page.locator("head").innerHTML()).not.toContain(
    "Super Nintendo",
  );
  const login = await request.get("/login");
  expect(await login.text()).toContain(
    'name="robots" content="noindex, nofollow"',
  );
});
test("OpenGraph image GET, HEAD, ranges and conditionals recheck current indexing, exact approval, rights and publication", async ({
  page,
  request,
}) => {
  const data = await fixture("seed-public-detail"),
    url = `/api/media/public/seo/${data.ids[0]}/${data.imageUseId}`;
  expect((await request.get(url)).status()).toBe(404);
  await fixture(
    "public-policy",
    JSON.stringify({ allowSearchEngineIndexing: true }),
  );
  const image = await request.get(url);
  expect(image.status()).toBe(200);
  expect(image.headers()["cache-control"]).toBe("no-store");
  expect(image.headers()["x-robots-tag"]).toBe("index, follow");
  expect((await request.head(url)).status()).toBe(200);
  expect(
    (await request.get(url, { headers: { Range: "bytes=0-7" } })).status(),
  ).toBe(206);
  expect(
    (
      await request.get(
        `/api/media/public/seo/${data.ids[0]}/${data.modelUseId}`,
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.get(
        `/api/media/public/seo/${data.ids[1]}/${data.imageUseId}`,
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.get(
        `/_next/image?${new URLSearchParams({ url, w: "640", q: "75" })}`,
      )
    ).status(),
  ).toBe(400);
  await fixture("public-revoke-asset", data.imageAssetId);
  for (const method of ["get", "head"] as const) {
    const r = await request[method](url, {
      headers: { Range: "bytes=bad", "If-None-Match": "old" },
    });
    expect(r.status()).toBe(404);
    expect(r.headers()["content-range"]).toBeUndefined();
    expect(r.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  }
  await page.goto(`/collection/consoles/${data.ids[0]}`);
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(0);
  await fixture(
    "public-policy",
    JSON.stringify({ allowSearchEngineIndexing: false }),
  );
  await page.reload();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow",
  );
});
test("administrator reviews and saves indexing without changing copy approval, then disables it on a fresh form", async ({
  page,
  context,
  request,
}) => {
  const data = await fixture("seed-public-detail");
  await signIn(context, "ADMIN");
  await page.goto("/app/settings/public");
  const toggle = page.getByRole("checkbox", {
    name: /Allow search engine indexing/,
  });
  await toggle.check();
  await page
    .getByRole("button", { name: "Review settings", exact: true })
    .click();
  const review = page.getByRole("region", { name: "Settings review" });
  await expect(review).toContainText("Indexing is permitted");
  await review.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Save reviewed settings", exact: true })
    .click();
  await expect.poll(async () => (await sitemapUrls(request)).length).toBe(7);
  await page.reload();
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await page
    .getByRole("button", { name: "Review settings", exact: true })
    .click();
  await review.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Save reviewed settings", exact: true })
    .click();
  await expect.poll(async () => (await sitemapUrls(request)).length).toBe(0);
  expect(
    (await request.get(`/collection/consoles/${data.ids[0]}`)).status(),
  ).toBe(200);
});
