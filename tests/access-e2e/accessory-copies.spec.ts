import { expect, test, type Page } from "@playwright/test";
import { fixture, signIn } from "../helpers/model-browser";
import { monochromePng } from "../helpers/png-fixtures";
import { modelFixture } from "../helpers/model-fixture";
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
async function choose(page: Page) {
  await page.goto("/app/accessories/new");
  await page
    .getByRole("option", { name: "Select DualShock 2", exact: true })
    .click();
  await next(page);
  await page
    .getByRole("option", { name: "Select Black (black)", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Selected accessory" }),
  ).toContainText("Analog support varies by game");
  await next(page);
}
async function save(page: Page) {
  await next(page);
  await page
    .getByRole("button", { name: "Save accessory", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Accessory saved", exact: true }),
  ).toBeVisible();
}
async function view(page: Page) {
  await page.getByRole("link", { name: "View accessory", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "DualShock 2 · Black", level: 1 }),
  ).toBeVisible();
}
test("@critical editor creates, edits, reidentifies and deletes a private copy with photos and a custom model", async ({
  page,
  context,
}, info) => {
  test.setTimeout(90000);
  const data = await fixture("seed-accessory-copies");
  await signIn(context);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/app/collection");
  await expect(
    page.getByRole("link", { name: "Add accessory", exact: true }),
  ).toBeVisible();
  await choose(page);
  await page.getByLabel("Serial number", { exact: true }).fill("DS2-0001");
  await page
    .getByLabel("Location", { exact: true })
    .selectOption(data.locationId);
  await page.getByLabel("Has box", { exact: true }).selectOption("yes");
  await page
    .getByLabel("Private notes", { exact: true })
    .fill("Childhood controller");
  await page.getByRole("button", { name: "Add defect", exact: true }).click();
  await page.getByLabel(/Defect 1 title/).fill("Cable wear");
  await page.getByLabel("Choose photos", { exact: true }).setInputFiles({
    name: "controller.png",
    mimeType: "image/png",
    buffer: monochromePng(120, 80),
  });
  await page.getByLabel("Custom 3D model", { exact: true }).setInputFiles({
    name: "synthetic-controller.glb",
    mimeType: "model/gltf-binary",
    buffer: modelFixture().bytes,
  });
  expect(await fixture("asset-count")).toBe(0);
  await next(page);
  await expect(
    page.getByRole("heading", { name: "Review", exact: true }),
  ).toBeFocused();
  await page.screenshot({
    path: info.outputPath("accessory-review.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Save accessory", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Accessory saved", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Saved privately", { exact: true })).toHaveCount(
    2,
    { timeout: 30000 },
  );
  let state = await fixture("accessory-copy-state");
  expect(state).toMatchObject([
    {
      publicationStatus: "PRIVATE",
      serialNumber: "DS2-0001",
      notes: "Childhood controller",
      hasBox: true,
      locationId: data.locationId,
      defects: [{ title: "Cable wear" }],
      media: expect.arrayContaining([
        {
          id: expect.any(String),
          type: "CUSTOM_MODEL",
          assetId: expect.any(String),
          isPrimary: false,
        },
      ]),
    },
  ]);
  const id = state[0].id;
  await view(page);
  const models = page.getByRole("region", {
    name: "Custom 3D models",
    exact: true,
  });
  await models
    .getByRole("button", { name: "Use for copy", exact: true })
    .click();
  await expect(models).toContainText("synthetic-controller.glb · Selected");
  await expect(
    page.getByRole("button", { name: "View in 3D", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit accessory", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Private notes", { exact: true })
    .fill("Repaired cable");
  await dialog
    .getByRole("button", {
      name: "Correct variant identification",
      exact: true,
    })
    .click();
  await dialog
    .getByRole("button", { name: "Find variants", exact: true })
    .click();
  await dialog
    .getByRole("option", { name: "Select Silver (silver)", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "DualShock 2 · Silver", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Repaired cable", { exact: true })).toBeVisible();
  state = await fixture("accessory-copy-state");
  expect(state[0]).toMatchObject({
    id,
    ownedAccessory: { accessoryVariantId: data.silverId },
    defects: [{ title: "Cable wear" }],
    media: expect.any(Array),
  });
  expect(state[0].media).toHaveLength(2);
  await page.screenshot({
    path: info.outputPath("accessory-copy.png"),
    fullPage: true,
  });
  await models
    .getByRole("button", { name: "Remove model", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Remove model", exact: true })
    .click();
  await expect(models).toContainText("Catalog default, when available");
  const assets = await fixture("asset-count");
  await page
    .getByRole("button", { name: "Delete accessory", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Delete accessory", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Delete accessory", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete accessory", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/collection/);
  expect(await fixture("accessory-copy-state")).toEqual([]);
  expect(await fixture("asset-count")).toBe(assets);
  expect((await fixture("accessory-catalog-state")).variants).toHaveLength(2);
  expect(errors).toEqual([]);
});
test("stale catalog and copy edits preserve entered details and require explicit review", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  const data = await fixture("seed-accessory-copies");
  await signIn(context);
  await choose(page);
  await page.getByLabel("Private notes", { exact: true }).fill("Keep my draft");
  await next(page);
  await fixture(
    "accessory-variant-revise",
    JSON.stringify({ id: data.variantId }),
  );
  await page
    .getByRole("button", { name: "Save accessory", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Add accessory", exact: true })
      .getByRole("alert"),
  ).toContainText("variant changed");
  expect(await fixture("accessory-copy-state")).toEqual([]);
  await page
    .getByRole("button", { name: "Refresh catalog choices", exact: true })
    .click();
  await expect(page.getByLabel("Private notes", { exact: true })).toHaveValue(
    "Keep my draft",
  );
  await save(page);
  await view(page);
  const [{ id }] = await fixture("accessory-copy-state");
  await page
    .getByRole("button", { name: "Edit accessory", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Private notes", { exact: true })
    .fill("My unsaved revision");
  await fixture("accessory-copy-concurrent-edit", JSON.stringify({ id }));
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("copy changed");
  await expect(dialog.getByLabel("Private notes", { exact: true })).toHaveValue(
    "My unsaved revision",
  );
  expect((await fixture("accessory-copy-state"))[0].notes).toBe(
    "Edited in another session",
  );
});
test("viewer can read copies and photos but cannot create, edit or upload models", async ({
  page,
  context,
  browser,
}) => {
  await fixture("seed-accessory-copies");
  await signIn(context);
  await choose(page);
  await save(page);
  await view(page);
  const url = page.url();
  const viewer = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    await signIn(viewer, "VIEWER", "accessory-viewer@example.com");
    const read = await viewer.newPage();
    await read.goto(url);
    await expect(
      read.getByRole("heading", { name: "DualShock 2 · Black", level: 1 }),
    ).toBeVisible();
    await expect(
      read.getByRole("button", { name: "Edit accessory", exact: true }),
    ).toHaveCount(0);
    await expect(
      read.getByLabel("Upload custom 3D model", { exact: true }),
    ).toHaveCount(0);
    await expect(
      read.getByRole("link", { name: "View photos", exact: true }),
    ).toBeVisible();
    await read.goto("/app/accessories/new");
    await expect(read).toHaveURL(/access-denied/);
  } finally {
    await viewer.close();
  }
});
test("model validation and uncertain uploads preserve the saved copy without automatic resend", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  await fixture("seed-accessory-copies");
  await signIn(context);
  await choose(page);
  await page.getByLabel("Custom 3D model", { exact: true }).setInputFiles({
    name: "invalid.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("invalid"),
  });
  await expect(
    page
      .getByRole("region", { name: "Add accessory", exact: true })
      .getByRole("alert"),
  ).toBeVisible();
  await save(page);
  await view(page);
  const region = page.getByRole("region", {
    name: "Custom 3D models",
    exact: true,
  });
  let attempts = 0;
  await page.route("**/api/uploads", async (route) => {
    attempts++;
    await route.abort("failed");
  });
  await region
    .getByLabel("Upload custom 3D model", { exact: true })
    .setInputFiles({
      name: "controller.glb",
      mimeType: "model/gltf-binary",
      buffer: modelFixture().bytes,
    });
  await region
    .getByRole("button", { name: "Upload model", exact: true })
    .click();
  await expect(region.getByRole("alert")).toBeVisible();
  await expect(
    region.getByRole("button", { name: "Upload model", exact: true }),
  ).toBeDisabled();
  expect(attempts).toBe(1);
  expect(await fixture("accessory-copy-state")).toHaveLength(1);
});
test("narrow dark and reduced-motion layouts keep review and edit controls usable", async ({
  page,
  context,
}, info) => {
  await fixture("seed-accessory-copies");
  await signIn(context);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await choose(page);
  await page
    .getByLabel("Private notes", { exact: true })
    .fill("LongPrivateNote".repeat(80));
  await next(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("accessory-mobile-review.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Save accessory", exact: true })
    .click();
  await view(page);
  await page
    .getByRole("button", { name: "Edit accessory", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("accessory-mobile-edit.png"),
    fullPage: true,
  });
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  const layout = await page.evaluate(() => ({
    fits: document.documentElement.scrollWidth <= window.innerWidth,
    overflow: Array.from(document.querySelectorAll("body *"))
      .filter(
        (node) => node.getBoundingClientRect().right > window.innerWidth + 1,
      )
      .map((node) => ({
        tag: node.tagName,
        text: node.textContent?.slice(0, 80),
        class: node.className,
      }))
      .slice(-15),
  }));
  expect(layout.fits, JSON.stringify(layout.overflow)).toBe(true);
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    dialog.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("accessory-mobile-zoom.png") });
});
test("recovers a lost save response as one copy and opens it from collection, search and palette", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  await fixture("seed-accessory-copies");
  await signIn(context);
  await choose(page);
  await next(page);
  let dropped = false;
  await page.route("**/app/accessories/new", async (route) => {
    if (
      !dropped &&
      route.request().method() === "POST" &&
      route.request().headers()["next-action"]
    ) {
      dropped = true;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Save accessory", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Add accessory", exact: true })
      .getByRole("alert"),
  ).toBeVisible();
  expect(await fixture("accessory-copy-state")).toHaveLength(1);
  await page
    .getByRole("button", { name: "Save accessory", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Accessory saved", exact: true }),
  ).toBeVisible();
  const [{ id }] = await fixture("accessory-copy-state");
  await page.goto("/app/collection");
  await page.getByRole("link", { name: /View accessory DualShock 2/ }).click();
  await expect(page).toHaveURL(new RegExp(`/app/accessories/${id}$`));
  await page.goto("/app/search");
  await page
    .getByLabel("Search your collection", { exact: true })
    .fill("DualShock");
  await page.getByRole("link", { name: /View accessory DualShock 2/ }).click();
  await expect(page).toHaveURL(new RegExp(`/app/accessories/${id}$`));
  await page
    .getByRole("button", { name: "Open command palette", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Quick search",
    exact: true,
  });
  await dialog
    .getByRole("combobox", { name: "Search copies, catalog or pages" })
    .fill("DualShock");
  await dialog
    .getByRole("group", { name: "Accessories", exact: true })
    .getByRole("option")
    .click();
  await dialog
    .getByRole("option", { name: "View accessory", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/app/accessories/${id}$`));
  expect(await fixture("accessory-copy-state")).toHaveLength(1);
});
