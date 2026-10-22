import { expect, test, type Page } from "@playwright/test";
import { fixture, signIn } from "../helpers/model-browser";

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
async function confirmSettings(page: Page) {
  await page
    .getByRole("button", { name: "Review settings", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save reviewed settings" }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "I reviewed these settings and their effect on published copies.",
    })
    .check();
  await page.getByRole("button", { name: "Save reviewed settings" }).click();
  await expect(
    page.getByRole("button", { name: "Review settings", exact: true }),
  ).toBeVisible();
}

test("public home uses published-only data for every visitor and never delivers private payloads", async ({
  page,
  context,
  request,
}, info) => {
  const data = await fixture("seed-public-home");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto("/collection");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "A small history of play",
  );
  await expect(
    page
      .getByRole("list", { name: "Recently added objects" })
      .getByRole("listitem"),
  ).toHaveCount(3);
  await expect(page.locator("[data-number-ticker] > .sr-only")).toHaveText([
    "3",
    "1",
    "1",
    "1",
  ]);
  const html = await response!.text();
  for (const forbidden of [
    "PRIVATE-NOTE",
    "PRIVATE-SERIAL",
    "Private active defect",
    ...data.privateIds,
    "/api/media/private",
    "browser-identity@example.com",
  ])
    expect(html).not.toContain(forbidden);
  await expect(page.locator("canvas,iframe,video,img")).toHaveCount(0);
  await page.getByRole("link", { name: "Step inside" }).click();
  await expect(
    page.getByRole("heading", { name: "Recently added", exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: info.outputPath("public-home-light.png"),
    fullPage: true,
  });
  for (const role of ["ADMIN", "EDITOR", "VIEWER"] as const) {
    await signIn(context, role, `public-${role.toLowerCase()}@example.com`);
    await page.goto("/collection");
    await expect(page.locator("[data-number-ticker] > .sr-only")).toHaveText([
      "3",
      "1",
      "1",
      "1",
    ]);
    await expect(
      page.getByRole("button", { name: /Review|Approve|Save/ }),
    ).toHaveCount(0);
    const flight = await context.request.get("/collection?_rsc=public-test", {
      headers: { RSC: "1" },
    });
    expect(flight.headers()["cache-control"]).toContain("no-store");
    const payload = await flight.text();
    for (const forbidden of [
      "PRIVATE-NOTE",
      "PRIVATE-SERIAL",
      ...data.privateIds,
    ])
      expect(payload).not.toContain(forbidden);
  }
  const root = await request.get("/", { maxRedirects: 0 });
  expect(root.status()).toBe(307);
  expect(root.headers().location).toBe("/collection");
  expect(root.headers()["cache-control"]).toContain("no-store");
  for (const url of ["/collection", "/collection/games/missing"]) {
    const head = await request.head(url);
    expect(head.headers()["cache-control"]).toContain("no-store");
  }
});

test("private, empty and paused homes stay honest and work without JavaScript", async ({
  browser,
  page,
  context,
  request,
}, info) => {
  const data = await fixture("seed-public-home");
  await fixture(
    "public-policy",
    JSON.stringify({ publicCollectionEnabled: false }),
  );
  await signIn(context, "ADMIN");
  const response = await page.goto("/collection");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "This collection is currently private.",
  );
  const html = await response!.text();
  for (const forbidden of [
    "A small history of play",
    "Objects worth keeping",
    ...data.publishedIds,
    ...data.privateIds,
    "Objects on display",
    "/app/",
  ])
    expect(html).not.toContain(forbidden);
  await page.goto("/app/settings/public");
  await page
    .getByRole("checkbox", { name: /Open the public collection/ })
    .check();
  await confirmSettings(page);
  expect((await fixture("public-state")).published).toBe(3);
  const noJs = await browser.newContext({
    baseURL: "https://127.0.0.1:3111",
    ignoreHTTPSErrors: true,
    javaScriptEnabled: false,
    viewport: { width: 320, height: 740 },
  });
  try {
    const read = await noJs.newPage();
    await read.goto("/collection");
    await expect(read.getByRole("heading", { level: 1 })).toHaveText(
      "A small history of play",
    );
    await expect(
      read.locator("[data-number-ticker] > [aria-hidden=true]"),
    ).toHaveText(["3", "1", "1", "1"]);
    await expect(read.getByRole("listitem")).toHaveCount(3);
    expect(
      await read.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await read.screenshot({
      path: info.outputPath("public-home-no-js.png"),
      fullPage: true,
    });
    await fixture(
      "public-policy",
      JSON.stringify({ publicCollectionEnabled: false }),
    );
    await read.reload();
    await expect(read.getByRole("heading", { level: 1 })).toHaveText(
      "This collection is currently private.",
    );
    expect(
      (
        await request.get("/collection", {
          headers: { "if-none-match": '"old"' },
        })
      ).status(),
    ).toBe(200);
  } finally {
    await noJs.close();
  }
  await fixture(
    "public-policy",
    JSON.stringify({ publicCollectionEnabled: true }),
  );
  for (const id of data.publishedIds)
    await fixture("dashboard-delete-copy", id);
  await page.goto("/collection");
  await expect(
    page.getByRole("heading", { name: "The shelves are waiting" }),
  ).toBeVisible();
  await expect(page.locator("[data-number-ticker] > .sr-only")).toHaveText([
    "0",
    "0",
    "0",
    "0",
  ]);
});

