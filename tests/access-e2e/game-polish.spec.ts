import { expect, test, type BrowserContext } from "@playwright/test";
import { fixture, signIn } from "../helpers/model-browser";

test.beforeEach(async () => {
  await fixture("reset-game-creation");
  await fixture("reset");
});
test.afterAll(async () => {
  await fixture("reset-game-creation");
  await fixture("reset");
});
async function seed(context: BrowserContext) {
  const identity = await signIn(context, "ADMIN");
  const catalog = await fixture("seed-game-creation");
  const copy = await fixture(
    "seed-provenance-copy",
    JSON.stringify({ token: identity.token, releaseId: catalog.releaseId }),
  );
  await fixture(
    "seed-game-detail",
    JSON.stringify({
      id: copy.id,
      releaseId: catalog.releaseId,
      screenshots: true,
    }),
  );
  await fixture("update", JSON.stringify({ role: "VIEWER" }));
  return `/app/games/${copy.id}`;
}

test("game section polish preserves anchors, history and live motion preferences with still cover artwork", async ({
  page,
  context,
}, info) => {
  const url = await seed(context);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`${url}#about-game`);
  const nav = page.getByRole("navigation", { name: "Game sections" });
  const about = nav.getByRole("link", { name: "About", exact: true });
  await expect(about).toHaveAttribute("aria-current", "location");
  await expect(nav).toHaveAttribute("data-section-motion", "enabled");
  const screenshots = nav.getByRole("link", {
    name: "Screenshots",
    exact: true,
  });
  await screenshots.focus();
  await screenshots.press("Enter");
  await expect(screenshots).toHaveAttribute("aria-current", "location");
  await expect(page.locator("#screenshots")).toBeInViewport();
  await page.goBack();
  await expect(about).toHaveAttribute("aria-current", "location");
  await page.reload();
  await expect(about).toHaveAttribute("aria-current", "location");
  const photos = nav.getByRole("link", {
    name: "Personal photos",
    exact: true,
  });
  await photos.click();
  await expect(photos).toHaveAttribute("aria-current", "location");
  await expect(nav.locator('[aria-current="location"]')).toHaveCount(1);
  await expect(about).not.toHaveAttribute("aria-current");
  await about.click();
  await screenshots.click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(nav).toHaveAttribute("data-section-motion", "disabled");
  await expect(screenshots.locator('> [aria-hidden="true"]')).toHaveCSS(
    "transform",
    "none",
  );
  await expect(page.locator("[data-magic-spotlight]")).toHaveCount(0);
  for (const region of await page.locator("[data-motion-blur]").all()) {
    await expect(region).toHaveCSS("opacity", "1");
    await expect(region).toHaveCSS("filter", "none");
    await expect(region).toHaveCSS("transform", "none");
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(nav).toHaveAttribute("data-section-motion", "enabled");
  const cover = page
    .getByRole("region", { name: "Game identity", exact: true })
    .getByRole("img");
  await expect(cover).toHaveCSS("transform", "none");
  await expect(cover).toHaveCSS("filter", "none");
  await expect(cover).toHaveCSS("object-fit", "contain");
  await expect(page.locator("canvas, iframe, video")).toHaveCount(0);
  await nav.scrollIntoViewIfNeeded();
  await nav.screenshot({
    path: info.outputPath("game-section-selection-light.png"),
  });
  await context.addInitScript(() =>
    localStorage.setItem("gemukore-theme", "dark"),
  );
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(screenshots).toHaveAttribute("aria-current", "location");
  await nav.screenshot({
    path: info.outputPath("game-section-selection-dark.png"),
  });
  expect(errors).toEqual([]);
});

test("screenshot polish changes images immediately and cancels decorative motion without disturbing focus", async ({
  page,
  context,
}, info) => {
  const url = await seed(context);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`${url}#screenshots`);
  const first = page.getByRole("link", {
    name: "View screenshot 1",
    exact: true,
  });
  await first.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("img")).toHaveAttribute(
    "alt",
    "Original test scene 1",
  );
  await expect(dialog.locator("[data-screenshot-motion]")).toHaveAttribute(
    "data-screenshot-motion",
    "enabled",
  );
  await page.keyboard.press("ArrowRight");
  await expect(
    dialog.getByRole("heading", { name: "Screenshot 2", exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole("img")).toHaveCount(1);
  await expect(dialog.getByRole("img")).toHaveAttribute(
    "alt",
    "Original test scene 2",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  const image = dialog.locator("[data-screenshot-motion]");
  await expect(image).toHaveAttribute("data-screenshot-motion", "disabled");
  await expect(image).toHaveCSS("opacity", "1");
  await expect(image).toHaveCSS("transform", "none");
  await expect
    .poll(() => image.evaluate((node) => node.getAnimations().length))
    .toBe(0);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByRole("img")).toHaveAttribute(
    "alt",
    "Original test scene 2",
  );
  await expect(
    dialog.getByRole("button", { name: "Next image", exact: true }),
  ).toBeDisabled();
  await expect(dialog).toContainText("Original synthetic test artwork");
  await expect
    .poll(() =>
      dialog
        .getByRole("img")
        .evaluate((node: HTMLImageElement) => node.naturalWidth),
    )
    .toBe(300);
  await page.screenshot({ path: info.outputPath("game-gallery-static.png") });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(image).toHaveAttribute("data-screenshot-motion", "enabled");
  await expect(image).toHaveCSS("opacity", "1");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(first).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("game polish keeps real section and screenshot links usable without JavaScript at 320px", async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: "https://127.0.0.1:3111",
    ignoreHTTPSErrors: true,
    viewport: { width: 320, height: 720 },
  });
  try {
    const url = await seed(context);
    const page = await context.newPage();
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Chrono Trigger",
    );
    await expect(page.getByText("COPY-0001", { exact: true })).toBeVisible();
    await expect(page.locator("[data-magic-spotlight]")).toHaveCount(0);
    const nav = page.getByRole("navigation", { name: "Game sections" });
    await expect(nav.getByRole("link")).toHaveCount(9);
    await nav.getByRole("link", { name: "Playtime", exact: true }).click();
    await expect(page.locator("#game-playtime")).toBeInViewport();
    await nav.getByRole("link", { name: "Screenshots", exact: true }).click();
    await expect(page.locator("#screenshots")).toBeInViewport();
    await expect(
      page.locator("#screenshots [data-motion-blur]").first(),
    ).toHaveCSS("opacity", "1");
    const first = page.getByRole("link", {
      name: "View screenshot 1",
      exact: true,
    });
    const href = await first.getAttribute("href");
    expect(href).toMatch(/^\/api\/media\/private\//);
    const response = await context.request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toMatch(/^image\/png/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await first.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  } finally {
    await context.close();
  }
});
