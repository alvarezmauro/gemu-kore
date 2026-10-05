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
async function add(page: Page, title = "Broken hinge", status = "ACTIVE") {
  await page.getByRole("button", { name: "Add defect", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: false }).fill(title);
  await dialog.getByLabel("Severity", { exact: true }).selectOption("MAJOR");
  await dialog.getByLabel("Status", { exact: true }).selectOption(status);
  await dialog.getByRole("button", { name: "Save defect" }).click();
  await expect(dialog).toHaveCount(0);
}
const record = (page: Page, title: string) =>
  page
    .getByRole("list", { name: "Defect records", exact: true })
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
test.beforeEach(async () => {
  await fixture("reset-defects");
  await fixture("reset");
});
test.afterAll(async () => {
  await fixture("reset-defects");
  await fixture("reset");
});

test("renders an empty collection honestly without offering detached defect creation", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/app");
  await page.getByRole("link", { name: "Manage defects" }).click();
  await expect(
    page.getByRole("heading", { name: "No collection items yet" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Add defect" })).toHaveCount(0);
  expect(await fixture("defect-count")).toBe(0);
});
test("creates separate defects, accepts and repairs a record, then deletes with confirmation", async ({
  page,
  context,
}) => {
  await signIn(context);
  const { firstId } = await fixture("seed-defect-items");
  await page.goto(`/app/defects?itemId=${firstId}`);
  await expect(
    page.getByRole("heading", { name: "No defects recorded" }),
  ).toBeVisible();
  await expect(
    page.getByText("Its condition has not necessarily been checked.", {
      exact: false,
    }),
  ).toBeVisible();
  await add(page);
  await add(page, "Yellowed plastic", "ACCEPTED");
  await expect(
    page.getByText("1 active · 1 accepted · 0 repaired · 2 unresolved", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(record(page, "Yellowed plastic")).toContainText(
    "Acknowledged; still unresolved.",
  );
  await page
    .getByRole("button", { name: "Edit Broken hinge", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Status", { exact: true }).selectOption("REPAIRED");
  await dialog.getByLabel("Repair note (optional)").fill("Replaced the hinge");
  await dialog.getByRole("button", { name: "Save defect" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(record(page, "Broken hinge")).toContainText("Repaired on");
  await expect(record(page, "Broken hinge")).toContainText(
    "Replaced the hinge",
  );
  await expect(
    page.getByText("0 active · 1 accepted · 1 repaired · 1 unresolved", {
      exact: true,
    }),
  ).toBeVisible();
  const date = await record(page, "Broken hinge")
    .locator("time")
    .getAttribute("datetime");
  await page
    .getByRole("button", { name: "Edit Broken hinge", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: false }).fill("Hinge repaired");
  await dialog.getByRole("button", { name: "Save defect" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(record(page, "Hinge repaired").locator("time")).toHaveAttribute(
    "datetime",
    date!,
  );
  await page
    .getByRole("button", { name: "Delete Yellowed plastic", exact: true })
    .click();
  const confirmation = page.getByRole("alertdialog");
  await expect(
    confirmation.getByRole("button", { name: "Cancel" }),
  ).toBeFocused();
  await confirmation
    .getByRole("button", { name: "Delete defect", exact: true })
    .click();
  await expect(confirmation).toHaveCount(0);
  await expect(record(page, "Yellowed plastic")).toHaveCount(0);
  expect(await fixture("defect-count")).toBe(1);
  await page.reload();
  await expect(record(page, "Hinge repaired")).toBeVisible();
});
test("keeps two copies of the same release separate when choosing a copy", async ({
  page,
  context,
}) => {
  await signIn(context);
  const { firstId, secondId, consoleId } = await fixture("seed-defect-items");
  await page.goto(`/app/defects?itemId=${firstId}`);
  await add(page, "Scratched disc");
  await page.getByLabel("Collection copy").selectOption(secondId);
  await page.getByRole("button", { name: "View copy" }).click();
  await expect(page).toHaveURL(new RegExp(secondId));
  await expect(record(page, "Scratched disc")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "No defects recorded" }),
  ).toBeVisible();
  await page.getByLabel("Collection copy").selectOption(consoleId);
  await page.getByRole("button", { name: "View copy" }).click();
  await expect(
    page.getByRole("heading", { name: /SNES · Super Nintendo · Copy/ }),
  ).toBeVisible();
  await add(page, "Intermittent controller port");
  expect(await fixture("defect-count")).toBe(2);
  await page.getByLabel("Collection copy").selectOption(firstId);
  await page.getByRole("button", { name: "View copy" }).click();
  await expect(record(page, "Scratched disc")).toBeVisible();
  await expect(record(page, "Intermittent controller port")).toHaveCount(0);
});
test("rejects a stale open form from another tab while retaining entered details", async ({
  page,
  context,
}) => {
  await signIn(context);
  const { firstId } = await fixture("seed-defect-items");
  await page.goto(`/app/defects?itemId=${firstId}`);
  await page.getByRole("button", { name: "Add defect" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: false }).fill("Stale title");
  await dialog
    .getByLabel("Description (optional)")
    .fill("Do not lose this note");
  const other = await context.newPage();
  try {
    await other.goto(`/app/defects?itemId=${firstId}`);
    await add(other, "Newer record");
    await dialog.getByRole("button", { name: "Save defect" }).click();
    await expect(dialog.getByRole("alert")).toContainText(
      "changed while you were editing",
    );
    await expect(dialog.getByLabel("Title", { exact: false })).toHaveValue(
      "Stale title",
    );
    await expect(dialog.getByLabel("Description (optional)")).toHaveValue(
      "Do not lose this note",
    );
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await page.reload();
    await expect(record(page, "Newer record")).toBeVisible();
    expect(await fixture("defect-count")).toBe(1);
  } finally {
    await other.close();
  }
});
test("revalidates a demoted editor after the defect form opens and presents a viewer screen", async ({
  page,
  context,
}) => {
  await signIn(context);
  await fixture("seed-defect-items");
  await page.goto("/app/defects");
  await page.getByRole("button", { name: "Add defect" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: false }).fill("Private fault");
  await fixture("update", JSON.stringify({ role: "VIEWER" }));
  await dialog.getByRole("button", { name: "Save defect" }).click();
  await expect(dialog.getByRole("alert")).toContainText("cannot change");
  await expect(dialog.getByLabel("Title", { exact: false })).toHaveValue(
    "Private fault",
  );
  expect(await fixture("defect-count")).toBe(0);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await page.reload();
  await expect(
    page.getByText("View-only access.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Add defect" })).toHaveCount(0);
});
test("keeps defect details private for anonymous and public visitors", async ({
  page,
  context,
  browser,
}) => {
  await signIn(context);
  await fixture("seed-defect-items");
  const response = await page.goto("/app/defects");
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await add(page, "Private defect description");
  const anonymous = await browser.newContext({
    baseURL: "https://127.0.0.1:3111",
    ignoreHTTPSErrors: true,
  });
  try {
    const other = await anonymous.newPage();
    await other.goto("/app/defects");
    await expect(other).toHaveURL(/\/login$/);
    await expect(
      other.getByText("Private defect description", { exact: true }),
    ).toHaveCount(0);
    await other.goto("/");
    await expect(
      other.getByText("Private defect description", { exact: true }),
    ).toHaveCount(0);
  } finally {
    await anonymous.close();
  }
});
test("keeps long defect content and forms usable at 320px in dark mode with reduced motion", async ({
  page,
  context,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(context);
  await fixture("seed-defect-items");
  await page.goto("/app/defects");
  await page.screenshot({
    path: testInfo.outputPath("defects-layout.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.reload();
  await page.getByRole("button", { name: "Add defect" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: false }).fill("A".repeat(200));
  await dialog
    .getByLabel("Description (optional)")
    .fill("Fault details ".repeat(50));
  await dialog.getByLabel("Severity", { exact: true }).selectOption("CRITICAL");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await dialog.getByRole("button", { name: "Save defect" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(record(page, "A".repeat(200))).toContainText("Critical");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("defects-320px.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
