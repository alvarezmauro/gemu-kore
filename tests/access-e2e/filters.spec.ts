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

const list = (page: Page) =>
  page.getByRole("list", { name: "Search results", exact: true });
const filters = (page: Page) =>
  page.getByRole("region", { name: "Collection filters" });
async function count(page: Page, n: number) {
  if (n) await expect(list(page).getByRole("listitem")).toHaveCount(n);
  else
    await expect(
      page.getByRole("heading", { name: "No matching copies" }),
    ).toBeVisible();
}
async function choose(page: Page, label: string, value: string) {
  await filters(page).getByLabel(label, { exact: true }).selectOption(value);
}
async function setup(context: BrowserContext) {
  await signIn(context, "VIEWER");
  return fixture("seed-filters");
}
test.beforeEach(async () => {
  await fixture("reset-search");
  await fixture("reset");
});
test.afterAll(async () => {
  await fixture("reset-search");
  await fixture("reset");
});
test("@critical restores bookmark filters across reload and browser Back/Forward", async ({
  page,
  context,
}, testInfo) => {
  const d = await setup(context);
  await page.goto(
    "/app/search?type=game&platform=snes&region=japan&hasBox=true&sort=year-desc",
  );
  await count(page, 1);
  await expect(list(page)).toContainText(d.firstId.slice(0, 8));
  await expect(
    filters(page).getByLabel("Item type", { exact: true }),
  ).toHaveValue("game");
  await page.screenshot({
    path: testInfo.outputPath("collection-filters.png"),
    fullPage: true,
  });
  await choose(page, "Box", "false");
  await expect(page).toHaveURL(/hasBox=false/);
  await count(page, 1);
  await expect(list(page)).toContainText(d.secondId.slice(0, 8));
  await page.goBack();
  await expect(filters(page).getByLabel("Box", { exact: true })).toHaveValue(
    "true",
  );
  await expect(list(page)).toContainText(d.firstId.slice(0, 8));
  await page.goForward();
  await expect(list(page)).toContainText(d.secondId.slice(0, 8));
  await page.reload();
  await expect(list(page)).toContainText(d.secondId.slice(0, 8));
  await expect(
    filters(page).getByLabel("Sort by", { exact: true }),
  ).toHaveValue("year-desc");
});
test("correlates publishers and years with release markets and supports category identity filters", async ({
  page,
  context,
}) => {
  await setup(context);
  await page.goto("/app/search?type=game&publisher=sega&region=north-america");
  await count(page, 0);
  await page.getByText("More filters", { exact: true }).click();
  await choose(page, "Game publisher", "square");
  await count(page, 2);
  await choose(page, "Release year", "1995");
  await count(page, 0);
  await choose(page, "Release year", "1996");
  await count(page, 2);
  await page.goto("/app/search?type=console&manufacturer=sharp&model=sns-001");
  await count(page, 1);
  await expect(list(page)).toContainText("Super Nintendo");
  await page.goto("/app/search?type=console&manufacturer=nintendo");
  await count(page, 0);
  await page.goto("/app/search?type=accessory&producer=hori");
  await count(page, 1);
  await expect(list(page)).toContainText("Controller");
});
test("distinguishes box unknowns and unresolved defects and sorts physical copies", async ({
  page,
  context,
}) => {
  const d = await setup(context);
  await page.goto("/app/search?hasBox=unknown");
  await count(page, 1);
  await expect(list(page)).toContainText(d.consoleId.slice(0, 8));
  await page.goto("/app/search?type=game&hasDefects=false");
  await count(page, 1);
  await expect(list(page)).toContainText(d.secondId.slice(0, 8));
  await page.goto("/app/search?sort=newest");
  await count(page, 4);
  await expect(list(page).getByRole("listitem").first()).toContainText(
    "Controller",
  );
  await choose(page, "Sort by", "oldest");
  await expect(list(page).getByRole("listitem").first()).toContainText(
    "Super Nintendo",
  );
  await choose(page, "Sort by", "name-asc");
  await expect(list(page).getByRole("listitem").first()).toContainText(
    "Chrono Trigger",
  );
  await choose(page, "Sort by", "year-desc");
  await expect(list(page).getByRole("listitem").first()).toContainText(
    "Controller",
  );
});
test("@critical filters nested and unassigned locations, removes individual controls and clears all", async ({
  page,
  context,
}) => {
  const d = await setup(context);
  await page.goto(`/app/search?location=${d.rootId}`);
  await count(page, 3);
  await page.getByText("More filters", { exact: true }).click();
  await choose(page, "Location", d.shelfId);
  await count(page, 2);
  await choose(page, "Location", "unassigned");
  await count(page, 1);
  await expect(list(page)).toContainText(d.consoleId.slice(0, 8));
  await page
    .getByRole("button", { name: "Remove Location", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/search$/);
  await expect(
    page.getByRole("heading", { name: "Find a physical copy" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Browse all copies" }).click();
  await count(page, 4);
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/search$/);
  await expect(list(page)).toHaveCount(0);
});
test("combines private search with URL controls without saving free text in history", async ({
  page,
  context,
}) => {
  const d = await setup(context);
  await page.goto("/app/search?type=game&hasBox=true");
  await count(page, 1);
  const received = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/search/filtered") &&
      r.request().postDataJSON()?.q === "00-ABC-123",
  );
  await page
    .getByLabel("Search your collection", { exact: true })
    .fill("00-ABC-123");
  const response = await received;
  expect(new URL(response.url()).search).toBe("");
  expect(response.request().method()).toBe("POST");
  expect(response.request().postDataJSON().controls).toMatchObject({
    type: "game",
    hasBox: "true",
  });
  expect(JSON.stringify(await response.json())).not.toContain("00-ABC-123");
  await expect(list(page)).toContainText(d.firstId.slice(0, 8));
  await choose(page, "Box", "false");
  await count(page, 0);
  expect(page.url()).not.toContain("00-ABC");
  await choose(page, "Box", "true");
  await count(page, 1);
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(
    page.getByLabel("Search your collection", { exact: true }),
  ).toHaveValue("00-ABC-123");
  await expect(list(page)).toContainText(d.firstId.slice(0, 8));
  await page.reload();
  await expect(
    page.getByLabel("Search your collection", { exact: true }),
  ).toHaveValue("");
  await expect(list(page)).toHaveCount(0);
});
test("rejects ambiguous URL controls and preserves unavailable selections", async ({
  page,
  context,
}) => {
  await setup(context);
  let calls = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/search/filtered")) calls++;
  });
  await page.goto("/app/search?platform=snes&platform=nes");
  await expect(
    page.getByRole("region", { name: "Collection filters" }).getByRole("alert"),
  ).toContainText("invalid or unsupported");
  expect(calls).toBe(0);
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Find a physical copy" }),
  ).toBeVisible();
  await page.goto("/app/search?platform=removed-platform");
  await count(page, 0);
  await expect(
    filters(page).getByLabel("Platform", { exact: true }),
  ).toHaveValue("removed-platform");
  await expect(
    filters(page).getByRole("option", { name: "Selected value unavailable" }),
  ).toHaveCount(1);
  await page.goto("/app/search?rating=5");
  await expect(filters(page).getByRole("alert")).toContainText(
    "invalid or unsupported",
  );
  await expect(list(page)).toHaveCount(0);
});
test("keeps current authorization on filter requests and the private options page", async ({
  page,
  context,
}) => {
  await setup(context);
  await page.goto("/app/search?type=game");
  await count(page, 2);
  await fixture("update", JSON.stringify({ enabled: false }));
  await choose(page, "Box", "true");
  await expect(
    page.getByRole("region", { name: "Collection search" }).getByRole("alert"),
  ).toContainText("access has changed");
  await expect(list(page)).toHaveCount(0);
  await page.reload();
  await expect(page).toHaveURL(/access-denied/);
  expect(
    (
      await page.request.post("/api/search/filtered", {
        data: { q: "", controls: { type: "game" } },
        headers: { Origin: "https://127.0.0.1:3111" },
      })
    ).status(),
  ).toBe(403);
});
test("keeps filters usable with keyboard, long titles, dark theme and reduced motion at 320px", async ({
  page,
  context,
}, testInfo) => {
  const d = await setup(context);
  await fixture(
    "rename-search-game",
    JSON.stringify({ id: d.gameId, name: "A".repeat(200) }),
  );
  await fixture(
    "rename-filter-platform",
    JSON.stringify({ id: d.platformId, name: "P".repeat(200) }),
  );
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/app/search?type=game&platform=snes&hasBox=true");
  await count(page, 1);
  await page.getByText("More filters", { exact: true }).click();
  await page.getByLabel("Search your collection", { exact: true }).focus();
  await page.keyboard.type("ownersecret");
  await count(page, 1);
  await filters(page).getByLabel("Sort by", { exact: true }).focus();
  await choose(page, "Sort by", "name-desc");
  await count(page, 1);
  await expect(
    filters(page).getByLabel("Sort by", { exact: true }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("filters-320-dark.png"),
    fullPage: true,
  });
  await page.keyboard.press("Control+k");
  await expect(
    page.getByRole("dialog", { name: "Quick search" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    filters(page).getByLabel("Sort by", { exact: true }),
  ).toBeFocused();
});
