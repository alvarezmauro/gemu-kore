import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { cartridgeFixture } from "../helpers/cartridge-fixture";
import { fixture, openModel, signIn } from "../helpers/model-browser";
test.beforeEach(async () => {
  await fixture("reset-search");
  await fixture("reset");
});
test.afterAll(async () => {
  await fixture("reset-search");
  await fixture("reset");
});
const geometry = cartridgeFixture(),
  shape = "cartridge",
  formatName = "cartridge",
  authored = true;
test(`curates cartridge geometry and independent private labels with accessible lazy previews`, async ({
  page,
  context,
}, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const identity = await signIn(context, "ADMIN"),
    catalog = await fixture("seed-game-creation");
  await fixture("seed-cartridge-components", catalog.releaseId);
  const copy = await fixture(
    "seed-provenance-copy",
    JSON.stringify({ token: identity.token, releaseId: catalog.releaseId }),
  );
  await page.goto(
    `/app/catalog/games/cartridges?releaseId=${catalog.releaseId}`,
  );
  await page.getByText("Create cartridge template", { exact: true }).click();
  await page
    .getByLabel("Template name", { exact: true })
    .fill(`Synthetic ${formatName} demonstration`);
  await page
    .getByLabel("Unique slug")
    .fill(`synthetic-${formatName.toLowerCase()}-box`);
  const format = page.getByLabel("Cartridge format", { exact: true });
  for (const key of [
    "nes-us",
    "famicom",
    "snes-us",
    "super-famicom",
    "genesis",
    "game-boy",
    "game-boy-color",
    "game-boy-advance",
    "nintendo-64",
    "other",
    "unspecified",
  ])
    await expect(format.locator(`option[value="${key}"]`)).toHaveCount(1);
  await format.selectOption("other");
  await expect(
    page.getByLabel("Shell variant", { exact: true }),
  ).toHaveAttribute("required", "");
  await format.selectOption("snes-us");
  await page
    .getByLabel("Shell variant", { exact: true })
    .fill("Original synthetic study");
  await expect(page.getByLabel("width (mm)", { exact: true })).toHaveValue("");
  await expect(
    page.getByLabel("Artwork surface mappings (JSON)", { exact: true }),
  ).toHaveValue("");
  const dimensions = geometry.dimensions;
  for (const [name, value] of [
    ["width", dimensions.widthMm],
    ["height", dimensions.heightMm],
    ["depth", dimensions.depthMm],
  ] as const)
    await page.getByLabel(`${name} (mm)`, { exact: true }).fill(String(value));
  await page
    .getByLabel("Measurement source or synthetic fixture note")
    .fill("Synthetic dimensions for testing only.");
  await page.getByLabel("Synthetic demonstration dimensions").check();
  if (authored)
    await page
      .getByLabel("Artwork surface mappings (JSON)", { exact: true })
      .fill(JSON.stringify(geometry.slots));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Create draft template", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Mark ready", exact: true }),
  ).toBeVisible();
  if (authored) {
    await expect(
      page.getByRole("button", { name: "Mark ready", exact: true }),
    ).toBeDisabled();
    const upload = page.locator("form").filter({
      has: page.getByRole("heading", {
        name: `Upload ${shape} geometry`,
        exact: true,
      }),
    });
    await upload
      .getByLabel("Cartridge GLB file (up to 8 MiB)", { exact: true })
      .setInputFiles({
        name: "synthetic-cartridge.glb",
        mimeType: "model/gltf-binary",
        buffer: geometry.bytes,
      });
    await upload
      .getByLabel("License name", { exact: true })
      .fill("Original synthetic cartridge");
    await upload
      .getByRole("button", { name: "Upload geometry", exact: true })
      .click();
    await expect(
      page.getByRole("link", {
        name: `Download private ${shape} model for review`,
      }),
    ).toBeVisible({ timeout: 25000 });
    await page
      .getByLabel(
        `I reviewed this model’s ${shape} shape, measured dimensions, source and artwork surface mappings.`,
        { exact: true },
      )
      .check();
  }
  await page.getByRole("button", { name: "Mark ready", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mark ready", exact: true }),
  ).toHaveCount(0);
  {
    const neutralState = await fixture("media-state");
    const neutralEditor = page.locator("form").filter({
      has: page.getByRole("heading", { name: "Cartridge", exact: true }),
    });
    await neutralEditor
      .getByLabel("Cartridge template", { exact: true })
      .selectOption(neutralState.templates[0].id);
    await neutralEditor
      .getByRole("button", { name: "Save Cartridge artwork", exact: true })
      .click();
    await expect(
      page.getByText("Cartridge artwork saved.", { exact: true }),
    ).toBeVisible();
    await page.goto(`/app/games/${copy.id}`);
    await expect(page.getByText(/Artwork incomplete/)).toBeVisible();
    const neutralViewer = await openModel(page);
    await neutralViewer
      .locator("canvas")
      .screenshot({ path: info.outputPath("neutral-case.png") });
    await neutralViewer
      .getByRole("button", { name: "Close 3D preview", exact: true })
      .click();
    await page.goto(
      `/app/catalog/games/cartridges?releaseId=${catalog.releaseId}`,
    );
  }
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
    has: page.getByRole("heading", { name: "Cartridge", exact: true }),
  });
  const state = await fixture("media-state"),
    templateId = state.templates[0].id;
  expect(state.templates[0].familyKey).toBe("cartridge");
  expect(state.templates[0].metadata.format).toEqual({
    schemaVersion: 1,
    formatKey: "snes-us",
    variant: "Original synthetic study",
  });
  await component
    .getByLabel("Cartridge template", { exact: true })
    .selectOption(templateId);
  const front = component.getByRole("group", {
    name: "FRONT LABEL · Required",
    exact: true,
  });
  const assetId = state.uses[0].assetId;
  await front.getByLabel("Artwork", { exact: true }).selectOption(assetId);
  await front.getByLabel("Crop x", { exact: true }).fill("0.8");
  await component
    .getByRole("button", { name: "Save Cartridge artwork", exact: true })
    .click();
  await expect(component.getByRole("status")).toContainText(
    "Check the template, artwork and crop.",
  );
  await expect(front.getByLabel("Crop x", { exact: true })).toHaveValue("0.8");
  await front.getByLabel("Crop x", { exact: true }).fill("0");
  await component
    .getByRole("button", { name: "Save Cartridge artwork", exact: true })
    .click();
  await expect(
    page.getByText("Cartridge artwork saved.", { exact: true }),
  ).toBeVisible();
  const saved = await fixture("media-state");
  expect(saved.bindings).toHaveLength(1);
  expect(saved.copies[0].hasBox).toBeNull();
  const second = page.locator("form").filter({
    has: page.getByRole("heading", { name: "Second cartridge", exact: true }),
  });
  await second
    .getByLabel("Cartridge template", { exact: true })
    .selectOption(templateId);
  await second.getByLabel("Artwork", { exact: true }).selectOption(assetId);
  await second.getByLabel("Clockwise rotation").selectOption("2");
  await second
    .getByRole("button", { name: "Save Second cartridge artwork", exact: true })
    .click();
  await expect(
    page.getByText("Second cartridge artwork saved.", { exact: true }),
  ).toBeVisible();
  let transfers = 0,
    geometryTransfers = 0;
  const modelId = authored ? state.templates[0].baseModelAssetId : null;
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === `/api/media/private/${assetId}`)
      transfers++;
    if (
      modelId &&
      new URL(r.url()).pathname === `/api/media/private/${modelId}`
    )
      geometryTransfers++;
  });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/app/games/${copy.id}`);
  await expect(
    page.getByText(
      `Synthetic ${formatName} demonstration · SNES US cartridge · Original synthetic study · Synthetic demonstration; not retail measurements`,
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(transfers).toBe(0);
  expect(geometryTransfers).toBe(0);
  const viewer = await openModel(page);
  expect(transfers).toBe(1);
  if (authored) expect(geometryTransfers).toBe(1);
  if (authored)
    await viewer
      .locator("canvas")
      .screenshot({ path: info.outputPath("authored-case-angle.png") });
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
    .getByLabel("Expected component to preview")
    .selectOption({ label: "Second cartridge" });
  await expect(page.locator("canvas")).toHaveCount(0);
  await openModel(page);
  await viewer.getByRole("button", { name: "Front view", exact: true }).click();
  expect((await viewer.locator("canvas").screenshot()).equals(frontImage)).toBe(
    false,
  );
  expect(transfers).toBe(2);
  expect(geometryTransfers).toBe(2);
  await page
    .getByLabel("Expected component to preview")
    .selectOption({ label: "Box" });
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(
    page.getByText("No ready packaging preview is available."),
  ).toBeVisible();
  await page
    .getByLabel("Expected component to preview")
    .selectOption({ label: "Cartridge" });
  await openModel(page);
  expect(transfers).toBe(3);
  expect(geometryTransfers).toBe(3);
  await viewer
    .getByRole("button", { name: "Close 3D preview", exact: true })
    .click();
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(errors).toEqual([]);
  await fixture("update", JSON.stringify({ role: "VIEWER" }));
  await page.goto(
    `/app/catalog/games/cartridges?releaseId=${catalog.releaseId}`,
  );
  await expect(page).toHaveURL(/access-denied/);
  const unauthorized = await context.request.get(
    `/api/media/private/${assetId}`,
  );
  expect(unauthorized.status()).toBe(200);
  await fixture("update", JSON.stringify({ enabled: false }));
  const denied = await context.request.get(`/api/media/private/${assetId}`);
  expect(denied.status()).toBe(403);
  if (modelId)
    expect(
      (await context.request.get(`/api/media/private/${modelId}`)).status(),
    ).toBe(403);
});
