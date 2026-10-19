import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
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

async function fill(
  page: Page,
  values: {
    main?: string;
    extras?: string;
    complete?: string;
    source?: string;
    type?: string;
    url?: string;
  } = {},
) {
  await page
    .getByLabel("Main story (minutes)", { exact: true })
    .fill(values.main ?? "180");
  await page
    .getByLabel("Main + extras (minutes)", { exact: true })
    .fill(values.extras ?? "");
  await page
    .getByLabel("Completionist (minutes)", { exact: true })
    .fill(values.complete ?? "300");
  await page
    .getByLabel("Estimate source type", { exact: true })
    .selectOption(values.type ?? "MANUAL");
  await page
    .getByLabel("Source name", { exact: true })
    .fill(values.source ?? "My estimate");
  await page
    .getByLabel("Source URL (optional)", { exact: true })
    .fill(values.url ?? "");
  await page.getByLabel("Recorded date", { exact: true }).fill("2024-02-29");
}
async function review(page: Page) {
  await page
    .getByRole("button", { name: "Review estimates", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
}
async function confirm(page: Page) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm and save", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "Playtime estimates saved." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review estimates", exact: true }),
  ).toBeEnabled();
}
test("admin reviews a game default, release estimates and explicit removal without mixing sources", async ({
  page,
  context,
}, info) => {
  test.setTimeout(90_000);
  const data = await fixture("seed-game-creation");
  await signIn(context);
  const copyUrl = await create(page);
  await expect(page.getByText("No playtime estimates recorded.")).toBeVisible();
  await page.goto(`/app/catalog/games?kind=game&id=${data.gameId}`);
  await page
    .getByRole("link", { name: "Manage playtime", exact: true })
    .click();
  await fill(page);
  await review(page);
  await expect(page.getByRole("dialog")).toContainText("Game default");
  expect(
    (await fixture("game-catalog-state")).games.find(
      (g: { id: string }) => g.id === data.gameId,
    ).revision,
  ).toBe(1);
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(
    page.getByLabel("Main story (minutes)", { exact: true }),
  ).toHaveValue("180");
  await review(page);
  await confirm(page);
  await page.goto(copyUrl);
  await page.getByRole("link", { name: "Playtime", exact: true }).click();
  const section = page.getByRole("region", { name: "Playtime", exact: true });
  await expect(section).toContainText("Game default estimates");
  await expect(section).toContainText("3 hr");
  await expect(section).toContainText("Unknown");
  await expect(section).toContainText("Manual estimate · My estimate");
  await page
    .getByRole("link", { name: "Manage release playtime", exact: true })
    .click();
  await fill(page, {
    main: "0",
    extras: "",
    complete: "600",
    type: "PROVIDER",
    source: "Curated archive",
    url: "https://example.com/estimates",
  });
  await review(page);
  await expect(page.getByRole("dialog")).toContainText(
    "External source estimate · Curated archive",
  );
  await confirm(page);
  await page.goto(copyUrl);
  await expect(section).toContainText("Estimates for this release.");
  await expect(section).toContainText("0 min");
  await expect(section).toContainText("Unknown");
  await expect(section).not.toContainText("3 hr");
  await page.getByRole("link", { name: "Playtime", exact: true }).click();
  await page.screenshot({
    path: info.outputPath("game-playtime.png"),
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Manage release playtime", exact: true })
    .click();
  await fill(page, {
    main: "",
    extras: "",
    complete: "",
    type: "PROVIDER",
    source: "Unknown estimates archive",
  });
  await review(page);
  await confirm(page);
  await page.goto(copyUrl);
  await expect(section.getByText("Unknown", { exact: true })).toHaveCount(3);
  await expect(section).toContainText("Estimates for this release.");
  await page
    .getByRole("link", { name: "Manage release playtime", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove estimate set", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "The game default will be used where available.",
  );
  await confirm(page);
  await page.goto(copyUrl);
  await expect(section).toContainText("Game default estimates");
  await expect(section).toContainText("3 hr");
  expect(await fixture("game-creation-state")).toMatchObject([
    { notes: null, serialNumber: null },
  ]);
});
test("rejects unsafe source data and preserves stale reviewed drafts and focus", async ({
  page,
  context,
}, info) => {
  test.setTimeout(60_000);
  const data = await fixture("seed-game-creation");
  await signIn(context);
  await page.goto(
    `/app/catalog/games/playtime?kind=release&id=${data.releaseId}`,
  );
  await fill(page, { url: "javascript:alert(1)" });
  await page
    .getByRole("button", { name: "Review estimates", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "HTTP or HTTPS source URL" }),
  ).toBeFocused();
  await page.getByLabel("Source URL (optional)", { exact: true }).fill("");
  await page.getByLabel("Main story (minutes)", { exact: true }).fill("-1");
  await page
    .getByRole("button", { name: "Review estimates", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "whole minutes" }),
  ).toBeFocused();
  await fill(page, { main: "60", source: "Winning estimate" });
  const other = await context.newPage();
  await other.goto(page.url());
  await fill(other, { main: "120", source: "My unsaved estimate" });
  await review(other);
  await review(page);
  await confirm(page);
  await other
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm and save", exact: true })
    .click();
  await expect(
    other.getByRole("alert").filter({ hasText: "catalog record changed" }),
  ).toBeFocused();
  await other
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  await expect(
    other.getByLabel("Main story (minutes)", { exact: true }),
  ).toHaveValue("120");
  await expect(other.getByLabel("Source name", { exact: true })).toHaveValue(
    "My unsaved estimate",
  );
  await expect(
    other.getByRole("button", { name: "Review estimates", exact: true }),
  ).toBeFocused();
  await other
    .getByRole("button", { name: "Reload saved estimates", exact: true })
    .click();
  await expect(other.locator("[data-playtime-revision]")).toHaveAttribute(
    "data-playtime-revision",
    "2",
  );
  await expect(
    other.getByLabel("Main story (minutes)", { exact: true }),
  ).toHaveValue("120");
  await other.setViewportSize({ width: 320, height: 720 });
  await other.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await review(other);
  await expect(
    other.getByRole("region", { name: "Current set", exact: true }),
  ).toContainText("Winning estimate");
  await expect(
    other.getByRole("region", { name: "After saving", exact: true }),
  ).toContainText("My unsaved estimate");
  expect(
    await other.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await other.screenshot({
    path: info.outputPath("playtime-review-mobile-dark.png"),
  });
  await confirm(other);
  await other.close();
});
test("viewers read truthful estimates on narrow dark screens and editors cannot manage canonical sources", async ({
  page,
  context,
}, info) => {
  test.setTimeout(60_000);
  const data = await fixture("seed-game-creation");
  await signIn(context);
  const copyUrl = await create(page);
  await page.goto(
    `/app/catalog/games/playtime?kind=release&id=${data.releaseId}`,
  );
  await fill(page, {
    main: "0",
    type: "PROVIDER",
    source: "Archive with a long source name for a narrow screen",
    url: "https://example.com/source",
  });
  await review(page);
  await confirm(page);
  await context.clearCookies();
  await signIn(context, "EDITOR");
  await page.goto(
    `/app/catalog/games/playtime?kind=release&id=${data.releaseId}`,
  );
  await expect(page).toHaveURL(/\/access-denied$/);
  await context.clearCookies();
  await signIn(context, "VIEWER");
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await context.addInitScript(() =>
    localStorage.setItem("gemukore-theme", "dark"),
  );
  await page.goto(copyUrl);
  await page.getByRole("link", { name: "Playtime", exact: true }).click();
  const section = page.getByRole("region", { name: "Playtime", exact: true });
  await expect(section).toContainText("0 min");
  await expect(section).toContainText("Unknown");
  await expect(
    section.getByRole("link", { name: "Playtime source", exact: true }),
  ).toHaveAttribute("href", "https://example.com/source");
  await expect(
    page.getByRole("link", { name: "Manage release playtime", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("game-playtime-mobile-dark.png"),
    fullPage: true,
  });
  await page.goto(`/app/catalog/games/playtime?kind=game&id=${data.gameId}`);
  await expect(page).toHaveURL(/\/access-denied$/);
  await context.clearCookies();
  await page.goto(copyUrl);
  await expect(page).toHaveURL(/\/login$/);
});
