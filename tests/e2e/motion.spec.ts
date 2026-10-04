import { expect, test } from "@playwright/test";

test("detail and list interactions preserve keyboard access with normal motion", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Open example detail" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const detail = page.getByRole("dialog", {
    name: "Controller example detail",
  });
  await expect(detail).toBeVisible();
  const bounds = await detail.boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
  await expect(detail.locator('[data-motion-shared="enabled"]')).toBeVisible();
  const close = detail.getByRole("button", { name: "Close example detail" });
  await expect(close).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(detail).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.getByRole("button", { name: "Reverse example order" }).click();
  const list = page.getByRole("list", { name: "Animation example items" });
  await expect(list.getByRole("listitem")).toHaveText([
    "Sample accessory",
    "Sample game",
    "Sample console",
  ]);
  await page.getByRole("button", { name: "Add example", exact: true }).click();
  await expect(list.getByRole("listitem")).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: "Add example", exact: true }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});

test("reduced motion and a live preference change preserve static, usable patterns", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const media = page.locator("[data-motion-shared]").first();
  await expect(media).toHaveAttribute("data-motion-shared", "enabled");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(media).toHaveAttribute("data-motion-shared", "disabled");
  await page.getByRole("button", { name: "Replay entry examples" }).click();
  for (const selector of [
    ".motion-page-entry",
    ".motion-list-entry",
    '[data-testid="motion-card"]',
  ]) {
    await expect(page.locator(selector).first()).toHaveCSS(
      "animation-name",
      "none",
    );
  }
  const blur = page.locator("[data-motion-blur]");
  await expect(blur).toHaveCSS("opacity", "1");
  await expect(blur).toHaveCSS("filter", "none");
  await expect(blur).toHaveCSS("transform", "none");
  await page.getByRole("button", { name: "Open example detail" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Controller example detail",
  });
  await expect(dialog).toHaveCSS("animation-name", "none");
  await expect(dialog.locator('[data-motion-shared="disabled"]')).toBeVisible();
  await dialog.getByRole("button", { name: "Close example detail" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Reverse example order" }).click();
  await expect(
    page
      .getByRole("list", { name: "Animation example items" })
      .getByRole("listitem")
      .first(),
  ).toHaveText("Sample accessory");
  expect(errors).toEqual([]);
});

test("server-rendered preview stays readable without JavaScript", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    reducedMotion: "reduce",
    viewport: { width: 320, height: 700 },
  });
  const page = await context.newPage();
  try {
    await page.goto(baseURL!);
    await expect(
      page.getByRole("heading", { level: 1, name: "GemuKore" }),
    ).toBeVisible();
    await expect(
      page.getByText("Controller example", { exact: true }),
    ).toBeVisible();
    await expect(page.locator("[data-motion-blur]")).toHaveCSS("opacity", "1");
    await expect(page.locator("[data-motion-blur]")).toHaveCSS(
      "filter",
      "none",
    );
    await expect(
      page
        .getByRole("list", { name: "Animation example items" })
        .getByRole("listitem"),
    ).toHaveCount(3);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await context.close();
  }
});
