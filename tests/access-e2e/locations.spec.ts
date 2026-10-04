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
test.beforeEach(async () => {
  await fixture("reset-locations");
  await fixture("reset");
});
test.afterAll(async () => {
  await fixture("reset-locations");
  await fixture("reset");
});
const row = (page: Page, name: string) =>
  page
    .getByRole("list", { name: "Location hierarchy", exact: true })
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });

test("creates a complete nested hierarchy through the forms and retains it after reload", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/app");
  await page.getByRole("link", { name: "Manage locations" }).click();
  await expect(
    page.getByRole("heading", { name: "Make room for your collection" }),
  ).toBeVisible();
  for (const [name, type, parent] of [
    ["Home", "PROPERTY", null],
    ["Office", "ROOM", "Home"],
    ["Retro Cabinet", "FURNITURE", "Office"],
    ["Shelf 2", "SHELF", "Retro Cabinet"],
  ] as const) {
    await page
      .getByRole("button", {
        name: parent ? `Add child to ${parent}` : "Add location",
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name", { exact: false }).fill(name);
    await dialog.getByLabel("Type", { exact: true }).selectOption(type);
    await dialog
      .getByRole("button", { name: "Add location", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(row(page, name)).toBeVisible();
  }
  await expect(
    page.getByRole("navigation", { name: "Path to Shelf 2", exact: true }),
  ).toContainText("Home / Office / Retro Cabinet / Shelf 2");
  expect(await fixture("location-count")).toBe(4);
  await page.reload();
  await expect(row(page, "Shelf 2")).toContainText(
    "0 child locations · 0 items",
  );
});

test("renames, moves, reorders and deletes with updated descendant breadcrumbs", async ({
  page,
  context,
}) => {
  await signIn(context);
  await fixture("seed-locations");
  await page.goto("/app/locations");
  await page
    .getByRole("button", { name: "Edit or move Office", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await expect(
    dialog
      .getByLabel("Parent location")
      .getByRole("option", { name: /Office/ }),
  ).toHaveCount(0);
  await dialog.getByLabel("Name", { exact: false }).fill("Studio");
  await dialog.getByRole("button", { name: "Save location" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Path to Shelf 2", exact: true }),
  ).toContainText("Studio");
  await page
    .getByRole("button", { name: "Edit or move Retro Cabinet", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Parent location").selectOption({ label: "Other" });
  await dialog.getByRole("button", { name: "Save location" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Path to Shelf 2", exact: true }),
  ).toHaveText("Other / Retro Cabinet / Shelf 2");
  await page
    .getByRole("button", { name: "Move Other up", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Location updated.");
  await expect(
    page
      .getByRole("list", { name: "Location hierarchy", exact: true })
      .getByRole("heading")
      .first(),
  ).toHaveText("Other");
  await expect(
    page.getByRole("button", { name: "Delete Retro Cabinet", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Delete Shelf 2", exact: true })
    .click();
  const confirmation = page.getByRole("alertdialog");
  await expect(
    confirmation.getByRole("button", { name: "Cancel" }),
  ).toBeFocused();
  await confirmation
    .getByRole("button", { name: "Delete location", exact: true })
    .click();
  await expect(confirmation).toHaveCount(0);
  await expect(row(page, "Shelf 2")).toHaveCount(0);
  expect(await fixture("location-count")).toBe(4);
});

test("shows duplicate errors, preserves input and restores dialog focus on cancel", async ({
  page,
  context,
}) => {
  await signIn(context);
  await fixture("seed-locations");
  await page.goto("/app/locations");
  const trigger = page.getByRole("button", {
    name: "Add location",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: false }).fill(" home ");
  await dialog
    .getByRole("button", { name: "Add location", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("already exists");
  await expect(dialog.getByLabel("Name", { exact: false })).toHaveValue(
    " home ",
  );
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(trigger).toBeFocused();
  expect(await fixture("location-count")).toBe(5);
});

test("rechecks permissions when an editor is demoted with a form open", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/app/locations");
  await page.getByRole("button", { name: "Add location", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: false }).fill("Private shelf");
  await fixture("update", JSON.stringify({ role: "VIEWER" }));
  await dialog
    .getByRole("button", { name: "Add location", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("cannot change");
  await expect(dialog.getByLabel("Name", { exact: false })).toHaveValue(
    "Private shelf",
  );
  expect(await fixture("location-count")).toBe(0);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await page.reload();
  await expect(
    page.getByText("View-only access.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Add location" })).toHaveCount(
    0,
  );
});

test("protects private location data and renders viewer access without editing controls", async ({
  page,
  context,
  browser,
}) => {
  await fixture("seed-locations");
  await signIn(context, "VIEWER");
  const response = await page.goto("/app/locations");
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(row(page, "Shelf 2")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Add location|Edit or move|Delete / }),
  ).toHaveCount(0);
  const anonymous = await browser.newContext({
    baseURL: "https://127.0.0.1:3111",
    ignoreHTTPSErrors: true,
  });
  try {
    const other = await anonymous.newPage();
    await other.goto("/app/locations");
    await expect(other).toHaveURL(/\/login$/);
    await expect(other.getByText("Retro Cabinet", { exact: true })).toHaveCount(
      0,
    );
    await other.goto("/");
    await expect(other.getByText("Retro Cabinet", { exact: true })).toHaveCount(
      0,
    );
  } finally {
    await anonymous.close();
  }
});

test("rejects a stale form from another tab without losing its entered name", async ({
  page,
  context,
}) => {
  await signIn(context);
  await fixture("seed-locations");
  await page.goto("/app/locations");
  await page
    .getByRole("button", { name: "Edit or move Office", exact: true })
    .click();
  const first = page.getByRole("dialog");
  await first.getByLabel("Name", { exact: false }).fill("Stale name");
  const other = await context.newPage();
  try {
    await other.goto("/app/locations");
    await other
      .getByRole("button", { name: "Edit or move Office", exact: true })
      .click();
    const second = other.getByRole("dialog");
    await second.getByLabel("Name", { exact: false }).fill("Newer name");
    await second.getByRole("button", { name: "Save location" }).click();
    await expect(second).toHaveCount(0);
    await first.getByRole("button", { name: "Save location" }).click();
    await expect(first.getByRole("alert")).toContainText(
      "changed while you were editing",
    );
    await expect(first.getByLabel("Name", { exact: false })).toHaveValue(
      "Stale name",
    );
    await first.getByRole("button", { name: "Cancel" }).click();
    await page.reload();
    await expect(row(page, "Newer name")).toBeVisible();
  } finally {
    await other.close();
  }
});

test("fits a 320px screen with long names, dark theme and reduced motion", async ({
  page,
  context,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(context);
  await fixture("seed-locations");
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/app/locations");
  await page
    .getByRole("button", { name: "Edit or move Shelf 2", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: false }).fill("A".repeat(200));
  await dialog
    .getByLabel("Description", { exact: false })
    .fill("Long shelf description for the collection. ".repeat(8));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await dialog.getByRole("button", { name: "Save location" }).click();
  await expect(dialog).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("locations-320px.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
