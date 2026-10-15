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
  await fixture("reset-catalog");
  await fixture("reset");
});
test.afterAll(async () => {
  await fixture("reset-catalog");
  await fixture("reset");
});
async function add(
  page: Page,
  section: string,
  action: string,
  name: string,
  slug: string,
) {
  await page.getByRole("link", { name: section, exact: true }).click();
  await page.getByRole("link", { name: action, exact: true }).click();
  await page.getByLabel("Name (required)", { exact: true }).fill(name);
  await page.getByLabel("Slug (required)", { exact: true }).fill(slug);
}
async function save(page: Page) {
  const previous = Number(
    await page
      .locator("[data-catalog-revision]")
      .getAttribute("data-catalog-revision"),
  );
  await page
    .getByRole("button", { name: "Save catalog record", exact: true })
    .click();
  await expect(page.locator("[data-catalog-revision]")).toHaveAttribute(
    "data-catalog-revision",
    String(previous + 1),
  );
  await expect(
    page.getByRole("status").filter({ hasText: "Catalog record saved." }),
  ).toBeVisible();
}
async function pick(page: Page, label: string, query: string) {
  const input = page.getByLabel(`Find ${label}`);
  await input.fill(query);
  await input.press("Enter");
  await page
    .getByRole("button", { name: `Select ${query}`, exact: true })
    .click();
}
test("creates and edits a complete console catalog without creating owned copies", async ({
  page,
  context,
}, info) => {
  await signIn(context);
  await page.goto("/app");
  await page.getByRole("link", { name: "Manage console catalog" }).click();
  await add(page, "Companies", "Add company", "Sony", "sony");
  await page.getByLabel("Country code", { exact: true }).fill("JP");
  await save(page);
  await add(page, "Markets", "Add market", "Japan", "japan");
  await page.getByLabel("Market code (required)", { exact: true }).fill("JP");
  await save(page);
  await add(page, "Platforms", "Add platform", "PlayStation", "playstation");
  await pick(page, "brand company", "Sony");
  await save(page);
  await add(
    page,
    "Hardware models",
    "Add hardware model",
    "SCPH-1000",
    "scph-1000",
  );
  await pick(page, "platform (required)", "PlayStation");
  await pick(page, "commercial markets", "Japan");
  await expect(
    page.getByText("Unknown manufacturers remain empty", { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("Region lock", { exact: true })
    .selectOption("RESTRICTED");
  await page
    .getByLabel("Specifications (JSON)", { exact: true })
    .fill('{"cpu":{"name":"R3000"}}');
  await page.getByRole("button", { name: "Add external reference" }).click();
  await page.getByLabel("Provider", { exact: true }).fill("wiki");
  await page.getByLabel("Object type", { exact: true }).fill("hardware");
  await page.getByLabel("External ID", { exact: true }).fill("1000");
  await page
    .getByLabel("URL", { exact: true })
    .fill("https://example.com/hardware#notes");
  await save(page);
  await page.reload();
  await expect(
    page.getByLabel("Specifications (JSON)", { exact: true }),
  ).toHaveValue(/R3000/);
  const state = await fixture("catalog-state");
  expect(state.copies).toBe(0);
  expect(state.history).toBeGreaterThan(10);
  expect(state.models).toMatchObject([
    {
      name: "SCPH-1000",
      manufacturerId: null,
      revision: 1,
      regionLock: "RESTRICTED",
      regions: [{ regionId: expect.any(String) }],
      specifications: { schemaVersion: 1, data: { cpu: { name: "R3000" } } },
      externalReferences: [
        {
          provider: "wiki",
          externalId: "1000",
          normalizedUrl: "https://example.com/hardware",
        },
      ],
    },
  ]);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Original Japanese hardware revision");
  await save(page);
  await expect(
    page.getByRole("heading", { name: "Change history" }),
  ).toBeVisible();
  expect((await fixture("catalog-state")).models[0].revision).toBe(2);
  await page.screenshot({
    path: info.outputPath("console-catalog.png"),
    fullPage: true,
  });
});
test("retains invalid reference inputs with clear errors", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/app/catalog?kind=company&new=1");
  await page.getByLabel("Name (required)", { exact: true }).fill("Sony");
  await page.getByLabel("Slug (required)", { exact: true }).fill("sony");
  await page.getByRole("button", { name: "Add external reference" }).click();
  await page.getByLabel("Provider", { exact: true }).fill("wiki");
  await page.getByLabel("External ID", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Save catalog record" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: /object type/i }),
  ).toBeVisible();
  await expect(page.getByLabel("Name (required)", { exact: true })).toHaveValue(
    "Sony",
  );
  expect((await fixture("catalog-state")).companies).toBe(0);
  await page.getByLabel("Object type", { exact: true }).fill("company");
  await save(page);
});
test("archives and restores with keyboard focus and status filtering", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/app/catalog");
  await add(page, "Companies", "Add company", "Sony", "sony");
  await save(page);
  await page
    .getByRole("button", { name: "Archive record", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Archive record", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Archive record", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm archive", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Restore record", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Name (required)", { exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("link", { name: "Back to catalog", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "No active records" }),
  ).toBeVisible();
  await page.getByLabel("Record status").selectOption("archived");
  await page.getByRole("button", { name: "Apply status" }).click();
  await page.getByRole("link", { name: "Edit Sony", exact: true }).click();
  await page
    .getByRole("button", { name: "Restore record", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm restore", exact: true })
    .click();
  await expect(
    page.getByLabel("Name (required)", { exact: true }),
  ).toBeEnabled();
});
for (const role of ["EDITOR", "VIEWER"] as const)
  test(`${role} cannot enter catalog administration`, async ({
    page,
    context,
  }) => {
    await signIn(context, role);
    await page.goto("/app");
    await expect(
      page.getByRole("link", { name: "Manage console catalog" }),
    ).toHaveCount(0);
    await page.goto("/app/catalog");
    await expect(page).toHaveURL(/\/access-denied$/);
    expect((await fixture("catalog-state")).companies).toBe(0);
  });
test("pages large catalogs and stays usable at 320px in dark reduced-motion mode", async ({
  page,
  context,
}, info) => {
  await signIn(context);
  await fixture("seed-catalog-pages");
  await page.goto("/app/catalog?kind=company");
  await expect(
    page
      .getByRole("list", { name: "Companies", exact: true })
      .getByRole("listitem"),
  ).toHaveCount(25);
  await page.getByRole("link", { name: "Next page" }).click();
  await expect(
    page
      .getByRole("list", { name: "Companies", exact: true })
      .getByRole("listitem"),
  ).toHaveCount(2);
  await page.goBack();
  await expect(page.getByText("Page 1", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page
    .getByRole("link", { name: "Edit Company 00", exact: true })
    .click();
  await page
    .getByLabel("Name (required)", { exact: true })
    .fill("VeryLongCanonicalName".repeat(9));
  await save(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("catalog-mobile-dark.png"),
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Back to catalog", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
