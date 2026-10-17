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
  await fixture("reset-catalog");
  await fixture("reset");
});
test.afterAll(async () => {
  await fixture("reset-catalog");
  await fixture("reset");
});
async function save(page: Page) {
  const old = Number(
    await page
      .locator("[data-game-catalog-revision]")
      .getAttribute("data-game-catalog-revision"),
  );
  await page
    .getByRole("button", { name: "Save catalog record", exact: true })
    .click();
  await expect(page.locator("[data-game-catalog-revision]")).toHaveAttribute(
    "data-game-catalog-revision",
    String(old + 1),
  );
}
async function pick(page: Page, label: string, name: string) {
  await page
    .getByLabel(`Find ${label.toLowerCase()}`, { exact: true })
    .fill(name);
  await page
    .getByLabel(`Find ${label.toLowerCase()}`, { exact: true })
    .press("Enter");
  await page
    .getByRole("button", {
      name:
        label === "Game" ? `Select ${name} (chrono-trigger)` : `Select ${name}`,
      exact: true,
    })
    .click();
}

test("curates games and releases with market dates, scoped credits and stable edition contents", async ({
  page,
  context,
}, info) => {
  test.setTimeout(60_000);
  await fixture("seed-game-catalog");
  await signIn(context);
  await page.goto("/app/catalog");
  await page
    .getByRole("link", { name: "Manage game catalog", exact: true })
    .click();
  await page.getByRole("link", { name: "Add game", exact: true }).click();
  await page.getByLabel("Game name", { exact: true }).fill("Chrono Trigger");
  await page.getByLabel("Slug", { exact: true }).fill("chrono-trigger");
  await page
    .getByRole("button", { name: "Add developer", exact: true })
    .click();
  await pick(page, "Developer 1", "Square");
  await save(page);
  await page.getByRole("link", { name: "Game releases", exact: true }).click();
  await page
    .getByRole("link", { name: "Add game release", exact: true })
    .click();
  await pick(page, "Game", "Chrono Trigger");
  await pick(page, "Platform", "SNES");
  await page.getByLabel("Slug", { exact: true }).fill("chrono-trigger-snes-na");
  await page
    .getByLabel("Edition name", { exact: true })
    .fill("Standard Edition");
  await page.getByRole("button", { name: "Add market", exact: true }).click();
  await pick(page, "Market 1", "North America");
  await page.getByLabel("Market 1 year", { exact: true }).fill("1995");
  await page.getByLabel("Market 1 month", { exact: true }).fill("8");
  await page
    .getByRole("button", { name: "Add company credit", exact: true })
    .click();
  await pick(page, "Company 1", "Square");
  const seed = await fixture("game-catalog-state");
  expect(seed.games).toHaveLength(1);
  await page
    .getByLabel("Company 1 market scope", { exact: true })
    .selectOption({ label: "North America" });
  await page
    .getByRole("button", { name: "Add expected component", exact: true })
    .click();
  await page.getByLabel("Component 1 name", { exact: true }).fill("Manual");
  await page
    .getByLabel("Component 1 kind", { exact: true })
    .selectOption("MANUAL");
  await save(page);
  const before = await fixture("game-catalog-state");
  expect(before.copies).toBe(0);
  expect(before.releases[0]).toMatchObject({
    regions: [{ releaseYear: 1995, releaseMonth: 8, releaseDay: null }],
    companies: [{ role: "PUBLISHER" }],
    includedItems: [{ name: "Manual", quantity: 1 }],
  });
  await page.getByLabel("Component 1 quantity", { exact: true }).fill("2");
  await save(page);
  const after = await fixture("game-catalog-state");
  expect(after.releases[0].includedItems[0]).toMatchObject({
    id: before.releases[0].includedItems[0].id,
    quantity: 2,
  });
  await expect(
    page.getByRole("heading", { name: "Change history", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("game-release-catalog.png"),
    fullPage: true,
  });
});
test("preserves stale drafts and archives/restores the shared title without deleting it", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/app/catalog/games?new=1");
  await page.getByLabel("Game name", { exact: true }).fill("Shared title");
  await page.getByLabel("Slug", { exact: true }).fill("shared-title");
  await save(page);
  const url = page.url();
  const other = await context.newPage();
  await other.goto(url);
  await other
    .getByLabel("Description", { exact: true })
    .fill("Saved elsewhere");
  await page
    .getByLabel("Description", { exact: true })
    .fill("My unsaved draft");
  await save(other);
  await page.bringToFront();
  await page
    .getByRole("button", { name: "Save catalog record", exact: true })
    .click();
  await expect(
    page.locator("[data-game-catalog-revision]").getByRole("alert"),
  ).toContainText("changed");
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue(
    "My unsaved draft",
  );
  await expect(
    page.locator("[data-game-catalog-revision]").getByRole("alert"),
  ).toBeFocused();
  await page.reload();
  await page
    .getByRole("button", { name: "Archive record", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Restore record", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Game name", { exact: true })).toBeDisabled();
  expect((await fixture("game-catalog-state")).games).toHaveLength(1);
  await page
    .getByRole("button", { name: "Restore record", exact: true })
    .click();
  await expect(page.getByLabel("Game name", { exact: true })).toBeEnabled();
  await other.close();
});
test("enforces private/admin access and keeps the catalog usable on a narrow dark display", async ({
  page,
  context,
}, info) => {
  await page.goto("/app/catalog/games");
  await expect(page).toHaveURL(/\/login$/);
  await signIn(context, "EDITOR");
  await page.goto("/app/catalog/games");
  await expect(page).toHaveURL(/\/access-denied$/);
  await signIn(context, "ADMIN");
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/app/catalog/games?new=1");
  await page.getByLabel("Game name", { exact: true }).fill("A".repeat(200));
  await page.getByLabel("Slug", { exact: true }).fill("long-title");
  await save(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("game-catalog-mobile-dark.png"),
    fullPage: true,
  });
});
