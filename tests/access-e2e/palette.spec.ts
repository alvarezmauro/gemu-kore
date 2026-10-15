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

const dialog = (page: Page) =>
  page.getByRole("dialog", { name: "Quick search", exact: true });
const input = (page: Page) =>
  dialog(page).getByRole("combobox", {
    name: "Search copies, catalog or pages",
  });
async function open(page: Page) {
  await page.getByRole("button", { name: "Open command palette" }).click();
  await expect(input(page)).toBeFocused();
}
async function find(page: Page, q: string) {
  await input(page).fill(q);
  await expect(dialog(page).getByRole("status")).not.toHaveText("Searching…");
}
test.beforeEach(async () => {
  await fixture("reset-search");
  await fixture("reset");
});
test.afterAll(async () => {
  await fixture("reset-search");
  await fixture("reset");
});
test("offers both keyboard shortcuts throughout the private workspace with focus restoration", async ({
  page,
  context,
}) => {
  await signIn(context, "VIEWER");
  for (const path of [
    "/app",
    "/app/search",
    "/app/locations",
    "/app/defects",
    "/app/media",
  ]) {
    await page.goto(path);
    const trigger = page.getByRole("button", { name: "Open command palette" });
    await trigger.focus();
    await page.keyboard.press("Control+k");
    await expect(input(page)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await page.keyboard.press("Meta+k");
    await expect(input(page)).toBeFocused();
    await page.keyboard.press("Meta+k");
    await expect(dialog(page)).toHaveCount(0);
  }
});
test("groups real owned identities and catalog separately, including both copies of a release", async ({
  page,
  context,
}, testInfo) => {
  await signIn(context, "VIEWER");
  await fixture("seed-search");
  await page.goto("/app/search");
  await open(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await find(page, "chrono");
  await expect(
    dialog(page)
      .getByRole("group", { name: "Games", exact: true })
      .getByRole("option"),
  ).toHaveCount(2);
  await expect(
    dialog(page)
      .getByRole("group", { name: "Catalog", exact: true })
      .getByRole("option"),
  ).toHaveCount(1);
  await page.screenshot({
    path: testInfo.outputPath("command-palette.png"),
    fullPage: true,
  });
  await find(page, "SNS-001");
  await expect(
    dialog(page)
      .getByRole("group", { name: "Consoles", exact: true })
      .getByRole("option"),
  ).toHaveCount(1);
  await find(page, "tournament");
  await expect(
    dialog(page)
      .getByRole("group", { name: "Accessories", exact: true })
      .getByRole("option"),
  ).toHaveCount(1);
  await find(page, "chronoo");
  await expect(
    dialog(page)
      .getByRole("group", { name: "Games", exact: true })
      .getByRole("option"),
  ).toHaveCount(2);
  expect(errors).toEqual([]);
});
test("previews canonical identities without fabricating detail routes and navigates exact-copy actions", async ({
  page,
  context,
}) => {
  await signIn(context, "VIEWER");
  const data = await fixture("seed-search");
  await page.goto("/app/search");
  await open(page);
  await find(page, "chrono");
  await dialog(page)
    .getByRole("group", { name: "Catalog", exact: true })
    .getByRole("option")
    .click();
  await expect(
    dialog(page).getByText("Catalog · Game", { exact: true }),
  ).toBeVisible();
  await expect(dialog(page).getByText(/Canonical identity/)).toBeVisible();
  await expect(page).toHaveURL(/\/app\/search$/);
  await dialog(page).getByRole("option", { name: "Back to results" }).click();
  await find(page, "ownersecret");
  await dialog(page)
    .getByRole("group", { name: "Games", exact: true })
    .getByRole("option")
    .click();
  await expect(
    dialog(page).getByText(`Owned copy · ${data.firstId.slice(0, 8)}`),
  ).toBeVisible();
  await dialog(page).getByRole("option", { name: "View copy defects" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/app/defects\\?itemId=${data.firstId}$`),
  );
  await expect(
    page.getByRole("heading", { name: "Cracked hinge", exact: true }),
  ).toBeVisible();
  await open(page);
  await find(page, "ownersecret");
  await dialog(page)
    .getByRole("group", { name: "Games", exact: true })
    .getByRole("option")
    .click();
  await dialog(page).getByRole("option", { name: "View copy photos" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/app/media\\?itemId=${data.firstId}$`),
  );
  await expect(
    page.getByRole("heading", { name: "No photos for this copy" }),
  ).toBeVisible();
});
test("uses arrow keys and Enter to navigate, traps focus and supports pointer dismissal", async ({
  page,
  context,
}) => {
  await signIn(context, "VIEWER");
  await page.goto("/app/search");
  await open(page);
  await page.keyboard.press("ArrowDown");
  await expect(input(page)).toHaveAttribute("aria-activedescendant", /.+/);
  await page.keyboard.press("Enter");
  await expect(dialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/app\/search$/);
  await open(page);
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog(page).getByRole("button", { name: "Close", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(input(page)).toBeFocused();
  await page
    .locator('[data-slot="dialog-overlay"][data-state="open"]')
    .click({ position: { x: 8, y: 8 } });
  await expect(dialog(page)).toHaveCount(0);
});
test("keeps private terms in POST bodies and forgets them on dismissal or navigation", async ({
  page,
  context,
}) => {
  await signIn(context, "VIEWER");
  await fixture("seed-search");
  await page.goto("/app/search");
  await open(page);
  const received = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/search/palette") &&
      response.request().postDataJSON()?.q === "00-ABC-123",
  );
  await input(page).fill("00-ABC-123");
  const response = await received;
  expect(response.request().method()).toBe("POST");
  expect(new URL(response.url()).search).toBe("");
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  const payload = await response.json();
  expect(payload.catalog).toEqual([]);
  expect(JSON.stringify(payload)).not.toContain("00-ABC-123");
  expect(payload.collection.items).toHaveLength(1);
  expect(page.url()).not.toContain("00-ABC");
  await page.keyboard.press("Escape");
  await open(page);
  await expect(input(page)).toHaveValue("");
  await expect(
    dialog(page).getByRole("group", { name: "Games", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await open(page);
  await expect(input(page)).toHaveValue("");
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).some((key) => /search|palette/i.test(key)),
    ),
  ).toBe(false);
});
test("retains input for errors, rejects obsolete results and shows useful empty states", async ({
  page,
  context,
}) => {
  await signIn(context, "VIEWER");
  await fixture("seed-search");
  await page.goto("/app/search");
  await open(page);
  await find(page, "chrono");
  await input(page).fill("one two three four five six seven eight nine");
  await expect(dialog(page).getByRole("alert")).toContainText("eight words");
  await expect(input(page)).toHaveAttribute("aria-invalid", "true");
  await expect(
    dialog(page).getByRole("option", { name: "Try search again" }),
  ).toHaveCount(0);
  await expect(
    dialog(page).getByRole("group", { name: "Games", exact: true }),
  ).toHaveCount(0);
  await find(page, "missing identity xyz");
  await expect(dialog(page).getByText(/No matching copies/)).toBeVisible();
  await fixture("update", JSON.stringify({ enabled: false }));
  await input(page).fill("chrono");
  await expect(dialog(page).getByRole("alert")).toContainText(
    "access has changed",
  );
  await expect(input(page)).toHaveValue("chrono");
  await fixture("update", JSON.stringify({ enabled: true }));
  await dialog(page).getByRole("option", { name: "Try search again" }).click();
  await expect(
    dialog(page)
      .getByRole("group", { name: "Games", exact: true })
      .getByRole("option"),
  ).toHaveCount(2);
});
test("does not interrupt an existing form dialog", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/app/locations");
  await page.getByRole("button", { name: "Add location", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Add location", exact: true });
  await expect(form).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(dialog(page)).toHaveCount(0);
  await expect(form).toBeVisible();
});
test("protects palette data and never mounts the palette on public or denied pages", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Open command palette" }),
  ).toHaveCount(0);
  await page.keyboard.press("Control+k");
  await expect(dialog(page)).toHaveCount(0);
  expect(
    (
      await page.request.post("/api/search/palette", {
        data: { q: "chrono" },
        headers: { Origin: "https://127.0.0.1:3111" },
      })
    ).status(),
  ).toBe(401);
  await signIn(context, "VIEWER");
  await page.goto("/app/search");
  expect((await page.request.get("/api/search/palette")).status()).toBe(405);
  expect(
    (
      await page.request.post("/api/search/palette", {
        data: { q: "chrono", includePrivate: true },
        headers: { Origin: "https://127.0.0.1:3111" },
      })
    ).status(),
  ).toBe(400);
  await fixture("update", JSON.stringify({ enabled: false }));
  await page.goto("/app/search");
  await expect(page).toHaveURL(/access-denied/);
  await expect(
    page.getByRole("button", { name: "Open command palette" }),
  ).toHaveCount(0);
});
test("keeps long results usable at 320px in dark mode and reduced motion", async ({
  page,
  context,
}, testInfo) => {
  await signIn(context, "VIEWER");
  const data = await fixture("seed-search");
  await fixture(
    "rename-search-game",
    JSON.stringify({ id: data.gameId, name: "A".repeat(200) }),
  );
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/app/search");
  await open(page);
  await find(page, "ownersecret");
  const result = dialog(page)
    .getByRole("group", { name: "Games", exact: true })
    .getByRole("option");
  await expect(result).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const bounds = await dialog(page).boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(641);
  await page.screenshot({
    path: testInfo.outputPath("command-palette-320-dark.png"),
    fullPage: true,
  });
  await page.keyboard.press("Enter");
  await expect(dialog(page).getByText(/Owned copy/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open command palette" }),
  ).toBeFocused();
});
