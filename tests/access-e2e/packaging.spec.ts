import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { fixture, openModel, signIn } from "../helpers/model-browser";
test.beforeEach(async () => {
  await fixture("reset-search");
  await fixture("reset");
});
test.afterAll(async () => {
  await fixture("reset-search");
  await fixture("reset");
});
test("curates a measured synthetic box and private artwork, then lazily renders distinct faces with accessible mobile controls", async ({
  page,
  context,
}, info) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const identity = await signIn(context, "ADMIN"),
    catalog = await fixture("seed-game-creation");
  await fixture("seed-packaging-components", catalog.releaseId);
  const copy = await fixture(
    "seed-provenance-copy",
    JSON.stringify({ token: identity.token, releaseId: catalog.releaseId }),
  );
  await page.goto(
    `/app/catalog/games/packaging?releaseId=${catalog.releaseId}`,
  );
  await page
    .getByText("Create SNES cardboard template", { exact: true })
    .click();
  await page
    .getByLabel("Template name", { exact: true })
    .fill("Synthetic SNES demonstration");
  await page.getByLabel("Unique slug").fill("synthetic-snes-box");
  for (const [name, value] of [
    ["width", "180"],
    ["height", "125"],
    ["depth", "30"],
  ])
    await page.getByLabel(`${name} (mm)`, { exact: true }).fill(value);
  await page
    .getByLabel("Measurement source or synthetic fixture note")
    .fill("Synthetic dimensions for testing only.");
  await page.getByLabel("Synthetic demonstration dimensions").check();
  await page
    .getByRole("button", { name: "Create draft template", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Mark ready", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mark ready", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mark ready", exact: true }),
  ).toHaveCount(0);
  const image = await sharp(
    Buffer.from(
      '<svg width="300" height="200"><rect width="300" height="200" fill="#f04444"/><rect width="150" height="100" fill="#25a055"/><text x="10" y="170" font-size="50" fill="white">FRONT</text></svg>',
    ),
  )
    .png()
    .toBuffer();
  await page.getByLabel("Artwork file", { exact: true }).setInputFiles({
    name: "synthetic-front.png",
    mimeType: "image/png",
    buffer: image,
  });
  await page
    .getByLabel("Artwork label", { exact: true })
    .fill("Synthetic front artwork");
  await page
    .getByLabel("License name", { exact: true })
    .fill("Original synthetic test image");
  await page
    .getByRole("button", { name: "Upload artwork", exact: true })
    .click();
  await expect(
    page.getByText(
      "Artwork uploaded. Choose it in a face and save the assignment.",
    ),
  ).toBeVisible({ timeout: 25000 });
  const component = page.locator("form").filter({
    has: page.getByRole("heading", { name: "Outer box", exact: true }),
  });
  const state = await fixture("packaging-state"),
    templateId = state.templates[0].id;
  await component
    .getByLabel("Box template", { exact: true })
    .selectOption(templateId);
  const front = component.getByRole("group", {
      name: "FRONT · Required",
      exact: true,
    }),
    back = component.getByRole("group", {
      name: "BACK · Required",
      exact: true,
    }),
    spine = component.getByRole("group", {
      name: "SPINE · Required",
      exact: true,
    });
  const assetId = state.uses[0].assetId;
  await front.getByLabel("Artwork", { exact: true }).selectOption(assetId);
  await spine.getByLabel("Artwork", { exact: true }).selectOption(assetId);
  await back.getByLabel("Artwork", { exact: true }).selectOption(assetId);
  await back.getByLabel("Clockwise rotation").selectOption("2");
  await front.getByLabel("Crop x", { exact: true }).fill("0.8");
  await component
    .getByRole("button", { name: "Save Outer box packaging", exact: true })
    .click();
  await expect(component.getByRole("status")).toContainText(
    "Check the template, artwork and crop.",
  );
  await expect(front.getByLabel("Crop x", { exact: true })).toHaveValue("0.8");
  await front.getByLabel("Crop x", { exact: true }).fill("0");
  await component
    .getByRole("button", { name: "Save Outer box packaging", exact: true })
    .click();
  await expect(
    page.getByText("Outer box packaging saved.", { exact: true }),
  ).toBeVisible();
  const saved = await fixture("packaging-state");
  expect(saved.bindings).toHaveLength(3);
  expect(
    saved.assets.some(
      (a: { licenseName: string }) =>
        a.licenseName === "Original synthetic test image",
    ),
  ).toBe(true);
  expect(saved.copies[0].hasBox).toBeNull();
  let transfers = 0;
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === `/api/media/private/${assetId}`)
      transfers++;
  });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/app/games/${copy.id}`);
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(transfers).toBe(0);
  const viewer = await openModel(page);
  expect(transfers).toBe(1);
  await viewer.getByRole("button", { name: "Front view", exact: true }).click();
  const frontImage = await viewer
    .locator("canvas")
    .screenshot({ path: info.outputPath("box-front.png") });
  await viewer.getByRole("button", { name: "Back view", exact: true }).click();
  expect((await viewer.locator("canvas").screenshot()).equals(frontImage)).toBe(
    false,
  );
  await viewer.getByRole("img", { name: /^Interactive 3D/ }).focus();
  await page.keyboard.press("Home");
  await expect(
    viewer.getByRole("button", { name: "Auto rotate", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("box-mobile.png"),
    fullPage: true,
  });
  await page
    .getByLabel("Expected package to preview")
    .selectOption({ label: "Inner box" });
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(
    page.getByText("No ready packaging preview is available."),
  ).toBeVisible();
  await page
    .getByLabel("Expected package to preview")
    .selectOption({ label: "Outer box" });
  await openModel(page);
  expect(transfers).toBe(2);
  await viewer
    .getByRole("button", { name: "Close 3D preview", exact: true })
    .click();
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(errors).toEqual([]);
  await fixture("update", JSON.stringify({ role: "VIEWER" }));
  await page.goto(
    `/app/catalog/games/packaging?releaseId=${catalog.releaseId}`,
  );
  await expect(page).toHaveURL(/access-denied/);
  const unauthorized = await context.request.get(
    `/api/media/private/${assetId}`,
  );
  expect(unauthorized.status()).toBe(200);
  await fixture("update", JSON.stringify({ enabled: false }));
  const denied = await context.request.get(`/api/media/private/${assetId}`);
  expect(denied.status()).toBe(403);
});
