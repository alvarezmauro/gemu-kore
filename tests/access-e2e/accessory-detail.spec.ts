import { expect, test } from "@playwright/test";
import { fixture, signIn, openModel } from "../helpers/model-browser";
test.beforeEach(async () => {
  await fixture("reset-game-creation");
  await fixture("reset");
});
test.afterAll(async () => {
  await fixture("reset-game-creation");
  await fixture("reset");
});
async function seed(context: Parameters<typeof signIn>[0], options = {}) {
  await signIn(context);
  const catalog = await fixture("seed-accessory-copies");
  const detail = await fixture(
    "seed-accessory-detail",
    JSON.stringify({ ...catalog, ...options }),
  );
  return { ...catalog, ...detail };
}
test("accessory detail separates product and copy facts, galleries and on-demand 3D/video", async ({
  page,
  context,
}, info) => {
  test.setTimeout(90000);
  const d = await seed(context),
    errors: string[] = [],
    models: string[] = [],
    external: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === `/api/media/private/${d.modelId}`)
      models.push(request.url());
    if (!request.url().startsWith("https://127.0.0.1:3111"))
      external.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/app/accessories/${d.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(d.title);
  const hero = page.getByRole("region", {
    name: "Accessory identity preview",
    exact: true,
  });
  await expect(hero).toContainText("2001");
  await expect(hero).toContainText("Sony");
  await expect(
    hero.getByRole("img", {
      name: "Synthetic black variant image",
      exact: true,
    }),
  ).toBeVisible();
  await expect
    .poll(() =>
      hero
        .getByRole("img", {
          name: "Synthetic black variant image",
          exact: true,
        })
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBe(300);
  await expect(page.locator("canvas,iframe,video")).toHaveCount(0);
  expect(models).toEqual([]);
  expect(external).toEqual([]);
  const copy = page.getByRole("region", { name: "My copy", exact: true });
  await expect(copy).toContainText("COPY-DS2-001");
  await expect(copy).toContainText("Private controller notes.");
  await expect(copy).toContainText("Cable wear");
  const product = page.getByRole("region", {
    name: "Product information",
    exact: true,
  });
  await expect(product).toContainText("Description for the black controller.");
  await expect(product).not.toContainText("COPY-DS2-001");
  const specifications = page.getByRole("region", {
    name: "Specifications",
    exact: true,
  });
  await expect(specifications).toContainText("2 m");
  await expect(specifications).not.toContainText("Wired");
  await expect(
    page.getByRole("region", { name: "Compatibility", exact: true }),
  ).toContainText("Analog support varies by game");
  const gallery = page.getByRole("region", { name: "Gallery", exact: true });
  await expect(gallery.getByRole("img")).toHaveCount(3);
  await expect(gallery).toContainText("Personal controller photo");
  await gallery
    .getByText("Image source details", { exact: true })
    .first()
    .click();
  await expect(gallery).toContainText("Original synthetic test artwork");
  for (const label of [
    "My copy",
    "Product information",
    "Compatibility",
    "Gallery",
    "Specifications",
    "Video",
  ]) {
    const link = page
      .getByRole("navigation", { name: "Accessory sections" })
      .getByRole("link", { name: label, exact: true });
    const hash = (await link.getAttribute("href"))!;
    await link.click();
    await expect.poll(() => new URL(page.url()).hash).toBe(hash);
    await expect(page.locator(hash)).toBeInViewport();
  }
  await page.goto(`/app/accessories/${d.id}`);
  await page.screenshot({
    path: info.outputPath("accessory-detail-light.png"),
    fullPage: true,
  });
  const viewer = await openModel(page);
  expect(models).toHaveLength(1);
  await expect(
    viewer.getByRole("button", { name: "Auto rotate", exact: true }),
  ).toBeDisabled();
  await viewer
    .getByRole("button", { name: "Rotate left", exact: true })
    .click();
  await viewer
    .getByRole("button", { name: "Close 3D preview", exact: true })
    .click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(
    viewer.getByRole("button", { name: "View in 3D", exact: true }),
  ).toBeFocused();
  expect(external).toEqual([]);
  await page.route("https://www.youtube-nocookie.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<p>Synthetic video frame</p>",
    }),
  );
  const video = page.getByRole("region", { name: "Video", exact: true });
  await video.getByRole("button", { name: "Load video", exact: true }).click();
  const frame = page.getByTitle("Video for DualShock 2", { exact: true });
  await expect(frame).toHaveAttribute(
    "src",
    "https://www.youtube-nocookie.com/embed/AbCdEf123_-?playsinline=1",
  );
  await video.getByRole("button", { name: "Close video", exact: true }).click();
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("accessory detail retains unknown states and read-only access with long titles at 320px and 200% text", async ({
  page,
  context,
}, info) => {
  const d = await seed(context, { longTitle: true, empty: true });
  await fixture("update", JSON.stringify({ role: "VIEWER" }));
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await context.addInitScript(() =>
    localStorage.setItem("gemukore-theme", "dark"),
  );
  await page.goto(`/app/accessories/${d.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(d.title);
  await expect(
    page.getByRole("button", { name: "Edit accessory", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /^Review accessory metadata/ }),
  ).toHaveCount(0);
  await expect(
    page.getByText("No accessory preview available", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No video recorded.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No technical specifications recorded.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("canvas,iframe,video")).toHaveCount(0);
  await expect(page.locator("[data-magic-spotlight]")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("accessory-detail-narrow-dark.png"),
    fullPage: true,
  });
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("link", { name: "View photos", exact: true }),
  ).toBeVisible();
  await fixture("update", JSON.stringify({ enabled: false }));
  await page.reload();
  await expect(page).toHaveURL(/access-denied/);
  await expect(page.getByText("Private controller notes.")).toHaveCount(0);
});
test("accessory 3D rejects stale selection before transfer and keeps download/static details after delivery failure", async ({
  page,
  context,
}) => {
  const d = await seed(context);
  await page.goto(`/app/accessories/${d.id}`);
  let transfers = 0;
  page.on("request", (req) => {
    if (new URL(req.url()).pathname === `/api/media/private/${d.modelId}`)
      transfers++;
  });
  await fixture(
    "accessory-variant-revise",
    JSON.stringify({ id: d.variantId }),
  );
  const viewer = page.getByRole("region", { name: "3D preview", exact: true });
  await viewer.getByRole("button", { name: "View in 3D", exact: true }).click();
  await expect(viewer.getByRole("alert")).toContainText("changed");
  expect(transfers).toBe(0);
  await page.reload();
  await page.route(`**/api/media/private/${d.modelId}`, (route) =>
    route.fulfill({ status: 404, body: "Unavailable" }),
  );
  await viewer.getByRole("button", { name: "View in 3D", exact: true }).click();
  await expect(viewer.getByRole("alert")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Download 3D file", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Product information", exact: true }),
  ).toContainText("Description for the black controller.");
  const previousTransfers = transfers;
  await fixture("update", JSON.stringify({ enabled: false }));
  await viewer
    .getByRole("button", { name: "Try 3D again", exact: true })
    .click();
  await expect(viewer.getByRole("alert")).toContainText("access changed");
  expect(transfers).toBe(previousTransfers);
  expect(
    (await context.request.get(`/api/media/private/${d.modelId}`)).ok(),
  ).toBe(false);
});
