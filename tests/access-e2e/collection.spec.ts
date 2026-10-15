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
const pager = (page: Page) =>
  page.getByRole("navigation", { name: "Collection pagination" });
async function seedMany(context: BrowserContext) {
  await signIn(context);
  return fixture("seed-collection");
}
async function copyIds(page: Page) {
  return list(page)
    .locator("[data-copy-id]")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-copy-id")!),
    );
}
test("opens the collection home from the workspace and distinguishes empty collections from filter misses", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/app");
  await page
    .getByRole("link", { name: "Browse collection", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/collection$/);
  await expect(
    page.getByRole("heading", { name: "No collection items yet", exact: true }),
  ).toBeVisible();
  await choose(page, "Item type", "game");
  await expect(
    page.getByRole("heading", { name: "No matching copies", exact: true }),
  ).toBeVisible();
  await expect(pager(page)).toHaveCount(0);
});
test("switches layouts without changing physical copies or requesting data, and restores the local preference", async ({
  page,
  context,
}, testInfo) => {
  await setup(context);
  await page.goto("/app/collection");
  await count(page, 4);
  const before = await copyIds(page);
  await expect(list(page)).toHaveAttribute("data-collection-view", "grid");
  let calls = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/collection/private")) calls++;
  });
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(list(page)).toHaveAttribute("data-collection-view", "list");
  expect(await copyIds(page)).toEqual(before);
  expect(calls).toBe(0);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("gemukore.collection-view.v1"),
    ),
  ).toBe("list");
  await page.reload();
  await count(page, 4);
  await expect(
    page.getByRole("button", { name: "List view", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("heading", { name: "Collection copies", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("collection-list.png") });
  await page.getByRole("button", { name: "Grid view", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("collection-grid.png") });
  if (testInfo.project.name === "chromium") {
    await expect(page.locator("[data-magic-spotlight]")).toHaveCount(4);
  } else await expect(page.locator("[data-magic-spotlight]")).toHaveCount(0);
});
test("pages all matching copies without duplication, restores bookmarks and supports browser history", async ({
  page,
  context,
}) => {
  await seedMany(context);
  await page.goto("/app/collection?type=game&sort=name-asc");
  await count(page, 20);
  const first = await copyIds(page);
  await expect(
    pager(page).getByRole("button", { name: "Previous page" }),
  ).toBeDisabled();
  await pager(page).getByRole("button", { name: "Next page" }).click();
  await expect(page).toHaveURL(/page=2/);
  await count(page, 20);
  await expect(
    page.getByRole("heading", { name: "Collection copies", exact: true }),
  ).toBeFocused();
  const second = await copyIds(page);
  expect(first.filter((id) => second.includes(id))).toEqual([]);
  await pager(page).getByRole("button", { name: "Next page" }).click();
  await count(page, 5);
  const third = await copyIds(page);
  expect(new Set([...first, ...second, ...third]).size).toBe(45);
  await expect(
    pager(page).getByRole("button", { name: "Next page" }),
  ).toBeDisabled();
  await page.goBack();
  await count(page, 20);
  expect(await copyIds(page)).toEqual(second);
  await page.reload();
  await count(page, 20);
  expect(await copyIds(page)).toEqual(second);
  await pager(page).getByRole("button", { name: "First page" }).click();
  await count(page, 20);
  expect(await copyIds(page)).toEqual(first);
});
test("resets paging for sort, filter and private text changes while retaining the relevant controls", async ({
  page,
  context,
}) => {
  const d = await seedMany(context);
  await page.goto("/app/collection?type=game&platform=snes&page=2");
  await count(page, 20);
  await choose(page, "Sort by", "newest");
  await expect(page).not.toHaveURL(/page=/);
  await count(page, 20);
  await pager(page).getByRole("button", { name: "Next page" }).click();
  await count(page, 20);
  const received = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/collection/private") &&
      response.request().postDataJSON()?.q === "ownersecret" &&
      response.request().postDataJSON()?.offset === 0,
  );
  await page
    .getByLabel("Search your collection", { exact: true })
    .fill("ownersecret");
  const response = await received;
  expect(new URL(response.url()).search).toBe("");
  expect(response.request().method()).toBe("POST");
  await count(page, 1);
  expect(await copyIds(page)).toEqual([d.firstId]);
  await expect(page).not.toHaveURL(/page=|ownersecret/);
  await expect(page).toHaveURL(/type=game&platform=snes&sort=newest/);
  await choose(page, "Box", "false");
  await expect(
    page.getByRole("heading", { name: "No matching copies", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Search your collection", { exact: true }),
  ).toHaveValue("ownersecret");
});
test("rejects invalid page URLs without a broad request and recovers from a valid empty page", async ({
  page,
  context,
}) => {
  await seedMany(context);
  let calls = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/collection/private")) calls++;
  });
  for (const query of [
    "page=0",
    "page=252",
    "page=2&page=3",
    "page=2&q=serial",
  ]) {
    await page.goto(`/app/collection?${query}`);
    await expect(filters(page).getByRole("alert")).toContainText(
      "invalid or unsupported",
    );
  }
  expect(calls).toBe(0);
  await page.goto("/app/collection?page=251");
  await expect(
    page.getByRole("heading", { name: "No copies on this page" }),
  ).toBeVisible();
  await expect(
    pager(page).getByRole("button", { name: "Next page" }),
  ).toBeDisabled();
  await pager(page).getByRole("button", { name: "First page" }).click();
  await count(page, 20);
  await expect(page).toHaveURL(/\/app\/collection$/);
});
test("keeps layout switching usable when local storage is unavailable", async ({
  page,
  context,
}) => {
  await seedMany(context);
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("blocked");
      },
    });
  });
  await page.goto("/app/collection");
  await count(page, 20);
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(list(page)).toHaveAttribute("data-collection-view", "list");
  await pager(page).getByRole("button", { name: "Next page" }).click();
  await count(page, 20);
  await expect(list(page)).toHaveAttribute("data-collection-view", "list");
});
test("rechecks access when changing pages and protects the new collection route and transport", async ({
  page,
  context,
}) => {
  await seedMany(context);
  await page.goto("/app/collection");
  await count(page, 20);
  await fixture("update", JSON.stringify({ enabled: false }));
  await pager(page).getByRole("button", { name: "Next page" }).click();
  await expect(
    page.getByRole("region", { name: "Collection search" }).getByRole("alert"),
  ).toContainText("access has changed");
  await expect(list(page)).toHaveCount(0);
  await page.reload();
  await expect(page).toHaveURL(/access-denied/);
  await context.clearCookies();
  await page.goto("/app/collection");
  await expect(page).toHaveURL(/login/);
  expect(
    (
      await page.request.post("/api/collection/private", {
        data: { q: "", controls: {} },
        headers: { Origin: "https://127.0.0.1:3111" },
      })
    ).status(),
  ).toBe(401);
});
test("renders actual private photo thumbnails in both layouts and omits serial-only previews", async ({
  page,
  context,
}) => {
  await signIn(context, "EDITOR");
  const d = await fixture("seed-filters");
  await page.goto(`/app/media?itemId=${d.firstId}`);
  await page.getByLabel("Photo files", { exact: true }).setInputFiles({
    name: "my-copy.png",
    mimeType: "image/png",
    buffer: monochromePng(120, 80),
  });
  await expect(
    page.getByText("Saved privately", { exact: true }),
  ).toBeVisible();
  await page.goto("/app/collection?type=game&hasBox=true");
  await count(page, 1);
  const image = list(page).getByRole("img");
  await image.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      image.evaluate((node) => (node as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  const source = await image.getAttribute("src");
  expect(source).toContain("/api/media/private/");
  const read = await page.request.get(source!);
  expect(read.status()).toBe(200);
  expect(read.headers()["cache-control"]).toContain("no-store");
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(list(page).getByRole("img")).toHaveAttribute("src", source!);
  await page.goto(`/app/media?itemId=${d.firstId}`);
  await page.getByRole("button", { name: "Edit photo 1" }).click();
  await page
    .getByLabel("Classification", { exact: true })
    .selectOption("SERIAL");
  await page.getByRole("button", { name: "Save photo", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/app/collection?type=game&hasBox=true");
  await count(page, 1);
  await expect(list(page).getByRole("img")).toHaveCount(0);
  await expect(list(page).getByText("No photo yet")).toBeVisible();
});
test("keeps long cards usable at 320px in dark mode with reduced motion in both views", async ({
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
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/app/collection?type=game&hasBox=true");
  await count(page, 1);
  await expect(page.locator("[data-magic-spotlight]")).toHaveCount(0);
  for (const view of ["Grid", "List"]) {
    await page
      .getByRole("button", { name: `${view} view`, exact: true })
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Control+k");
  await expect(
    page.getByRole("dialog", { name: "Quick search" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "List view", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("heading", { name: "Collection copies", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("collection-320-dark.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("paginates existing private search using POST offsets while keeping its idle behavior", async ({
  page,
  context,
}) => {
  await seedMany(context);
  await page.goto("/app/search");
  await expect(
    page.getByRole("heading", { name: "Find a physical copy" }),
  ).toBeVisible();
  await page
    .getByLabel("Search your collection", { exact: true })
    .fill("chrono");
  await count(page, 20);
  const next = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/search/private") &&
      response.request().postDataJSON()?.offset === 20,
  );
  await pager(page).getByRole("button", { name: "Next page" }).click();
  const response = await next;
  expect(new URL(response.url()).search).toBe("");
  await count(page, 20);
  await expect(
    page.getByLabel("Search your collection", { exact: true }),
  ).toHaveValue("chrono");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Find a physical copy" }),
  ).toBeVisible();
});
