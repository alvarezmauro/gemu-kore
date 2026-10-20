import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test, type BrowserContext } from "@playwright/test";
import { signedSessionCookie } from "../helpers/access-session";
import { monochromePng } from "../helpers/png-fixtures";
const exec = promisify(execFile);
async function fixture(command: string, input?: unknown) {
  const { stdout } = await exec(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "tests/helpers/access-browser-fixture.ts",
      command,
      ...(input === undefined
        ? []
        : [typeof input === "string" ? input : JSON.stringify(input)]),
    ],
    { env: { ...process.env, NODE_ENV: "production" }, timeout: 15000 },
  );
  return JSON.parse(stdout.trim());
}
async function signIn(
  context: BrowserContext,
  role: "EDITOR" | "ADMIN" | "VIEWER",
) {
  const session = await fixture("sign-in", {
    role,
    email: `${randomUUID()}@example.com`,
  });
  await context.addCookies([
    {
      name: "__Secure-gemukore.session_token",
      value: signedSessionCookie(
        session.token,
        process.env.BETTER_AUTH_SECRET!,
      ),
      url: "https://127.0.0.1:3111",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  return session;
}
test.beforeEach(async () => {
  await fixture("reset-game-creation");
  await fixture("reset");
});
test.afterAll(async () => {
  await fixture("reset-game-creation");
  await fixture("reset");
});
test("editor prepares a review, admin accepts it, and the original copy draft refreshes without losing photos", async ({
  page,
  context,
  browser,
}, info) => {
  test.setTimeout(90000);
  const catalog = await fixture("seed-game-creation");
  const editor = await signIn(context, "EDITOR");
  await page.goto("/app/games/new");
  await page.getByRole("option", { name: "Select SNES", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("option", {
      name: "Select Chrono Trigger (chrono-trigger)",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("option", {
      name: "Select Standard Edition (chrono-snes-na)",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByLabel("Private notes", { exact: true })
    .fill("Keep this enrichment draft");
  await page.getByLabel("Choose photos", { exact: true }).setInputFiles({
    name: "copy.png",
    mimeType: "image/png",
    buffer: monochromePng(120, 80),
  });
  const tabPromise = context.waitForEvent("page");
  await page
    .getByRole("link", {
      name: "Review game metadata (opens a new tab)",
      exact: true,
    })
    .click();
  const reviewTab = await tabPromise;
  await expect(
    reviewTab.getByRole("heading", { level: 1, name: "Review metadata" }),
  ).toBeVisible();
  await reviewTab
    .getByRole("button", { name: "Find metadata", exact: true })
    .click();
  await expect(
    reviewTab.getByText(/Metadata lookup is not configured/),
  ).toBeVisible();
  const fetched = await fixture("seed-enrichment", {
    token: editor.token,
    gameId: catalog.gameId,
    limited: true,
  });
  await reviewTab.goto(`/app/enrichment?runId=${fetched.id}`);
  await expect(
    reviewTab.getByRole("region", { name: "Evidence limitations" }),
  ).toContainText("Trailer evidence is incomplete");
  await reviewTab.getByLabel("Title", { exact: true }).check();
  await reviewTab.getByLabel("Description", { exact: true }).check();
  await reviewTab.getByLabel("External references", { exact: true }).check();
  await reviewTab
    .getByRole("button", { name: "Prepare preview", exact: true })
    .click();
  await expect(
    reviewTab.getByRole("article", { name: "Title suggestion" }),
  ).toContainText("Chrono Trigger");
  await expect(
    reviewTab.getByRole("article", { name: "Description suggestion" }),
  ).toContainText("A fictional adventure & puzzle game.");
  await expect(reviewTab.getByRole("button", { name: /^Apply/ })).toHaveCount(
    0,
  );
  const adminContext = await browser.newContext({
    baseURL: "https://127.0.0.1:3111",
    ignoreHTTPSErrors: true,
    viewport:
      info.project.name === "mobile-chromium"
        ? { width: 320, height: 740 }
        : { width: 1280, height: 900 },
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  try {
    await signIn(adminContext, "ADMIN");
    const admin = await adminContext.newPage();
    await admin.goto(`/app/enrichment?runId=${fetched.id}`);
    await expect(
      admin.getByRole("region", { name: "Evidence limitations" }),
    ).toContainText("Trailer evidence is incomplete");
    await expect(
      admin.getByRole("button", { name: "Apply all", exact: true }),
    ).toBeDisabled();
    await admin.getByLabel("Select description", { exact: true }).check();
    await admin
      .getByRole("button", { name: "Apply selected", exact: true })
      .click();
    await expect(
      admin.getByRole("heading", { name: "Changes applied", exact: true }),
    ).toBeVisible();
    await expect(
      admin.getByText("Needs a new review", { exact: true }),
    ).toHaveCount(2);
    expect(
      await admin.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await admin.screenshot({
      path: info.outputPath("enrichment-applied-dark.png"),
      fullPage: true,
    });
    const state = await fixture("enrichment-state");
    expect(state.changes).toMatchObject([
      { origin: "PROVIDER", fieldPath: "description" },
    ]);
  } finally {
    await adminContext.close();
  }
  await page.bringToFront();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Save game", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "selected platform, game or release changed" }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Refresh catalog choices", exact: true })
    .click();
  await expect(page.getByLabel("Private notes", { exact: true })).toHaveValue(
    "Keep this enrichment draft",
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByText("Game description: A fictional adventure & puzzle game.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save game", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Game saved privately", exact: true }),
  ).toBeVisible();
  const copies = await fixture("game-creation-state");
  expect(copies).toMatchObject([
    {
      notes: "Keep this enrichment draft",
      ownedGame: { gameReleaseId: catalog.releaseId },
      media: [{ type: "PHOTO", publicApproved: false }],
    },
  ]);
  await page.getByRole("link", { name: "View game", exact: true }).click();
  await expect(
    page.getByRole("link", {
      name: "Review game metadata (opens a new tab)",
      exact: true,
    }),
  ).toBeVisible();
});
test("enforces review ownership, viewer denial and keyboard-driven ignore", async ({
  page,
  context,
}, info) => {
  const catalog = await fixture("seed-game-creation");
  await page.goto(`/app/enrichment?kind=game&id=${catalog.gameId}`);
  await expect(page).toHaveURL(/\/login$/);
  await signIn(context, "VIEWER");
  await page.goto(`/app/enrichment?kind=game&id=${catalog.gameId}`);
  await expect(page).toHaveURL(/\/access-denied$/);
  const owner = await signIn(context, "EDITOR");
  const review = await fixture("seed-enrichment", {
    token: owner.token,
    gameId: catalog.gameId,
    prepare: true,
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto(`/app/enrichment?runId=${review.id}`);
  const ignore = page.getByRole("button", { name: "Ignore all", exact: true });
  await ignore.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Ignored", { exact: true })).toHaveCount(3);
  expect((await fixture("enrichment-state")).changes).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("enrichment-ignored-mobile.png"),
    fullPage: true,
  });
  await signIn(context, "EDITOR");
  await page.goto(`/app/enrichment?runId=${review.id}`);
  await expect(
    page.getByRole("heading", { name: "404", level: 1, exact: true }),
  ).toBeVisible();
});
