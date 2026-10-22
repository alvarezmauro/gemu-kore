import { expect, test } from "@playwright/test";
import { fixture, signIn, openModel } from "../helpers/model-browser";
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
test("links physical copies to public console, game and accessory details with identical anonymous/role-safe HTML and Flight", async ({
  page,
  context,
}, info) => {
  const data = await fixture("seed-public-detail");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/collection/consoles");
  await page
    .getByRole("list", { name: "Collection objects" })
    .getByRole("link")
    .click();
  await expect(page).toHaveURL(`/collection/consoles/${data.ids[0]}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Super Nintendo",
  );
  await expect(
    page
      .getByRole("img", { name: "A neutral synthetic exhibit image" })
      .first(),
  ).toBeVisible();
  await expect
    .poll(async () =>
      page
        .getByRole("img", { name: "A neutral synthetic exhibit image" })
        .first()
        .evaluate((node: HTMLImageElement) => node.naturalWidth),
    )
    .toBe(80);
  await expect(page.locator("canvas,iframe,video")).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("public-detail-light.png"),
    fullPage: true,
  });
  for (const role of [undefined, "ADMIN", "EDITOR", "VIEWER"] as const) {
    if (role)
      await signIn(context, role, `detail-${role.toLowerCase()}@example.com`);
    for (const [i, category] of [
      "consoles",
      "games",
      "accessories",
    ].entries()) {
      const url = `/collection/${category}/${data.ids[i]}`;
      const response = await context.request.get(url);
      expect(response.status()).toBe(200);
      expect(response.headers()["cache-control"]).toContain("no-store");
      const html = await response.text(),
        flight = await (
          await context.request.get(`${url}?_rsc=detail`, {
            headers: { RSC: "1" },
          })
        ).text();
      for (const content of [html, flight])
        for (const hidden of [
          "PRIVATE-SERIAL",
          "PRIVATE-NOTE",
          "Private active defect",
          "/api/media/private",
          "objectKey",
          "storageNamespace",
          "@example.com",
          data.privateId,
        ])
          expect(content).not.toContain(hidden);
    }
  }
});
test("shows safe catalog 3D only after activation, supports close and discards descriptors after rights withdrawal", async ({
  page,
  request,
}) => {
  const data = await fixture("seed-public-detail");
  await page.emulateMedia({ reducedMotion: "reduce" });
  let modelRequests = 0;
  page.on("request", (r) => {
    if (r.url().includes(`/catalog/${data.modelUseId}`)) modelRequests++;
  });
  await page.goto(`/collection/consoles/${data.ids[0]}`);
  expect(modelRequests).toBe(0);
  await expect(page.locator("canvas")).toHaveCount(0);
  const viewer = await openModel(page);
  expect(modelRequests).toBe(1);
  await expect(
    viewer.getByRole("button", { name: "Auto rotate", exact: true }),
  ).toBeDisabled();
  await viewer.getByRole("button", { name: "Close 3D preview" }).click();
  await fixture("public-revoke-asset", data.modelAssetId);
  await viewer.getByRole("button", { name: "View in 3D", exact: true }).click();
  await expect(viewer.getByRole("alert")).toContainText("unavailable");
  await expect(page.locator("canvas")).toHaveCount(0);
  const denied = await request.get(
    `/api/media/public/items/${data.ids[0]}/catalog/${data.modelUseId}`,
    { headers: { Range: "bytes=0-7", "If-None-Match": "stale" } },
  );
  expect(denied.status()).toBe(404);
  expect(denied.headers()["content-range"]).toBeUndefined();
  await page.reload();
  await expect(
    page.getByRole("region", { name: "3D preview", exact: true }),
  ).toHaveCount(0);
});
test("serves reviewed component slots on demand and denies every new media representation after unpublication", async ({
  page,
  request,
}) => {
  const data = await fixture("seed-public-detail");
  const itemId = data.ids[1];
  await page.goto(`/collection/games/${itemId}`);
  await expect(
    page.getByRole("heading", { name: "Explore the physical edition" }),
  ).toBeVisible();
  await openModel(page);
  const slot = `/api/media/public/components/${itemId}/${data.componentId}/FRONT`;
  expect((await request.get(slot)).status()).toBe(200);
  expect(
    (
      await request.get(
        `/api/media/public/components/${data.ids[0]}/${data.componentId}/FRONT`,
      )
    ).status(),
  ).toBe(404);
  await fixture("public-unpublish", itemId);
  for (const [method, headers] of [
    ["get", {}],
    ["head", {}],
    ["get", { Range: "bytes=broken" }],
    ["get", { "If-None-Match": "cached" }],
  ] as const) {
    const response = await request[method](slot, { headers });
    expect(response.status()).toBe(404);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["content-range"]).toBeUndefined();
  }
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "This page is unavailable.",
  );
  await expect(page.locator("canvas")).toHaveCount(0);
});
test("reads details and exact display images without JavaScript, handles missing/wrong categories and keeps 320px dark layouts usable", async ({
  browser,
  page,
  request,
}, info) => {
  const data = await fixture(
    "seed-public-detail",
    JSON.stringify({ longTitle: true }),
  );
  const nojs = await browser.newContext({
    javaScriptEnabled: false,
    ignoreHTTPSErrors: true,
  });
  const staticPage = await nojs.newPage();
  await staticPage.goto(
    `https://127.0.0.1:3111/collection/consoles/${data.ids[0]}`,
  );
  await expect(staticPage.getByRole("heading", { level: 1 })).toContainText(
    "ConsoleLong",
  );
  await expect(
    staticPage.getByRole("heading", {
      name: "Catalog information",
      exact: true,
    }),
  ).toBeVisible();
  await expect(staticPage.locator("canvas")).toHaveCount(0);
  await nojs.close();
  for (const url of [
    `/collection/games/${data.ids[0]}`,
    `/collection/consoles/${data.privateId}`,
    "/collection/games/not-a-uuid",
  ]) {
    const r = await request.get(url);
    expect(r.status()).toBe(404);
    expect(await r.text()).not.toContain("PRIVATE-SERIAL");
  }
  const optimized = await request.get(
    `/_next/image?${new URLSearchParams({ url: data.imageUrl, w: "640", q: "75" })}`,
  );
  expect(optimized.status()).toBe(400);
  const bytes = await request.get(data.imageUrl, {
    headers: { Range: "bytes=0-7" },
  });
  expect(bytes.status()).toBe(206);
  expect((await bytes.body()).length).toBe(8);
  expect(bytes.headers()["content-range"]).toBe(`bytes 0-7/${data.photoSize}`);
  for (const url of [
    `${data.imageUrl}?asset=${data.imageAssetId}`,
    `/api/media/public/items/${data.ids[0]}/catalog/${data.imageAssetId}`,
  ])
    expect((await request.get(url)).status()).toBe(404);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto(`/collection/consoles/${data.ids[0]}`);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("public-detail-dark-320.png"),
    fullPage: true,
  });
  await fixture(
    "public-policy",
    JSON.stringify({ publicCollectionEnabled: false }),
  );
  expect((await request.head(data.imageUrl)).status()).toBe(404);
  expect(
    (await request.get(`/collection/consoles/${data.ids[0]}`)).status(),
  ).toBe(404);
});

test("administrator withdraws an exact media use through a fresh review without changing text publication", async ({
  page,
  context,
  request,
}) => {
  const data = await fixture("seed-public-detail");
  await signIn(context, "ADMIN");
  await page.goto(`/app/settings/public?item=${data.ids[0]}`);
  const media = page
    .getByRole("heading", { name: "Synthetic collection exhibit", exact: true })
    .locator("..");
  await media
    .getByRole("button", { name: "Review withdrawal", exact: true })
    .click();
  await expect(media.getByRole("checkbox")).toBeVisible();
  await media.getByRole("checkbox").check();
  await media
    .getByRole("button", { name: "Save reviewed media", exact: true })
    .click();
  await expect
    .poll(async () => (await request.get(data.imageUrl)).status())
    .toBe(404);
  const detail = await request.get(`/collection/consoles/${data.ids[0]}`);
  expect(detail.status()).toBe(200);
  expect(await detail.text()).not.toContain(data.imageUrl);
});
