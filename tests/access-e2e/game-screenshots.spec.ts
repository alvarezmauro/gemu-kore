import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { monochromePng } from "../helpers/png-fixtures";
import { signedSessionCookie } from "../helpers/access-session";
const exec = promisify(execFile);
async function fixture(command: string, argument?: string) {
  const { stdout } = await exec(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "tests/helpers/access-browser-fixture.ts",
      command,
      ...(argument ? [argument] : []),
    ],
    { env: process.env, timeout: 10000 },
  );
  return JSON.parse(stdout.trim());
}
async function signIn(
  context: BrowserContext,
  role: "ADMIN" | "EDITOR" | "VIEWER" = "ADMIN",
) {
  const { token } = await fixture(
    "sign-in",
    JSON.stringify({ role, email: `${randomUUID()}@example.com` }),
  );
  await context.addCookies([
    {
      name: "__Secure-gemukore.session_token",
      value: signedSessionCookie(token, process.env.BETTER_AUTH_SECRET!),
      url: "https://127.0.0.1:3111",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
test.beforeEach(async () => {
  await fixture("reset-game-creation");
  await fixture("reset");
});
test.afterAll(async () => {
  await fixture("reset-game-creation");
  await fixture("reset");
});
const next = (page: Page) =>
  page.getByRole("button", { name: "Continue", exact: true }).click();
async function create(page: Page) {
  await page.goto("/app/games/new");
  await page.getByRole("option", { name: "Select SNES", exact: true }).click();
  await next(page);
  await page
    .getByRole("option", {
      name: "Select Chrono Trigger (chrono-trigger)",
      exact: true,
    })
    .click();
  await next(page);
  await page
    .getByRole("option", {
      name: "Select Standard Edition (chrono-snes-na)",
      exact: true,
    })
    .click();
  await next(page);
  await next(page);
  await page.getByRole("button", { name: "Save game", exact: true }).click();
  await page.getByRole("link", { name: "View game", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Chrono Trigger", level: 1 }),
  ).toBeVisible();
  return page.url();
}
async function upload(page: Page, caption: string) {
  await page.getByLabel("Screenshot file", { exact: true }).setInputFiles({
    name: "screenshot.png",
    mimeType: "image/png",
    buffer: monochromePng(100, 80),
  });
  await page.getByLabel("Caption", { exact: true }).fill(caption);
  await page
    .getByRole("button", { name: "Upload screenshot", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: /View screenshot/ }).last(),
  ).toBeVisible();
}
test("admin curates screenshot files, source metadata and order, and copies show a keyboard gallery", async ({
  page,
  context,
}, info) => {
  test.setTimeout(60_000);
  const data = await fixture("seed-game-creation");
  await signIn(context, "ADMIN");
  const copyUrl = await create(page);
  await expect(
    page.getByRole("heading", { name: "Screenshots", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Manage release screenshots", exact: true })
    .click();
  await page.getByLabel("Source type", { exact: true }).selectOption("CURATED");
  await page.getByLabel("Source name", { exact: true }).fill("Manual archive");
  await page
    .getByLabel("Source URL", { exact: true })
    .fill("https://example.com/scene");
  await page.getByLabel("Author", { exact: true }).fill("山田");
  await page.getByLabel("Retrieved date", { exact: true }).fill("2024-02-29");
  await upload(page, "Forest scene");
  await expect(page.getByText("Forest scene", { exact: true })).toBeVisible();
  await upload(page, "Castle scene");
  await expect(page.getByRole("link", { name: /View screenshot/ })).toHaveCount(
    2,
  );
  await page
    .getByRole("button", { name: "Edit screenshot 1", exact: true })
    .click();
  await page.getByLabel("Edit caption", { exact: true }).fill("Forest at dusk");
  await page
    .getByLabel("Edit image description", { exact: true })
    .fill("A forest path at sunset");
  await page
    .getByRole("button", { name: "Save screenshot details", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Edit screenshot caption", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Move screenshot 2 up", exact: true })
    .click();
  await expect(
    page
      .getByRole("list", { name: "Screenshot controls" })
      .getByRole("listitem")
      .first(),
  ).toContainText("Castle scene");
  await page.goto(copyUrl);
  await page.getByRole("link", { name: "Screenshots", exact: true }).click();
  await page
    .getByRole("link", { name: "View screenshot 1", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Castle scene");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog")).toContainText("Forest at dusk");
  await expect(page.getByRole("dialog")).toContainText("山田");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("link", { name: "Source page", exact: true }),
  ).toHaveAttribute("href", "https://example.com/scene");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("link", { name: "View screenshot 1", exact: true }),
  ).toBeFocused();
  await page.screenshot({
    path: info.outputPath("game-screenshot-gallery.png"),
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Manage release screenshots", exact: true })
    .click();
  const assets = await fixture("asset-count");
  await page
    .getByRole("button", { name: "Remove screenshot 1", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Remove screenshot 1", exact: true })
    .click();
  await expect(page.getByRole("link", { name: /View screenshot/ })).toHaveCount(
    1,
  );
  expect(await fixture("asset-count")).toBe(assets);
  expect(await fixture("game-creation-state")).toMatchObject([{ media: [] }]);
  expect(
    (await fixture("game-catalog-state")).releases.find(
      (r: { id: string }) => r.id === data.releaseId,
    ).revision,
  ).toBe(6);
});
test("retains stale caption drafts and validates unsafe source links before uploading", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  const data = await fixture("seed-game-creation");
  await signIn(context, "ADMIN");
  await page.goto(`/app/catalog/games/screenshots?releaseId=${data.releaseId}`);
  await page
    .getByLabel("Source URL", { exact: true })
    .fill("javascript:alert(1)");
  await page.getByLabel("Screenshot file", { exact: true }).setInputFiles({
    name: "invalid.png",
    mimeType: "image/png",
    buffer: monochromePng(100, 80),
  });
  await page
    .getByRole("button", { name: "Upload screenshot", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "HTTP or HTTPS" }),
  ).toBeFocused();
  expect(await fixture("asset-count")).toBe(0);
  await page
    .getByLabel("Source URL", { exact: true })
    .fill("https://example.com/source");
  await page
    .getByRole("button", { name: "Upload screenshot", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "View screenshot 1", exact: true }),
  ).toBeVisible();
  const other = await context.newPage();
  await other.goto(page.url());
  await other
    .getByRole("button", { name: "Edit screenshot 1", exact: true })
    .click();
  await other
    .getByLabel("Edit caption", { exact: true })
    .fill("My unsaved caption");
  await page
    .getByRole("button", { name: "Edit screenshot 1", exact: true })
    .click();
  await page
    .getByLabel("Edit caption", { exact: true })
    .fill("Winning caption");
  await page
    .getByRole("button", { name: "Save screenshot details", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Edit screenshot caption", exact: true }),
  ).toHaveCount(0);
  await other.bringToFront();
  await other
    .getByRole("button", { name: "Save screenshot details", exact: true })
    .click();
  await expect(
    other.getByRole("alert").filter({ hasText: "release changed" }),
  ).toBeFocused();
  await expect(other.getByLabel("Edit caption", { exact: true })).toHaveValue(
    "My unsaved caption",
  );
  await other.close();
});
test("readers see source metadata and narrow reduced-motion galleries while editors cannot manage or upload", async ({
  page,
  context,
}, info) => {
  test.setTimeout(60_000);
  const data = await fixture("seed-game-creation");
  await signIn(context, "ADMIN");
  const copyUrl = await create(page);
  await page
    .getByRole("link", { name: "Manage release screenshots", exact: true })
    .click();
  await upload(page, "Scene");
  await context.clearCookies();
  await signIn(context, "EDITOR");
  await page.goto(`/app/catalog/games/screenshots?releaseId=${data.releaseId}`);
  await expect(page).toHaveURL(/\/access-denied$/);
  const response = await page.request.post("/api/uploads", {
    headers: {
      Origin: "https://127.0.0.1:3111",
      "Content-Type": "image/png",
      "X-File-Name": "shot.png",
      "X-GemuKore-Target": JSON.stringify({
        kind: "catalog",
        target: "gameRelease",
        id: data.releaseId,
        role: "SCREENSHOT",
      }),
    },
    data: monochromePng(100, 80),
  });
  expect(response.status()).toBe(403);
  await context.clearCookies();
  await signIn(context, "VIEWER");
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto(copyUrl);
  await expect(
    page.getByRole("link", { name: "Manage release screenshots", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "View screenshot 1", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("screenshot-viewer-mobile-dark.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Close screenshot", exact: true })
    .click();
  await context.clearCookies();
  await page.goto(copyUrl);
  await expect(page).toHaveURL(/\/login$/);
});
