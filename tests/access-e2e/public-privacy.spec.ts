import { expect, test, type APIResponse } from "@playwright/test";
import { fixture, signIn } from "../helpers/model-browser";
import type { seedPublicPrivacyData } from "../helpers/public-privacy-data";
type Data = Awaited<ReturnType<typeof seedPublicPrivacyData>>;

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
function clean(text: string, data: Data, email?: string) {
  for (const secret of [
    data.canary,
    data.sourceId,
    data.displayId,
    data.privateId,
    ...data.privateLocators,
    "PRIVATE-SERIAL",
    "PRIVATE-NOTE",
    "Private active defect",
    "objectKey",
    "storageNamespace",
    "originalFilename",
    "providerSnapshot",
    "/api/media/private/",
    ...(email ? [email] : []),
  ])
    expect(text).not.toContain(secret);
}
async function denied(response: APIResponse) {
  expect(response.status()).toBe(404);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["content-range"]).toBeUndefined();
  expect(response.headers()["etag"]).toBeUndefined();
  expect(response.headers()["last-modified"]).toBeUndefined();
  const body = await response.text();
  if (body)
    expect(JSON.parse(body)).toEqual({ error: "This page is unavailable." });
}

test("@critical private canaries stay out of HTML, prefetch Flight, JSON, descriptors and SEO for every visitor role", async ({
  context,
  page,
}) => {
  const data: Data = await fixture("seed-public-privacy");
  await fixture(
    "public-policy",
    JSON.stringify({ allowSearchEngineIndexing: true }),
  );
  const pages = [
    "/collection",
    "/collection/consoles/" + data.ids[0],
    "/collection/games/" + data.ids[1],
    "/collection/accessories/" + data.ids[2],
  ];
  const representations: Record<string, string>[] = [
    {},
    { RSC: "1" },
    { RSC: "1", "Next-Router-Prefetch": "1", Purpose: "prefetch" },
  ];
  for (const role of [undefined, "ADMIN", "EDITOR", "VIEWER"] as const) {
    const email = role
      ? "privacy-" + role.toLowerCase() + "@example.com"
      : undefined;
    if (role) await signIn(context, role, email);
    for (const path of pages) {
      for (const headers of representations) {
        const response = await context.request.get(path, { headers });
        expect(response.status()).toBe(200);
        expect(response.headers()["cache-control"]).toContain("no-store");
        if ("RSC" in headers)
          expect(response.headers()["content-type"]).toContain(
            "text/x-component",
          );
        clean(await response.text(), data, email);
      }
    }
    for (const path of [
      "/api/search/public?q=Chrono",
      "/api/collection/public/" + data.ids[0] + "/presentation",
      "/api/collection/public/" +
        data.ids[1] +
        "/presentation?component=" +
        data.componentId,
      "/robots.txt",
      "/sitemap.xml",
      "/sitemap.xml?part=pages",
    ]) {
      const response = await context.request.get(path);
      expect(response.status()).toBe(200);
      expect(response.headers()["cache-control"]).toContain("no-store");
      clean(await response.text(), data, email);
    }
  }
  await page.goto(pages[1]);
  await expect(page.getByText(data.markup, { exact: true })).toBeVisible();
  await expect(page.locator("script#privacy-probe")).toHaveCount(0);
  expect(await page.evaluate(() => "__privacyProbe" in globalThis)).toBe(false);
});

test("approved bytes do not authorize other uses, serial photos, originals, optimizer copies or hidden personal media", async ({
  request,
}) => {
  const data: Data = await fixture("seed-public-privacy");
  const logo = await request.get(data.logoUrl);
  expect(logo.status()).toBe(200);
  expect(logo.headers()["cache-control"]).toContain("no-store");
  expect((await logo.body()).length).toBe(data.displaySize);
  expect((await logo.body()).includes(Buffer.from(data.canary))).toBe(false);
  clean(JSON.stringify(logo.headers()), data);
  await denied(await request.get(data.personalUrl));
  // Model the already reviewed enabled state; real widening/republishing is
  // exercised by the settings integration and public-home browser suites.
  await fixture("public-policy", JSON.stringify({ showPersonalPhotos: true }));
  const photo = await request.get(data.personalUrl);
  expect(photo.status()).toBe(200);
  expect(await photo.body()).toEqual(await logo.body());
  const blocked = [
    ...data.deniedUses,
    data.personalUrl + "?asset=" + data.sourceId,
    "/api/media/public/items/" + data.ids[0] + "/personal/" + data.sourceId,
    "/api/media/public/items/" +
      data.ids[0] +
      "/catalog/" +
      data.personalUrl.split("/").at(-1),
    "/api/media/public/site/" + data.displayId,
  ];
  for (const path of blocked) {
    await denied(await request.get(path));
    await denied(await request.head(path));
    await denied(
      await request.get(path, {
        headers: { Range: "bytes=broken", "If-None-Match": "previous" },
      }),
    );
  }
  for (const url of [
    data.personalUrl,
    data.logoUrl,
    "/api/media/private/" + data.sourceId,
  ]) {
    const response = await request.get(
      "/_next/image?" + new URLSearchParams({ url, w: "640", q: "75" }),
    );
    expect(response.status()).toBe(400);
  }
});

