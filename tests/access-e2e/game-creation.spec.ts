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
async function chooseIdentity(page: Page) {
  await page.getByRole("option", { name: "Select SNES", exact: true }).click();
  await next(page);
  await page
    .getByRole("option", {
      name: "Select Chrono Trigger (chrono-trigger)",
      exact: true,
    })
    .click();
  await next(page);
}
async function chooseRelease(page: Page) {
  await page
    .getByRole("option", {
      name: "Select Standard Edition (chrono-snes-na)",
      exact: true,
    })
    .click();
  await next(page);
}
test("editor creates a private game with canonical release filters, defects and a personal photo", async ({
  page,
  context,
}, info) => {
  test.setTimeout(60_000);
  const data = await fixture("seed-game-creation");
  await signIn(context, "EDITOR");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/app/collection");
  await page.getByRole("link", { name: "Add game", exact: true }).click();
  await chooseIdentity(page);
  await expect(
    page.getByRole("button", { name: "Create missing release", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Commercial market filter", { exact: true })
    .selectOption(data.regionId);
  await page
    .getByLabel("Edition filter", { exact: true })
    .selectOption("STANDARD");
  await page
    .getByRole("button", { name: "Apply release filters", exact: true })
    .click();
  await expect(
    page.getByRole("option", {
      name: "Select Deluxe Edition (chrono-snes-unknown)",
      exact: true,
    }),
  ).toHaveCount(0);
  await chooseRelease(page);
  await page.getByLabel("Serial number", { exact: true }).fill("CTR-01");
  await page.getByLabel("Has box", { exact: true }).selectOption("yes");
  await page
    .getByLabel("Location", { exact: true })
    .selectOption(data.locationId);
  await page
    .getByLabel("Private notes", { exact: true })
    .fill("Childhood copy");
  await page.getByRole("button", { name: "Add defect", exact: true }).click();
  await page.getByLabel(/Defect 1 title/).fill("Torn manual");
  await page
    .getByLabel("Defect 1 severity", { exact: true })
    .selectOption("MINOR");
  await page.getByLabel("Choose photos", { exact: true }).setInputFiles({
    name: "game.png",
    mimeType: "image/png",
    buffer: monochromePng(120, 80),
  });
  expect(await fixture("asset-count")).toBe(0);
  await next(page);
  await expect(
    page.getByRole("heading", { name: "Review", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("region", { name: "Selected release", exact: true }),
  ).toContainText("North America: 1995-08");
  await expect(
    page.getByText("1 × Manual · manual", { exact: true }),
  ).toBeVisible();
  expect(await fixture("game-creation-state")).toEqual([]);
  await page.screenshot({
    path: info.outputPath("game-review.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save game", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Game saved privately", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Saved privately", { exact: true })).toHaveCount(
    1,
  );
  const state = await fixture("game-creation-state");
  expect(state).toMatchObject([
    {
      publicationStatus: "PRIVATE",
      serialNumber: "CTR-01",
      hasBox: true,
      locationId: data.locationId,
      notes: "Childhood copy",
      ownedGame: { gameReleaseId: data.releaseId },
      defects: [{ title: "Torn manual", severity: "MINOR" }],
      media: [{ publicApproved: false, type: "PHOTO" }],
    },
  ]);
  expect(errors).toEqual([]);
  await page.getByRole("link", { name: "View game", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Chrono Trigger", level: 1 }),
  ).toBeVisible();
  const navigation = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await navigation.isVisible()) await navigation.click();
  await page
    .getByRole("link", { name: "Browse collection", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your collection", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Chrono Trigger", { exact: true }).first(),
  ).toBeVisible();
});
test("admin explicitly creates a missing catalog release without losing copy details", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  await fixture("seed-game-creation");
  await signIn(context, "ADMIN");
  await page.goto("/app/games/new");
  await chooseIdentity(page);
  await chooseRelease(page);
  await page
    .getByLabel("Private notes", { exact: true })
    .fill("Keep this draft");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page
    .getByRole("button", { name: "Create missing release", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Create missing release", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Slug", { exact: true }).fill("chrono-snes-limited");
  await page
    .getByLabel("Edition name", { exact: true })
    .fill("Limited Edition");
  await page
    .getByLabel("Edition type", { exact: true })
    .selectOption("LIMITED");
  await page
    .getByRole("button", { name: "Save catalog record", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use created release", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Selected release", exact: true }),
  ).toContainText("Limited Edition");
  expect(await fixture("game-creation-state")).toEqual([]);
  await next(page);
  await expect(page.getByLabel("Private notes", { exact: true })).toHaveValue(
    "Keep this draft",
  );
  await next(page);
  await page.getByRole("button", { name: "Save game", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Game saved privately", exact: true }),
  ).toBeVisible();
  const catalog = await fixture("game-catalog-state");
  const created = catalog.releases.find(
    (r: { editionName: string }) => r.editionName === "Limited Edition",
  );
  expect(await fixture("game-creation-state")).toMatchObject([
    { notes: "Keep this draft", ownedGame: { gameReleaseId: created.id } },
  ]);
});
test("retains a stale draft, refreshes release identity and keeps a saved copy after uncertain photo upload", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  const data = await fixture("seed-game-creation");
  await signIn(context, "EDITOR");
  await page.goto("/app/games/new");
  await chooseIdentity(page);
  await chooseRelease(page);
  await page.getByLabel("Private notes", { exact: true }).fill("Keep my notes");
  await page.getByLabel("Choose photos", { exact: true }).setInputFiles({
    name: "game.png",
    mimeType: "image/png",
    buffer: monochromePng(120, 80),
  });
  await next(page);
  await fixture("revise-game-release", data.releaseId);
  await page.getByRole("button", { name: "Save game", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "selected platform, game or release changed" }),
  ).toBeFocused();
  expect(await fixture("game-creation-state")).toEqual([]);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByLabel("Private notes", { exact: true })).toHaveValue(
    "Keep my notes",
  );
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Find matches", exact: true }).click();
  await chooseRelease(page);
  await next(page);
  await page.route("**/api/uploads", (route) => route.abort());
  await page.getByRole("button", { name: "Save game", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Game saved privately", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "Your game is saved" }),
  ).toBeVisible();
  expect(await fixture("game-creation-state")).toHaveLength(1);
});
test("enforces access, empty choices and narrow dark reduced-motion layouts", async ({
  page,
  context,
}, info) => {
  await page.goto("/app/games/new");
  await expect(page).toHaveURL(/\/login$/);
  await signIn(context, "VIEWER");
  await page.goto("/app/games/new");
  await expect(page).toHaveURL(/\/access-denied$/);
  await signIn(context, "EDITOR");
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/app/games/new");
  await expect(page.getByText(/No active platforms found/)).toBeVisible();
  await fixture("seed-game-creation");
  await page.reload();
  await chooseIdentity(page);
  await chooseRelease(page);
  await expect(page.getByLabel("Has box", { exact: true })).toHaveValue(
    "unknown",
  );
  await next(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("game-mobile-review-dark.png"),
    fullPage: true,
  });
});
