import { expect, test } from "@playwright/test";
import { fixture, signIn } from "../helpers/model-browser";
test.beforeEach(async () => {
  await fixture("reset-search");
  await fixture("reset");
});
test.afterAll(async () => {
  await fixture("reset-search");
  await fixture("reset");
});
const stats = {
  "Total items": "12",
  Consoles: "4",
  Games: "4",
  Accessories: "4",
  "Boxed items": "4",
  "Items with active defects": "2",
};
test("dashboard shows live copy counts, recent thumbnails and working collection links", async ({
  page,
  context,
}, info) => {
  const identity = await signIn(context),
    data = await fixture("seed-dashboard"),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto("/app");
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Your collection",
      exact: true,
    }),
  ).toBeVisible();
  for (const [name, value] of Object.entries(stats)) {
    const region = page.getByRole("region", { name, exact: true });
    await expect(region.locator("[data-number-ticker] > .sr-only")).toHaveText(
      value,
    );
    await expect(
      region.locator("[data-number-ticker] > [aria-hidden=true]"),
    ).toHaveText(value);
  }
  const recent = page.getByRole("list", { name: "Recently added copies" });
  await expect(recent.getByRole("listitem")).toHaveCount(8);
  await expect(recent.getByRole("link").first()).toHaveAttribute(
    "href",
    `/app/accessories/${data.newestId}`,
  );
  const photo = recent.getByRole("img", {
    name: "Synthetic recent copy photo",
    exact: true,
  });
  await expect
    .poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(300);
  await expect(page.locator("body")).not.toContainText("PRIVATE-NOTE");
  await expect(page.locator("body")).not.toContainText("PRIVATE-SERIAL");
  await expect(page.locator("body")).not.toContainText(identity.email);
  await expect(page.locator("canvas,iframe,video")).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("dashboard-light.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Browse games", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/collection\?type=game$/);
  await page.goto("/app");
  await recent.getByRole("link").first().click();
  await expect(page).toHaveURL(
    new RegExp(`/app/accessories/${data.newestId}$`),
  );
  expect(errors).toEqual([]);
});
test("dashboard adapts to live motion preferences, narrow dark layouts, zoom and revoked roles", async ({
  page,
  context,
}, info) => {
  await signIn(context, "ADMIN");
  await fixture("seed-dashboard", JSON.stringify({ longTitle: true }));
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({
    reducedMotion: "no-preference",
    colorScheme: "dark",
  });
  await context.addInitScript(() =>
    localStorage.setItem("gemukore-theme", "dark"),
  );
  await page.goto("/app");
  const tickers = page.locator("[data-number-ticker]");
  await expect(tickers.first()).toHaveAttribute(
    "data-ticker-motion",
    "enabled",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(tickers.first()).toHaveAttribute(
    "data-ticker-motion",
    "disabled",
  );
  await expect(tickers.first().locator("[aria-hidden=true]")).toHaveText("12");
  await expect(page.locator("[data-motion-layout=enabled]")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("dashboard-narrow-dark.png"),
    fullPage: true,
  });
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await fixture("update", JSON.stringify({ role: "VIEWER" }));
  await page.reload();
  await expect(page.getByText("Viewer", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /^Add (console|game|accessory)$/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Manage console catalog", exact: true }),
  ).toHaveCount(0);
  await fixture("update", JSON.stringify({ enabled: false }));
  await page.reload();
  await expect(page).toHaveURL(/access-denied/);
  await expect(page.locator("[data-number-ticker]")).toHaveCount(0);
});
test("dashboard shows an honest empty collection and refreshes after a copy is removed", async ({
  page,
  context,
}) => {
  await signIn(context, "VIEWER");
  await page.goto("/app");
  await expect(
    page.getByRole("heading", {
      name: "Your collection starts here",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("[data-number-ticker] > .sr-only")).toHaveText([
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
  ]);
  await expect(
    page.getByRole("link", { name: "Add your first game", exact: true }),
  ).toHaveCount(0);
  const d = await fixture("seed-dashboard");
  await page.reload();
  await expect(
    page
      .getByRole("region", { name: "Total items", exact: true })
      .locator(".sr-only"),
  ).toHaveText("12");
  await fixture("dashboard-delete-copy", d.newestId);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/app?*", async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page
      .getByRole("button", { name: "Refresh overview", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Refreshing…", exact: true }),
    ).toBeDisabled();
    await expect(
      page
        .getByRole("region", { name: "Total items", exact: true })
        .locator(".sr-only"),
    ).toHaveText("12");
  } finally {
    release();
  }
  await expect(
    page
      .getByRole("region", { name: "Total items", exact: true })
      .locator(".sr-only"),
  ).toHaveText("11");
  await expect(
    page
      .getByRole("list", { name: "Recently added copies" })
      .getByRole("link")
      .first(),
  ).not.toHaveAttribute("href", `/app/accessories/${d.newestId}`);
});
test("dashboard remains complete without JavaScript and keeps image failures local", async ({
  browser,
  page,
  context,
}, info) => {
  await signIn(context, "VIEWER");
  const d = await fixture("seed-dashboard");
  await page.route(`**/api/media/private/${d.photoId}`, (route) =>
    route.fulfill({ status: 404, body: "Unavailable" }),
  );
  await page.goto("/app");
  await expect(page.getByText("Unavailable", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Recently added copies" }).getByRole("link"),
  ).toHaveCount(8);
  const noJs = await browser.newContext({
    baseURL: "https://127.0.0.1:3111",
    ignoreHTTPSErrors: true,
    javaScriptEnabled: false,
    viewport: { width: 320, height: 740 },
  });
  try {
    await signIn(noJs, "VIEWER", "dashboard-nojs@example.com");
    const read = await noJs.newPage();
    await read.goto("/app");
    await expect(
      read.getByRole("region", { name: "Total items", exact: true }),
    ).toBeVisible();
    await expect(
      read
        .locator("[data-number-ticker]")
        .first()
        .locator("[aria-hidden=true]"),
    ).toHaveText("12");
    await expect(
      read
        .getByRole("list", { name: "Recently added copies" })
        .getByRole("link"),
    ).toHaveCount(8);
    await fixture("dashboard-delete-copy", d.newestId);
    await read
      .getByRole("button", { name: "Refresh overview", exact: true })
      .click();
    await expect(
      read
        .getByRole("region", { name: "Total items", exact: true })
        .locator(".sr-only"),
    ).toHaveText("11");
    expect(
      await read.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await read.screenshot({
      path: info.outputPath("dashboard-no-js.png"),
      fullPage: true,
    });
  } finally {
    await noJs.close();
  }
});