test("withdrawal closes direct representations and fresh prefetches while retaining independent site approval", async ({
  request,
  page,
}) => {
  const data: Data = await fixture("seed-public-privacy");
  await fixture(
    "public-policy",
    JSON.stringify({
      showPersonalPhotos: true,
      allowSearchEngineIndexing: true,
    }),
  );
  const model = "/api/collection/public/" + data.ids[0] + "/presentation";
  const paths = [
    data.personalUrl,
    data.imageUrl,
    "/api/media/public/items/" + data.ids[0] + "/catalog/" + data.modelUseId,
    "/api/media/public/seo/" + data.ids[0] + "/" + data.imageUseId,
    model,
  ];
  for (const path of paths)
    expect((await request.get(path)).status()).toBe(200);
  await fixture("public-unpublish", data.ids[0]);
  for (const path of paths) {
    await denied(await request.head(path));
    await denied(
      await request.get(path, {
        headers: {
          Range: "bytes=0-7",
          "If-Modified-Since": "Wed, 21 Oct 2026 00:00:00 GMT",
        },
      }),
    );
  }
  const fresh = await request.get("/collection/consoles/" + data.ids[0], {
    headers: { RSC: "1", "Next-Router-Prefetch": "1" },
  });
  // Prefetch may return only a deferred route tree with 200; it is not a
  // successful item read. Follow it with actual Flight and page navigation.
  expect(fresh.status()).toBe(200);
  expect(fresh.headers()["cache-control"]).toContain("no-store");
  expect(await fresh.text()).not.toContain("Super Nintendo");
  const flight = await request.get("/collection/consoles/" + data.ids[0], {
    headers: { RSC: "1" },
  });
  // Next documents 200 for streamed not-found output and 404 otherwise.
  expect([200, 404]).toContain(flight.status());
  expect(flight.headers()["cache-control"]).toContain("no-store");
  const body = await flight.text();
  expect(body).toMatch(
    /This page is unavailable\.|NEXT_HTTP_ERROR_FALLBACK;404/,
  );
  expect(body).not.toContain("Super Nintendo");
  clean(body, data);
  await page.goto("/collection/consoles/" + data.ids[0]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "This page is unavailable.",
  );
  expect((await request.get(data.logoUrl)).status()).toBe(200);
  await fixture(
    "public-policy",
    JSON.stringify({ publicCollectionEnabled: false }),
  );
  await denied(await request.get(data.logoUrl));
  const component =
    "/api/collection/public/" +
    data.ids[1] +
    "/presentation?component=" +
    data.componentId;
  await denied(await request.get(component));
  await denied(
    await request.get(
      "/api/media/public/components/" +
        data.ids[1] +
        "/" +
        data.componentId +
        "/FRONT",
    ),
  );
});

test("forged roles and public context URLs cannot open private search or original file delivery", async ({
  request,
}) => {
  const data: Data = await fixture("seed-public-privacy");
  const headers = { "x-user-role": "ADMIN", "x-gemukore-audience": "private" };
  for (const id of [data.sourceId, data.displayId, data.imageAssetId]) {
    for (const method of ["get", "head"] as const) {
      const response = await request[method]("/api/media/private/" + id, {
        headers: { ...headers, Range: "bytes=0-7" },
      });
      expect(response.status()).toBe(401);
      expect(response.headers()["cache-control"]).toContain(
        "private, no-store",
      );
      expect(response.headers()["content-range"]).toBeUndefined();
    }
  }
  for (const path of [
    "/api/search/private",
    "/api/search/filtered",
    "/api/search/palette",
    "/api/collection/private",
  ]) {
    const response = await request.post(path, {
      headers,
      data: { q: "PRIVATE", role: "ADMIN" },
    });
    expect(response.status()).toBe(401);
    clean(await response.text(), data);
  }
  for (const q of [
    "audience=private",
    "role=ADMIN",
    "showNotes=true",
    "q=Chrono&q=PRIVATE",
  ]) {
    const response = await request.get("/api/search/public?" + q, { headers });
    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({
      error: "Check the public collection request.",
    });
  }
  // Next's query-object normalization discards this key before constructing
  // the Route Handler URL. It must confer no authority or additional data.
  const normalized = await request.get("/api/search/public?__proto__=private", {
    headers,
  });
  expect(normalized.status()).toBe(200);
  const body = await normalized.json();
  expect(body).toEqual(await (await request.get("/api/search/public")).json());
  clean(JSON.stringify(body), data);
});
