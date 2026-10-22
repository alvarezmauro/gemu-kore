import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import {
  fixture,
  openModel,
  prepareModel,
  signIn,
} from "../helpers/model-browser";
import { monochromePng } from "../helpers/png-fixtures";

test.beforeEach(async () => {
  await fixture("reset-public");
  await fixture("reset-search");
  await fixture("reset");
});
test.afterAll(async () => {
  await fixture("reset-public");
  await fixture("reset-search");
  await fixture("reset");
});

// Each journey opens several real states in both themes. Keep results, including
// incomplete checks requiring human assessment, rather than hiding rule failures.
async function scan(page: Page, info: TestInfo, state: string) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveClass(new RegExp(colorScheme));
    if (
      [
        "console-selection-0",
        "command-results",
        "publication-settings",
        "appearance-menu",
      ].includes(state)
    ) {
      await page.screenshot({
        path: info.outputPath(`${state}-${colorScheme}.png`),
        fullPage: true,
      });
    }
    const result = await new AxeBuilder({ page }).analyze();
    await info.attach(`${state}-${colorScheme}-axe`, {
      body: JSON.stringify(result, null, 2),
      contentType: "application/json",
    });
    expect.soft(result.violations, `${state} / ${colorScheme}`).toEqual([]);
  }
}
async function visit(page: Page, path: string) {
  expect((await page.goto(path))?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}
async function tabTo(page: Page, target: Locator) {
  for (let count = 0; count < 80; count++) {
    if (await target.evaluate((node) => node === document.activeElement))
      return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}
async function trap(page: Page, dialog: Locator) {
  const controls = dialog.locator(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
  );
  await controls.last().focus();
  await page.keyboard.press("Tab");
  await expect(controls.first()).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(controls.last()).toBeFocused();
}

test("@a11y public, authentication and unavailable pages expose named landmarks and readable themes", async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const data = await fixture("seed-public-detail");
  for (const path of [
    "/login",
    "/login?error=provider",
    "/access-denied",
    "/collection",
    "/collection/search",
    "/collection/consoles",
    "/collection/games",
    "/collection/accessories",
    ...["consoles", "games", "accessories"].map(
      (kind, index) => `/collection/${kind}/${data.ids[index]}`,
    ),
  ]) {
    await visit(page, path);
    await expect(page.getByRole("main")).toHaveCount(1);
    if (path === "/collection") {
      await expect(
        page.getByRole("group", { name: "On display", exact: true }),
      ).toBeVisible();
    }
    await scan(page, info, path);
  }
  await fixture(
    "public-policy",
    JSON.stringify({ publicCollectionEnabled: false }),
  );
  expect((await page.goto("/collection"))?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "This collection is currently private.",
  );
  await scan(page, info, "paused-public-collection");
});

test("@a11y private overview, browsing and every copy detail retain accessible structure", async ({
  page,
  context,
}, info) => {
  test.setTimeout(180_000);
  const data = await fixture("seed-public-detail");
  await signIn(context, "ADMIN");
  for (const path of [
    "/app",
    "/app/collection",
    "/app/search",
    ...["consoles", "games", "accessories"].map(
      (kind, index) => `/app/${kind}/${data.ids[index]}`,
    ),
  ]) {
    await visit(page, path);
    if (path === "/app") {
      await expect(
        page.getByRole("group", { name: "Collection overview", exact: true }),
      ).toBeVisible();
    }
    if (path.startsWith("/app/consoles/")) {
      await expect(
        page.getByRole("group", { name: "Copy photos", exact: true }),
      ).toBeVisible();
    }
    await scan(page, info, path);
  }
  await visit(page, "/app/collection");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Quick search" });
  await expect(palette).toBeVisible();
  await scan(page, info, "command-palette");
  const search = palette.getByRole("combobox");
  await expect(search.locator("..")).not.toHaveCSS("box-shadow", "none");
  await search.fill("Super");
  await expect(palette.getByRole("status")).toContainText("catalog");
  await scan(page, info, "command-results");
  await palette
    .getByRole("option")
    .filter({ hasText: "Super Nintendo" })
    .first()
    .click();
  await scan(page, info, "command-preview");
  await palette
    .getByRole("option", { name: "Back to results", exact: true })
    .click();
  await search.fill("no-match-accessibility-audit");
  await expect(palette.getByRole("status")).toContainText(
    "0 copies and 0 catalog matches",
  );
  await expect(palette.getByRole("listbox").getByRole("option")).toHaveCount(0);
  await scan(page, info, "command-empty");
  await page.route("**/api/search/palette", (route) => route.abort("failed"));
  await search.fill("failed request");
  await expect(palette.getByRole("alert")).toContainText("unavailable");
  await scan(page, info, "command-error");
  await page.unroute("**/api/search/palette");
  await trap(page, palette);
  await page.keyboard.press("Escape");
  await expect(palette).toHaveCount(0);
});

test("@a11y catalog create forms and enrichment reviews have named controls and associations", async ({
  page,
  context,
}, info) => {
  test.setTimeout(180_000);
  const data = await fixture("seed-game-creation");
  const actor = await signIn(context, "ADMIN");
  for (const path of [
    "/app/catalog",
    "/app/catalog?kind=company&archived=archived",
    "/app/catalog?kind=company&new=1",
    "/app/catalog?kind=model&new=1",
    "/app/catalog/games?kind=game&new=1",
    "/app/catalog/games?kind=release&new=1",
    "/app/catalog/accessories?kind=accessory&new=1",
    "/app/catalog/accessories?kind=variant&new=1",
    `/app/catalog/games/trailer?kind=game&id=${data.gameId}`,
    `/app/catalog/games/playtime?kind=game&id=${data.gameId}`,
    `/app/catalog/games/screenshots?releaseId=${data.releaseId}`,
    `/app/catalog/games/packaging?releaseId=${data.releaseId}`,
    `/app/catalog/games/cartridges?releaseId=${data.releaseId}`,
  ]) {
    await visit(page, path);
    await scan(page, info, path);
    if (path.includes("/packaging?") || path.includes("/cartridges?")) {
      const name = path.includes("/packaging?")
        ? "Create packaging template"
        : "Create cartridge template";
      await page.getByText(name, { exact: true }).click();
      await scan(page, info, `${name}-expanded`);
    }
  }
  const review = await fixture(
    "seed-enrichment",
    JSON.stringify({ token: actor.token, gameId: data.gameId, prepare: true }),
  );
  await visit(page, `/app/enrichment?runId=${review.id}`);
  await scan(page, info, "enrichment-review");
});

for (const kind of ["console", "game", "accessory"] as const) {
  test(`@a11y ${kind} wizard supports keyboard selection and announces each focused step`, async ({
    page,
    context,
  }, info) => {
    test.setTimeout(180_000);
    await fixture(
      kind === "console"
        ? "seed-console-creation"
        : kind === "game"
          ? "seed-game-creation"
          : "seed-accessory-copies",
    );
    await signIn(context);
    await visit(
      page,
      `/app/${kind === "accessory" ? "accessories" : `${kind}s`}/new`,
    );
    const choices =
      kind === "console"
        ? ["Select PlayStation", "Select SCPH-1000"]
        : kind === "game"
          ? [
              "Select SNES",
              "Select Chrono Trigger (chrono-trigger)",
              "Select Standard Edition (chrono-snes-na)",
            ]
          : ["Select DualShock 2", "Select Black (black)"];
    for (const [index, name] of choices.entries()) {
      await expect(page.getByRole("group", { name: /^Choose / })).toBeVisible();
      await scan(page, info, `${kind}-selection-${index}`);
      const input = page.locator('[data-slot="command-input"]');
      await tabTo(page, input);
      await expect(input.locator("..")).not.toHaveCSS("box-shadow", "none");
      const inputBounds = (await input.boundingBox())!;
      const headerBounds = (await page.locator("header").boundingBox())!;
      expect(inputBounds.y).toBeGreaterThanOrEqual(
        headerBounds.y + headerBounds.height,
      );
      await page.keyboard.press("Home");
      // Traverse the actual active-descendant list rather than clicking a result.
      const option = page.getByRole("option", {
        name: new RegExp(
          `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`,
        ),
      });
      for (let move = 0; move < 30; move++) {
        if ((await option.getAttribute("data-selected")) === "true") break;
        await page.keyboard.press("ArrowDown");
      }
      await expect(option).toHaveAttribute("data-selected", "true");
      await page.keyboard.press("Enter");
      await tabTo(
        page,
        page.getByRole("button", { name: "Continue", exact: true }),
      );
      await page.keyboard.press("Enter");
      await expect(page.locator("h2[tabindex='-1']")).toBeFocused();
    }
    await scan(page, info, `${kind}-physical-fields`);
    await page.getByRole("button", { name: "Add defect", exact: true }).click();
    await scan(page, info, `${kind}-defect-fields`);
    await page.getByLabel(/Defect 1 title/).fill("Existing scratch");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    if (kind === "console") {
      await scan(page, info, "console-files");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
    }
    await expect(
      page.getByRole("heading", { name: "Review", exact: true }),
    ).toBeFocused();
    await scan(page, info, `${kind}-review`);
  });
}

test("@a11y navigation, appearance and location dialogs trap and restore keyboard focus", async ({
  page,
  context,
  isMobile,
}, info) => {
  test.setTimeout(120_000);
  await signIn(context);
  for (const path of ["/app/media", "/app/defects", "/app/locations"]) {
    await visit(page, path);
    await scan(page, info, `${path}-empty`);
  }
  if (isMobile) {
    const trigger = page.getByRole("button", { name: "Open navigation" });
    await tabTo(page, trigger);
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "GemuKore" });
    await scan(page, info, "mobile-navigation");
    await trap(page, dialog);
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  }
  const theme = page.getByRole("button", { name: "Choose theme" });
  await tabTo(page, theme);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  const menuId = await page.getByRole("menu").getAttribute("id");
  expect(menuId).toBeTruthy();
  await expect(theme).toHaveAttribute("aria-controls", menuId!);
  await scan(page, info, "appearance-menu");
  await page.keyboard.press("Escape");
  await expect(theme).toBeFocused();
  const trigger = page.getByRole("button", {
    name: "Add location",
    exact: true,
  });
  await tabTo(page, trigger);
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", {
    name: "Add location",
    exact: true,
  });
  await expect(dialog.getByRole("textbox", { name: /Name/ })).toBeFocused();
  await scan(page, info, "location-form");
  await trap(page, dialog);
  await dialog
    .getByRole("button", { name: "Add location", exact: true })
    .press("Enter");
  await expect(dialog.getByRole("textbox", { name: /Name/ })).toBeFocused();
  expect(
    await dialog
      .getByRole("textbox", { name: /Name/ })
      .evaluate((node: HTMLInputElement) => node.validity.valueMissing),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("@a11y photos and defect dialogs preserve descriptions, keyboard escape and return focus", async ({
  page,
  context,
}, info) => {
  test.setTimeout(120_000);
  const data = await fixture("seed-defect-items");
  await signIn(context);
  await visit(page, `/app/defects?itemId=${data.firstId}`);
  await page.getByRole("button", { name: "Add defect", exact: true }).click();
  await scan(page, info, "defect-dialog");
  await trap(page, page.getByRole("dialog"));
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Add defect", exact: true }),
  ).toBeFocused();
  await visit(page, `/app/media?itemId=${data.firstId}`);
  await scan(page, info, "photo-upload");
  await page.getByLabel("Photo files", { exact: true }).setInputFiles({
    name: "audit.png",
    mimeType: "image/png",
    buffer: monochromePng(120, 80),
  });
  await expect(
    page.getByText("Saved privately", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit photo 1" }).click();
  await scan(page, info, "photo-edit");
  await trap(page, page.getByRole("dialog"));
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Edit photo 1" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "View photo 1" }).press("Enter");
  await scan(page, info, "photo-view");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "View photo 1" }),
  ).toBeFocused();
});

