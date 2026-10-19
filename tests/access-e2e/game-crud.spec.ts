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
async function create(page: Page, photo = false) {
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
  await page
    .getByLabel("Private notes", { exact: true })
    .fill("My original notes");
  await page.getByRole("button", { name: "Add defect", exact: true }).click();
  await page.getByLabel(/Defect 1 title/).fill("Torn manual");
  if (photo)
    await page.getByLabel("Choose photos", { exact: true }).setInputFiles({
      name: "copy.png",
      mimeType: "image/png",
      buffer: monochromePng(120, 80),
    });
  await next(page);
  await page.getByRole("button", { name: "Save game", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Game saved privately", exact: true }),
  ).toBeVisible();
  if (photo)
    await expect(
      page.getByText("Saved privately", { exact: true }),
    ).toHaveCount(1);
  await page.getByRole("link", { name: "View game", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Chrono Trigger", level: 1 }),
  ).toBeVisible();
  return page.url();
}
test("editor views and edits a copy, corrects its release and deletes only the confirmed copy", async ({
  page,
  context,
}, info) => {
  test.setTimeout(60_000);
  await fixture("seed-game-creation");
  await signIn(context, "EDITOR");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const first = await create(page, true);
  const initial = (await fixture("game-creation-state"))[0];
  await expect(
    page.getByRole("heading", { name: "Personal photos", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("img").first()).toBeVisible();
  await page.getByRole("button", { name: "Edit game", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Serial number", { exact: true }).fill("00009");
  await dialog.getByLabel("Has box", { exact: true }).selectOption("yes");
  await dialog
    .getByLabel("Private notes", { exact: true })
    .fill("My edited notes");
  await dialog
    .getByRole("button", {
      name: "Correct release identification",
      exact: true,
    })
    .click();
  await dialog
    .getByRole("option", {
      name: "Select Deluxe Edition (chrono-snes-unknown)",
      exact: true,
    })
    .click();
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText("My edited notes", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Selected release", exact: true }),
  ).toContainText("Deluxe Edition");
  await page.screenshot({
    path: info.outputPath("game-copy-detail.png"),
    fullPage: true,
  });
  const edited = (await fixture("game-creation-state"))[0];
  expect(edited).toMatchObject({
    id: initial.id,
    serialNumber: "00009",
    notes: "My edited notes",
    hasBox: true,
    defects: [{ title: "Torn manual" }],
    media: [{ id: initial.media[0].id }],
  });
  expect(edited.ownedGame.gameReleaseId).not.toBe(
    initial.ownedGame.gameReleaseId,
  );
  await create(page);
  await page.goto(first);
  await page.getByRole("button", { name: "Delete game", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Delete game", exact: true }),
  ).toBeFocused();
  expect(await fixture("game-creation-state")).toHaveLength(2);
  const assets = await fixture("asset-count");
  await page.getByRole("button", { name: "Delete game", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete game", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/collection$/);
  expect(await fixture("game-creation-state")).toHaveLength(1);
  expect(await fixture("asset-count")).toBe(assets);
  expect((await fixture("game-catalog-state")).releases).toHaveLength(2);
  await page.goto(first);
  await expect(
    page.getByText(/could not be found|not found/i).first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("retains stale edit drafts and rejects stale deletion without losing the winning copy", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  await fixture("seed-game-creation");
  await signIn(context, "EDITOR");
  const url = await create(page);
  const other = await context.newPage();
  await other.goto(url);
  await page.getByRole("button", { name: "Edit game", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Private notes", { exact: true })
    .fill("My unsaved draft");
  await other.getByRole("button", { name: "Edit game", exact: true }).click();
  await other
    .getByRole("dialog")
    .getByLabel("Private notes", { exact: true })
    .fill("Winning notes");
  await other
    .getByRole("dialog")
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(other.getByRole("dialog")).toHaveCount(0);
  await page.bringToFront();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeFocused();
  await expect(page.getByLabel("Private notes", { exact: true })).toHaveValue(
    "My unsaved draft",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete game", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete game", exact: true })
    .click();
  await expect(page.getByRole("alertdialog").getByRole("alert")).toContainText(
    "changed",
  );
  expect(await fixture("game-creation-state")).toMatchObject([
    { notes: "Winning notes" },
  ]);
  await other.close();
});
test("viewers can read and navigate game details but cannot edit; anonymous and missing copies are handled", async ({
  page,
  context,
}, info) => {
  test.setTimeout(60_000);
  await fixture("seed-game-creation");
  await signIn(context, "EDITOR");
  const url = await create(page);
  await context.clearCookies();
  await page.goto(url);
  await expect(page).toHaveURL(/\/login$/);
  await signIn(context, "VIEWER");
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/app/collection?type=game");
  await page.getByRole("link", { name: /View game Chrono Trigger/ }).click();
  await expect(page).toHaveURL(url);
  await expect(
    page.getByRole("button", { name: "Edit game", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Delete game", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "About", exact: true }).click();
  await expect(page).toHaveURL(/#about-game$/);
  await page.screenshot({
    path: info.outputPath("game-copy-mobile-dark.png"),
    fullPage: true,
  });
  await page.goto("/app/games/not-a-uuid");
  await expect(
    page.getByText(/could not be found|not found/i).first(),
  ).toBeVisible();
});
