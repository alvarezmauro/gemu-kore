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
    { env: process.env, timeout: 10_000 },
  );
  return JSON.parse(stdout.trim());
}
async function signIn(
  context: BrowserContext,
  role: "EDITOR" | "VIEWER" = "EDITOR",
) {
  const { token } = await fixture("sign-in", JSON.stringify({ role }));
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

const results = (page: Page) =>
  page.getByRole("list", { name: "Search results", exact: true });
async function search(page: Page, q: string, count: number) {
  await page.getByLabel("Search your collection", { exact: true }).fill(q);
  if (count === 0)
    await expect(
      page.getByRole("heading", { name: "No matching copies" }),
    ).toBeVisible();
  else await expect(results(page).getByRole("listitem")).toHaveCount(count);
}
test.beforeEach(async () => {
  await fixture("reset-search");
  await fixture("reset");
});
test.afterAll(async () => {
  await fixture("reset-search");
  await fixture("reset");
});
test("offers a private idle search and finds separate owned copies through live relationships", async ({
  page,
  context,
}, testInfo) => {
  await signIn(context, "VIEWER");
  const data = await fixture("seed-search");
  await page.goto("/app");
  await page
    .getByRole("link", { name: "Search collection", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Find a physical copy" }),
  ).toBeVisible();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await search(page, "chrono snes squaresoft", 2);
  await expect(
    results(page).getByRole("heading", { name: "Chrono Trigger", exact: true }),
  ).toHaveCount(2);
  expect(
    await results(page)
      .getByRole("link", { name: /Photos for/ })
      .first()
      .getAttribute("href"),
  ).toMatch(/\/app\/media\?itemId=/);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("collection-search.png"),
    fullPage: true,
  });
  await fixture(
    "rename-search-game",
    JSON.stringify({ id: data.gameId, name: "Renamed adventure" }),
  );
  await search(page, "renamed", 2);
  await search(page, "chrono", 0);
  expect(errors).toEqual([]);
});
test("@critical searches all categories, partial names and misspellings", async ({
  page,
  context,
}) => {
  await signIn(context, "VIEWER");
  await fixture("seed-search");
  await page.goto("/app/search");
  await search(page, "chronoo", 2);
  await search(page, "trig", 2);
  await search(page, "sharp SNS-001", 1);
  await expect(results(page)).toContainText("Console");
  await search(page, "hori tournament", 1);
  await expect(results(page)).toContainText("Accessory");
  await search(page, "original japan", 2);
});
test("@critical keeps serial and note queries in POST bodies and does not return raw private text", async ({
  page,
  context,
}) => {
  await signIn(context, "VIEWER");
  const data = await fixture("seed-search");
  await page.goto("/app/search");
  const received = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/search/private") &&
      response.request().postDataJSON()?.q === "00-ABC-123",
  );
  await search(page, "00-ABC-123", 1);
  const response = await received;
  expect(response.request().method()).toBe("POST");
  expect(response.url()).not.toContain("00-ABC");
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  const body = await response.json();
  expect(body.items[0].id).toBe(data.firstId);
  expect(JSON.stringify(body)).not.toContain("00-ABC-123");
  expect(body.items[0].matchSources).toContain("Serial number");
  await expect(page).toHaveURL(/\/app\/search$/);
  await search(page, "ownersecret", 1);
  await expect(results(page)).toContainText("Note");
  await expect(
    page.getByText("ownersecret imported childhood copy", { exact: true }),
  ).toHaveCount(0);
  await search(page, "cracked fracture", 1);
  await expect(results(page)).toContainText("Defect");
  await search(page, "repairsecret", 1);
  await expect(results(page)).toContainText("Repair note");
  await page.reload();
  await expect(page.getByLabel("Search your collection")).toHaveValue("");
  await expect(
    page.getByRole("heading", { name: "Find a physical copy" }),
  ).toBeVisible();
});
test("opens existing photo and defect pages for the exact result copy", async ({
  page,
  context,
}) => {
  await signIn(context, "VIEWER");
  const data = await fixture("seed-search");
  await page.goto("/app/search");
  await search(page, "ownersecret", 1);
  await results(page)
    .getByRole("link", { name: /Defects for/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`itemId=${data.firstId}`));
  await expect(
    page.getByRole("heading", { name: "Cracked hinge" }),
  ).toBeVisible();
  await page.goto("/app/search");
  await search(page, "ownersecret", 1);
  await results(page)
    .getByRole("link", { name: /Photos for/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`itemId=${data.firstId}`));
  await expect(
    page.getByRole("heading", { name: "No photos for this copy" }),
  ).toBeVisible();
});
test("rejects revoked access after the search page is already open", async ({
  page,
  context,
}) => {
  await signIn(context, "VIEWER");
  await fixture("seed-search");
  await page.goto("/app/search");
  await search(page, "chrono", 2);
  await fixture("update", JSON.stringify({ enabled: false }));
  await page.getByLabel("Search your collection").fill("nintendo");
  await expect(
    page.getByRole("region", { name: "Collection search" }).getByRole("alert"),
  ).toContainText("Your access has changed");
  await expect(results(page)).toHaveCount(0);
  await page.goto("/app/search");
  await expect(page).toHaveURL(/access-denied/);
});
test("keeps invalid input visible, clears stale results and provides honest empty states", async ({
  page,
  context,
}) => {
  await signIn(context, "VIEWER");
  await fixture("seed-search");
  await page.goto("/app/search");
  await search(page, "chrono", 2);
  await page
    .getByLabel("Search your collection")
    .fill("one two three four five six seven eight nine");
  await expect(
    page.getByRole("region", { name: "Collection search" }).getByRole("alert"),
  ).toContainText("eight words");
  await expect(
    page.getByRole("button", { name: "Try search again" }),
  ).toBeDisabled();
  await expect(results(page)).toHaveCount(0);
  await search(page, "absent collection object", 0);
  await page.getByLabel("Search your collection").fill("c");
  await expect(
    page.getByRole("heading", { name: "Find a physical copy" }),
  ).toBeVisible();
});
test("protects the page/API and does not expose a public search endpoint", async ({
  page,
  context,
}) => {
  await page.goto("/app/search");
  await expect(page).toHaveURL(/login/);
  expect(
    (
      await page.request.post("/api/search/private", {
        data: { q: "chrono" },
        headers: { origin: "https://127.0.0.1:3111" },
      })
    ).status(),
  ).toBe(401);
  expect((await page.request.get("/api/search/public?q=chrono")).status()).toBe(
    404,
  );
  await signIn(context, "VIEWER");
  expect((await page.request.get("/api/search/private")).status()).toBe(405);
  expect(
    (
      await page.request.post("/api/search/private", {
        data: { q: "chrono", includePrivate: true },
        headers: { origin: "https://127.0.0.1:3111" },
      })
    ).status(),
  ).toBe(400);
});
test("keeps search and keyboard actions usable at 320px in dark mode with reduced motion", async ({
  page,
  context,
}, testInfo) => {
  await signIn(context, "VIEWER");
  const data = await fixture("seed-search");
  await fixture(
    "rename-search-game",
    JSON.stringify({ id: data.gameId, name: "A".repeat(200) }),
  );
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/app/search");
  const input = page.getByLabel("Search your collection");
  await input.focus();
  await page.keyboard.type("ownersecret");
  await expect(results(page).getByRole("listitem")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Browse all copies" }),
  ).toBeFocused();
  const controls = page.getByRole("region", { name: "Collection filters" });
  for (const label of [
    "Item type",
    "Platform",
    "Region",
    "Box",
    "Unresolved defects",
    "Sort by",
  ]) {
    await page.keyboard.press("Tab");
    await expect(controls.getByLabel(label, { exact: true })).toBeFocused();
  }
  await page.keyboard.press("Tab");
  await expect(
    controls.getByText("More filters", { exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    results(page).getByRole("link", { name: /Photos for/ }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("search-320px-dark.png"),
    fullPage: true,
  });
});
