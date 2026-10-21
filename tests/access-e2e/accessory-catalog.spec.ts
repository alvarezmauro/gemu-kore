import { expect, test, type Page } from "@playwright/test";
import { fixture, signIn } from "../helpers/model-browser";
test.beforeEach(async () => {
  await fixture("reset-catalog");
  await fixture("reset");
});
test.afterAll(async () => {
  await fixture("reset-catalog");
  await fixture("reset");
});
const base = "/app/catalog/accessories";
async function save(page: Page) {
  const root = page.locator("[data-accessory-catalog-revision]");
  const revision = Number(
    await root.getAttribute("data-accessory-catalog-revision"),
  );
  await page
    .getByRole("button", { name: "Save catalog record", exact: true })
    .click();
  await expect(root).toHaveAttribute(
    "data-accessory-catalog-revision",
    String(revision + 1),
  );
}
async function pick(page: Page, label: string, query: string, button: string) {
  const group = page.getByRole("group", { name: label, exact: true });
  await group
    .getByLabel(`Find ${label.toLowerCase()}`, { exact: true })
    .fill(query);
  await group
    .getByLabel(`Find ${label.toLowerCase()}`, { exact: true })
    .press("Enter");
  await group.getByRole("button", { name: button, exact: true }).click();
}
async function family(page: Page, name = "DualShock 2") {
  await page.goto(`${base}?new=1`);
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Slug", { exact: true }).fill("dualshock-2");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Shared controller description.");
  await page
    .getByLabel("Specifications (JSON)", { exact: true })
    .fill('{"connection":"wired","buttons":12}');
  await page.getByLabel("Release year", { exact: true }).fill("2000");
  await pick(page, "Producer", "Sony", "Select Sony");
  await page
    .getByLabel("Video provider", { exact: true })
    .selectOption("YOUTUBE");
  await page.getByLabel("Video ID or URL", { exact: true }).fill("aqz-KE-bpKQ");
  await save(page);
  return page.url();
}
async function newVariant(page: Page, name: string, slug: string) {
  await page.goto(`${base}?kind=variant&new=1`);
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Slug", { exact: true }).fill(slug);
  await pick(
    page,
    "Accessory family",
    "DualShock",
    "Select DualShock 2 (dualshock-2)",
  );
}
test("administrators curate family defaults, explicit multi-platform variants and reviewed compatibility copies", async ({
  page,
  context,
}, info) => {
  test.setTimeout(90_000);
  await signIn(context, "ADMIN");
  await fixture("seed-accessory-catalog");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const familyUrl = await family(page);
  await newVariant(page, "Black", "black");
  await pick(
    page,
    "Commercial markets",
    "North America",
    "Select North America",
  );
  await pick(page, "Compatible platforms", "PlayStation", "Select PlayStation");
  await pick(
    page,
    "Compatible platforms",
    "PlayStation",
    "Select PlayStation 2",
  );
  await page
    .getByLabel("Compatibility notes for PlayStation", { exact: true })
    .fill("Adapter required");
  await page
    .getByLabel("Compatibility notes for PlayStation 2", { exact: true })
    .fill("PS2 connector");
  await page
    .getByLabel("Identification", { exact: true })
    .selectOption("CONFIRMED");
  await save(page);
  const blackUrl = page.url();
  await newVariant(page, "Silver", "silver");
  await pick(
    page,
    "Source variant",
    "Black",
    "Select DualShock 2 · Black (black)",
  );
  await page
    .getByRole("button", { name: "Load compatibility for review", exact: true })
    .click();
  await expect(
    page.getByLabel("Compatibility notes for PlayStation", { exact: true }),
  ).toHaveValue("Adapter required");
  await page
    .getByRole("button", { name: "Save catalog record", exact: true })
    .click();
  await expect(
    page.locator("[data-accessory-catalog-revision]").getByRole("alert"),
  ).toContainText("Review the copied compatibility list");
  await expect(
    page.locator("[data-accessory-catalog-revision]").getByRole("alert"),
  ).toBeFocused();
  expect((await fixture("accessory-catalog-state")).variants).toHaveLength(1);
  await page
    .getByRole("checkbox", {
      name: "I reviewed the copied compatibility list and notes for this variant.",
      exact: true,
    })
    .check();
  await save(page);
  const silverUrl = page.url();
  await page.goto(blackUrl);
  await page
    .getByRole("group", { name: "Compatible platforms", exact: true })
    .getByRole("button", { name: "Remove PlayStation", exact: true })
    .click();
  await save(page);
  await page.goto(silverUrl);
  await expect(
    page.getByLabel("Compatibility notes for PlayStation", { exact: true }),
  ).toHaveValue("Adapter required");
  await page.goto(familyUrl);
  const union = page.getByRole("region", {
    name: "Compatibility across active variants",
    exact: true,
  });
  await expect(union.getByRole("listitem")).toHaveCount(2);
  await expect(union).toContainText("PlayStation 2");
  await expect(
    page.getByRole("heading", { name: "Change history", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("accessory-family.png"),
    fullPage: true,
  });
  await page.goto(silverUrl);
  await page
    .getByRole("button", { name: "Archive record", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Restore record", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Restore record", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Archive record", exact: true }),
  ).toBeVisible();
  expect((await fixture("accessory-catalog-state")).ownedCount).toBe(0);
  await expect(page.locator("canvas, iframe, video")).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("stale accessory drafts survive conflict and live role changes block catalog actions", async ({
  page,
  context,
}) => {
  await signIn(context, "ADMIN");
  await fixture("seed-accessory-catalog");
  const url = await family(page),
    other = await context.newPage();
  await other.goto(url);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Winning description");
  await save(page);
  await other
    .getByLabel("Description", { exact: true })
    .fill("Unsaved description");
  await other
    .getByRole("button", { name: "Save catalog record", exact: true })
    .click();
  await expect(
    other.locator("[data-accessory-catalog-revision]").getByRole("alert"),
  ).toContainText("changed while you were editing");
  await expect(other.getByLabel("Description", { exact: true })).toHaveValue(
    "Unsaved description",
  );
  await expect(
    other.locator("[data-accessory-catalog-revision]").getByRole("alert"),
  ).toBeFocused();
  await other
    .getByRole("button", { name: "Archive record", exact: true })
    .click();
  await expect(
    other.locator("[data-accessory-catalog-revision]").getByRole("alert"),
  ).toContainText("changed while you were editing");
  await fixture("update", JSON.stringify({ role: "VIEWER" }));
  await page
    .getByRole("button", { name: "Save catalog record", exact: true })
    .click();
  await expect(
    page.locator("[data-accessory-catalog-revision]").getByRole("alert"),
  ).toContainText("Only administrators");
  await page.reload();
  await expect(page).toHaveURL(/access-denied/);
  expect((await fixture("accessory-catalog-state")).families[0]).toMatchObject({
    revision: 2,
    archivedAt: null,
  });
});
test("accessory catalog denies anonymous, editor and viewer access", async ({
  page,
  context,
}) => {
  await page.goto(base);
  await expect(page).toHaveURL(/login/);
  await signIn(context, "EDITOR");
  await page.goto(base);
  await expect(page).toHaveURL(/access-denied/);
  await fixture("update", JSON.stringify({ role: "VIEWER" }));
  await page.goto(`${base}?kind=variant&new=1`);
  await expect(page).toHaveURL(/access-denied/);
});
test("accessory forms preserve invalid inputs and long titles at 320px in dark reduced-motion mode", async ({
  page,
  context,
}, info) => {
  await signIn(context, "ADMIN");
  await fixture("seed-accessory-catalog");
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await context.addInitScript(() =>
    localStorage.setItem("gemukore-theme", "dark"),
  );
  const title = "Controller".repeat(15);
  const url = await family(page, title);
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByLabel("Specifications (JSON)", { exact: true })
    .fill("{broken");
  await page
    .getByRole("button", { name: "Save catalog record", exact: true })
    .click();
  await expect(
    page.locator("[data-accessory-catalog-revision]").getByRole("alert"),
  ).toContainText("Specifications must be a JSON object");
  await expect(
    page.getByLabel("Specifications (JSON)", { exact: true }),
  ).toHaveValue("{broken");
  await page
    .getByRole("link", { name: "Back to catalog", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: `Edit ${title}`, exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("accessory-catalog-mobile-dark.png"),
    fullPage: true,
  });
  await page.goto(url);
  await page
    .getByLabel("Specifications (JSON)", { exact: true })
    .fill('{"connection":"wired"}');
  await page
    .getByRole("button", { name: "Add reference", exact: true })
    .click();
  await page.getByLabel("Reference 1 provider", { exact: true }).fill("manual");
  await page
    .getByLabel("Reference 1 url", { exact: true })
    .fill("javascript:alert(1)");
  await page
    .getByRole("button", { name: "Save catalog record", exact: true })
    .click();
  await expect(
    page.locator("[data-accessory-catalog-revision]").getByRole("alert"),
  ).toBeVisible();
  await expect(page.getByLabel("Reference 1 url", { exact: true })).toHaveValue(
    "javascript:alert(1)",
  );
});