test("@critical administrator reviews widening impact, republishes one copy and removes approval", async ({
  page,
  context,
}, info) => {
  const data = await fixture("seed-public-home");
  await signIn(context, "ADMIN");
  await page.goto("/app");
  const openNavigation = page.getByRole("button", { name: "Open navigation" });
  if (await openNavigation.isVisible()) await openNavigation.click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .first()
    .getByRole("link", { name: "Public collection", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /Show collection notes/ }).check();
  await page
    .getByRole("button", { name: "Review settings", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Settings review" }),
  ).toContainText("3 published copies");
  await expect(
    page.getByRole("region", { name: "Settings review" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("checkbox", { name: /I reviewed these settings/ }),
  ).toBeFocused();
  await page.screenshot({
    path: info.outputPath("publication-settings-review.png"),
    fullPage: true,
  });
  await page
    .getByRole("checkbox", { name: /I reviewed these settings/ })
    .check();
  await page.getByRole("button", { name: "Save reviewed settings" }).click();
  await expect(
    page.getByRole("button", { name: "Review settings", exact: true }),
  ).toBeVisible();
  expect((await fixture("public-state")).published).toBe(0);
  await page
    .getByRole("textbox", { name: "Find a physical copy" })
    .fill("SNS-001");
  await page.getByRole("button", { name: "Find copies" }).click();
  await expect(
    page.getByRole("list", { name: "Copies to review" }).getByRole("listitem"),
  ).toHaveCount(4);
  await page
    .getByRole("link", { name: `Review copy ${data.selectedId}` })
    .click();
  const copy = page.getByRole("region", { name: "Copy publication" });
  await expect(page).toHaveURL(/#copy-review$/);
  await expect(
    copy.getByRole("heading", { name: "Review this physical copy" }),
  ).toBeInViewport();
  await expect(copy).toContainText("PRIVATE-NOTE-9");
  await expect(copy).not.toContainText("PRIVATE-SERIAL");
  await page.screenshot({
    path: info.outputPath("publication-copy-preview.png"),
    fullPage: true,
  });
  await copy
    .getByRole("button", { name: "Review publication", exact: true })
    .click();
  await expect(copy.locator('div[tabindex="-1"]')).toBeFocused();
  await expect(
    copy.getByRole("button", { name: "Approve reviewed copy" }),
  ).toBeDisabled();
  await copy
    .getByRole("checkbox", { name: /I reviewed this public text/ })
    .check();
  await copy.getByRole("button", { name: "Approve reviewed copy" }).click();
  await expect(
    copy.getByRole("button", { name: "Review removal", exact: true }),
  ).toBeVisible();
  expect((await fixture("public-state")).published).toBe(1);
  await page.goto("/collection");
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(page.locator("body")).not.toContainText("PRIVATE-NOTE");
  await page.goto(`/app/settings/public?item=${data.selectedId}`);
  await copy
    .getByRole("button", { name: "Review removal", exact: true })
    .click();
  await copy
    .getByRole("checkbox", { name: /I reviewed this copy and want/ })
    .check();
  await copy
    .getByRole("button", { name: "Make reviewed copy private" })
    .click();
  await expect(
    copy.getByRole("button", { name: "Review publication", exact: true }),
  ).toBeVisible();
  expect((await fixture("public-state")).published).toBe(0);
});

test("stale reviews and revoked administrators cannot publish, and editors cannot open controls", async ({
  page,
  context,
}) => {
  const data = await fixture("seed-public-home");
  await signIn(context, "ADMIN");
  await page.goto(`/app/settings/public?item=${data.privateIds[0]}`);
  const copy = page.getByRole("region", { name: "Copy publication" });
  await copy
    .getByRole("button", { name: "Review publication", exact: true })
    .click();
  await copy
    .getByRole("checkbox", { name: /I reviewed this public text/ })
    .check();
  await fixture(
    "public-policy",
    JSON.stringify({ publicCollectionEnabled: false }),
  );
  await copy.getByRole("button", { name: "Approve reviewed copy" }).click();
  await expect(copy.getByRole("alert")).toContainText(
    "Review it again before saving",
  );
  expect((await fixture("public-state")).published).toBe(3);
  await page.reload();
  await copy
    .getByRole("button", { name: "Review publication", exact: true })
    .click();
  await copy
    .getByRole("checkbox", { name: /I reviewed this public text/ })
    .check();
  await fixture("update", JSON.stringify({ role: "EDITOR" }));
  await copy.getByRole("button", { name: "Approve reviewed copy" }).click();
  await expect(copy.getByRole("alert")).toContainText("not permitted");
  expect((await fixture("public-state")).published).toBe(3);
  await page.goto("/app/settings/public");
  await expect(page).toHaveURL(/access-denied/);
  await expect(
    page.getByRole("button", { name: "Review settings", exact: true }),
  ).toHaveCount(0);
});

test("public home stays usable at 320px, zoom, both themes and live reduced motion", async ({
  page,
  context,
}, info) => {
  await fixture("seed-public-home", JSON.stringify({ longTitle: true }));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 320, height: 740 });
  await context.addInitScript(() =>
    localStorage.setItem("gemukore-theme", "dark"),
  );
  await page.emulateMedia({
    reducedMotion: "no-preference",
    colorScheme: "dark",
  });
  await page.goto("/collection");
  await expect(page.locator("[data-number-ticker]").first()).toHaveAttribute(
    "data-ticker-motion",
    "enabled",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("[data-number-ticker]").first()).toHaveAttribute(
    "data-ticker-motion",
    "disabled",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("public-home-narrow-dark.png"),
    fullPage: true,
  });
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Choose theme" }).click();
  await page.getByRole("menuitemradio", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/light/);
  expect(errors).toEqual([]);
});