test("@a11y publication decisions expose named reviews and explicit confirmation", async ({
  page,
  context,
}, info) => {
  test.setTimeout(120_000);
  const data = await fixture("seed-public-home");
  await signIn(context, "ADMIN");
  await visit(page, `/app/settings/public?item=${data.privateIds[0]}`);
  await scan(page, info, "publication-settings");
  await page
    .getByRole("button", { name: "Review settings", exact: true })
    .press("Enter");
  await scan(page, info, "settings-review");
  const copy = page.getByRole("region", { name: "Copy publication" });
  await copy
    .getByRole("button", { name: "Review publication", exact: true })
    .press("Enter");
  await scan(page, info, "copy-review");
  await expect(copy.locator("div[tabindex='-1']")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(copy.getByRole("checkbox")).toBeFocused();
  await page.keyboard.press("Space");
  await expect(
    copy.getByRole("button", { name: "Approve reviewed copy" }),
  ).toBeEnabled();
});

test("@a11y 3D remains optional and reduced motion disables rotation without losing controls", async ({
  page,
  context,
}, info) => {
  test.setTimeout(120_000);
  const { viewer } = await prepareModel(page, context);
  await scan(page, info, "static-model");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openModel(page);
  await scan(page, info, "interactive-model");
  await expect(
    viewer.getByRole("button", { name: "Auto rotate", exact: true }),
  ).toBeDisabled();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await viewer
    .getByRole("button", { name: "Auto rotate", exact: true })
    .press("Enter");
  await expect(
    viewer.getByRole("button", { name: "Stop auto rotate", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(
    viewer.getByRole("button", { name: "Auto rotate", exact: true }),
  ).toBeDisabled();
  await viewer
    .getByRole("button", { name: "Close 3D preview", exact: true })
    .press("Enter");
  await expect(
    viewer.getByRole("button", { name: "View in 3D", exact: true }),
  ).toBeFocused();
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.locator("[data-motion-blur]").first()).toHaveCSS(
    "opacity",
    "1",
  );
  await page.screenshot({
    path: info.outputPath("reduced-motion-dark.png"),
    fullPage: true,
  });
});

test("@a11y shared text, control boundaries and focus tokens meet their surface contrast targets", async ({
  page,
  context,
}, info) => {
  await signIn(context);
  await visit(page, "/app/locations");
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveClass(new RegExp(colorScheme));
    const ratios = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const color = (name: string) =>
        style.getPropertyValue(`--${name}`).trim();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d")!;
      const luminance = (css: string) => {
        // Let the browser resolve minified hex, RGB and other CSS color syntax.
        if (!CSS.supports("color", css))
          throw new Error(`Unresolved color: ${css}`);
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = css;
        context.fillRect(0, 0, 1, 1);
        const pixel = context.getImageData(0, 0, 1, 1).data;
        if (pixel[3] !== 255)
          throw new Error(`Contrast token must be opaque: ${css}`);
        const values = Array.from(pixel)
          .slice(0, 3)
          .map((value) => value / 255)
          .map((value) =>
            value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
          );
        return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
      };
      const ratio = (a: string, b: string) => {
        const values = [luminance(color(a)), luminance(color(b))].sort(
          (x, y) => x - y,
        );
        return (values[1] + 0.05) / (values[0] + 0.05);
      };
      const surfaces = [
        "background",
        "card",
        "popover",
        "muted",
        "accent",
        "stone",
      ];
      return [
        ...surfaces.map((surface) => ({
          name: `muted text / ${surface}`,
          actual: ratio("muted-foreground", surface),
          minimum: 4.5,
        })),
        ...surfaces.map((surface) => ({
          name: `focus / ${surface}`,
          actual: ratio("ring", surface),
          minimum: 3,
        })),
        ...["background", "card"].map((surface) => ({
          name: `input boundary / ${surface}`,
          actual: ratio("input", surface),
          minimum: 3,
        })),
      ];
    });
    await info.attach(`${colorScheme}-contrast-ratios`, {
      body: JSON.stringify(ratios, null, 2),
      contentType: "application/json",
    });
    for (const pair of ratios)
      expect(pair.actual, `${colorScheme} ${pair.name}`).toBeGreaterThanOrEqual(
        pair.minimum,
      );
  }
});
