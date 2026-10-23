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

test.describe.configure({ timeout: 60_000 });

test.beforeEach(async () => {
  await fixture("reset-public");
  await fixture("reset-game-creation");
  await fixture("reset");
});
test.afterAll(async () => {
  await fixture("reset-public");
  await fixture("reset-game-creation");
  await fixture("reset");
});

async function fits(page: Page, info: TestInfo, state: string) {
  // Sheet entry intentionally travels from the edge. Check its settled layout.
  await page.getByRole("dialog").evaluateAll(async (nodes) => {
    await Promise.all(
      nodes.flatMap((node) =>
        node
          .getAnimations()
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );
  });
  const overflow = await page.evaluate(() => {
    const width = innerWidth;
    return [...document.querySelectorAll("main *, [role=dialog] *")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          rect.width > 0 &&
          style.position !== "absolute" &&
          style.position !== "fixed" &&
          style.visibility !== "hidden" &&
          (rect.right > width + 1 || rect.left < -1)
        );
      })
      .map(
        (element) =>
          `${element.tagName}: ${element.textContent?.slice(0, 100)}`,
      );
  });
  expect(overflow, state).toEqual([]);
  expect(
    await page
      .getByRole("dialog")
      .evaluateAll((nodes) =>
        nodes
          .filter((node) => node.scrollWidth > node.clientWidth + 1)
          .map((node) => node.getAttribute("aria-labelledby")),
      ),
    "Dialogs have no clipped horizontal content",
  ).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  const smallFields = await page
    .locator(
      "main input:not([type=file]):not([type=checkbox]):not([type=radio]):not([type=hidden]), main select, main textarea, [role=dialog] input:not([type=file]):not([type=checkbox]):not([type=radio]), [role=dialog] select, [role=dialog] textarea",
    )
    .evaluateAll((fields) =>
      fields
        .filter(
          (field) =>
            field.getBoundingClientRect().height > 0 &&
            parseFloat(getComputedStyle(field).fontSize) < 16,
        )
        .map((field) => field.id || field.getAttribute("aria-label")),
    );
  expect(smallFields, "Editable mobile fields use at least 16px text").toEqual(
    [],
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath(`${state}.png`),
    fullPage: true,
  });
}
async function tap(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  const bounds = await control.boundingBox();
  expect(bounds?.height).toBeGreaterThanOrEqual(44);
  expect(bounds?.width).toBeGreaterThanOrEqual(44);
  await control.tap();
}
// Observe the first rendered frame as well as the rest of the dialog entrance;
// waiting for actionability alone would miss a temporary centering regression.
async function openMeasuredDialog(page: Page, trigger: Locator) {
  const entry = await page.evaluateHandle(() => {
    const result = {
      done: false,
      frames: [] as {
        left: number;
        right: number;
        top: number;
        bottom: number;
        width: number;
        height: number;
      }[],
    };
    const observer = new MutationObserver(() => {
      const dialog = document.querySelector('[data-slot="dialog-content"]');
      if (!dialog) return;
      observer.disconnect();
      const end = performance.now() + 300;
      const sample = () => {
        const bounds = dialog.getBoundingClientRect();
        result.frames.push({
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
          bottom: bounds.bottom,
          width: innerWidth,
          height: innerHeight,
        });
        if (performance.now() < end) requestAnimationFrame(sample);
        else result.done = true;
      };
      sample();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return result;
  });
  await tap(trigger);
  await expect.poll(() => entry.evaluate((value) => value.done)).toBe(true);
  const frames = await entry.evaluate((value) => value.frames);
  await entry.dispose();
  expect(frames.length).toBeGreaterThan(1);
  for (const frame of frames) {
    expect(frame.left).toBeGreaterThanOrEqual(15);
    expect(frame.right).toBeLessThanOrEqual(frame.width - 15);
    expect(frame.top).toBeGreaterThanOrEqual(15);
    expect(frame.bottom).toBeLessThanOrEqual(frame.height - 15);
  }
}
const next = (page: Page) =>
  tap(page.getByRole("button", { name: "Continue", exact: true }));
const photo = {
  name: "phone-photo.png",
  mimeType: "image/png",
  buffer: monochromePng(120, 80),
};

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme });
    test("@mobile console creation works by touch at 320px with camera selection, review and private save", async ({
      page,
      context,
    }, info) => {
      await page.setViewportSize({ width: 320, height: 740 });
      const data = await fixture("seed-console-creation");
      await signIn(context);
      await page.goto("/app/collection");
      await tap(page.getByRole("link", { name: "Add console", exact: true }));
      await fits(page, info, "console-platform");
      await tap(
        page.getByRole("option", { name: /^Select PlayStation(?:\s|$)/ }),
      );
      await next(page);
      await tap(
        page.getByRole("option", { name: /^Select SCPH-1000(?:\s|$)/ }),
      );
      await next(page);
      await page
        .getByLabel("Serial number", { exact: true })
        .fill("PHONE-CONSOLE");
      await page
        .getByLabel("Location", { exact: true })
        .selectOption(data.shelfId);
      await page
        .getByLabel("Private notes", { exact: true })
        .fill("A".repeat(300));
      await fits(page, info, "console-physical");
      await next(page);
      await expect(
        page.getByLabel("Take a photo", { exact: true }),
      ).toHaveAttribute("capture", "environment");
      await expect(
        page.getByLabel("Choose photos", { exact: true }),
      ).not.toHaveAttribute("capture");
      await page
        .getByLabel("Take a photo", { exact: true })
        .setInputFiles(photo);
      await expect(
        page.getByRole("img", { name: "Selected file: phone-photo.png" }),
      ).toBeVisible();
      expect(await fixture("asset-count")).toBe(0);
      const filename = page
        .getByRole("list", { name: "Selected files", exact: true })
        .getByText(photo.name, { exact: true });
      expect((await filename.boundingBox())!.width).toBeGreaterThanOrEqual(160);
      await fits(page, info, "console-camera");
      await next(page);
      await fits(page, info, "console-overrides");
      await next(page);
      await fits(page, info, "console-review");
      await tap(page.getByRole("button", { name: "Back", exact: true }));
      await next(page);
      await tap(
        page.getByRole("button", { name: "Save console", exact: true }),
      );
      await expect(
        page.getByText("Saved privately", { exact: true }),
      ).toBeVisible();
      expect(await fixture("console-creation-state")).toMatchObject([
        {
          publicationStatus: "PRIVATE",
          serialNumber: "PHONE-CONSOLE",
          ownedConsole: { consoleModelId: data.modelId },
          media: [{ publicApproved: false, type: "PHOTO" }],
        },
      ]);
      await fits(page, info, "console-saved");
    });

    test("@mobile game creation preserves details across orientation, Back and validation before saving", async ({
      page,
      context,
    }, info) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const data = await fixture("seed-game-creation");
      await signIn(context);
      await page.goto("/app/collection");
      await tap(page.getByRole("link", { name: "Add game", exact: true }));
      await next(page);
      await expect(page.getByRole("main").getByRole("alert")).toContainText(
        "Choose a platform",
      );
      await tap(page.getByRole("option", { name: /^Select SNES(?:\s|$)/ }));
      await next(page);
      await tap(
        page.getByRole("option", {
          name: /^Select Chrono Trigger \(chrono-trigger\)(?:\s|$)/,
        }),
      );
      await next(page);
      await fits(page, info, "game-release");
      await tap(
        page.getByRole("option", {
          name: /^Select Standard Edition \(chrono-snes-na\)(?:\s|$)/,
        }),
      );
      await next(page);
      await page
        .getByLabel("Serial number", { exact: true })
        .fill("PHONE-GAME");
      await page
        .getByLabel("Private notes", { exact: true })
        .fill("Photos from my phone");
      await tap(page.getByRole("button", { name: "Add defect", exact: true }));
      await page.getByLabel(/Defect 1 title/).fill("Worn label");
      await page
        .getByLabel("Take a photo", { exact: true })
        .setInputFiles(photo);
      await page.setViewportSize({ width: 740, height: 360 });
      await fits(page, info, "game-landscape");
      await next(page);
      await tap(page.getByRole("button", { name: "Back", exact: true }));
      await expect(
        page.getByLabel("Serial number", { exact: true }),
      ).toHaveValue("PHONE-GAME");
      await expect(page.getByLabel(/Defect 1 title/)).toHaveValue("Worn label");
      await page.setViewportSize({ width: 320, height: 740 });
      await next(page);
      await fits(page, info, "game-review");
      await tap(page.getByRole("button", { name: "Save game", exact: true }));
      await expect(
        page.getByText("Saved privately", { exact: true }),
      ).toBeVisible();
      expect(await fixture("game-creation-state")).toMatchObject([
        {
          publicationStatus: "PRIVATE",
          serialNumber: "PHONE-GAME",
          ownedGame: { gameReleaseId: data.releaseId },
          defects: [{ title: "Worn label" }],
          media: [{ publicApproved: false }],
        },
      ]);
      await fits(page, info, "game-saved");
    });

    test("@mobile filters stay usable at phone and tablet widths and restore results through history", async ({
      page,
      context,
    }, info) => {
      const data = await fixture("seed-filters");
      await signIn(context, "VIEWER");
      await page.setViewportSize({ width: 320, height: 740 });
      await page.goto(
        "/app/search?type=game&platform=snes&region=japan&hasBox=true",
      );
      const filters = page.getByRole("region", { name: "Collection filters" });
      const results = page.getByRole("list", {
        name: "Search results",
        exact: true,
      });
      await expect(results.getByRole("listitem")).toHaveCount(1);
      await expect(results).toContainText(data.firstId.slice(0, 8));
      await tap(filters.locator("summary"));
      await fits(page, info, "filters-expanded");
      await filters.getByLabel("Box", { exact: true }).selectOption("false");
      await expect(page).toHaveURL(/hasBox=false/);
      await expect(results).toContainText(data.secondId.slice(0, 8));
      await expect(results.getByRole("listitem")).toHaveCount(1);
      await page.goBack();
      await expect(filters.getByLabel("Box", { exact: true })).toHaveValue(
        "true",
      );
      await expect(results).toContainText(data.firstId.slice(0, 8));
      await page.reload();
      await expect(results.getByRole("listitem")).toHaveCount(1);
      await tap(
        page.getByRole("button", { name: "Remove Region", exact: true }),
      );
      await expect(page).not.toHaveURL(/region=/);
      await page.setViewportSize({ width: 768, height: 1024 });
      await fits(page, info, "filters-tablet");
      await tap(
        filters.getByRole("button", { name: "Clear filters", exact: true }),
      );
      await expect(page).toHaveURL(/\/app\/search$/);
    });

    test("@mobile camera uploads and photo dialogs remain reachable in a short viewport", async ({
      page,
      context,
    }, info) => {
      const { firstId } = await fixture("seed-defect-items");
      await signIn(context);
      await page.setViewportSize({ width: 320, height: 480 });
      await page.goto(`/app/media?itemId=${firstId}`);
      const chooser = page.waitForEvent("filechooser");
      await tap(
        page.getByRole("button", { name: "Take a photo", exact: true }),
      );
      const camera = await chooser;
      expect(await camera.element().getAttribute("capture")).toBe(
        "environment",
      );
      await camera.setFiles(photo);
      await expect(
        page.getByText("Saved privately", { exact: true }),
      ).toBeVisible();
      await fits(page, info, "camera-saved");
      await openMeasuredDialog(
        page,
        page.getByRole("button", { name: "Edit photo 1", exact: true }),
      );
      const dialog = page.getByRole("dialog", {
        name: "Edit photo",
        exact: true,
      });
      const caption = "Camera caption " + "long".repeat(50);
      await page.getByLabel("Caption", { exact: true }).fill(caption);
      await page
        .getByLabel("Image description", { exact: true })
        .fill("Front of my physical copy");
      await fits(page, info, "photo-dialog-short");
      await tap(
        dialog.getByRole("button", { name: "Save photo", exact: true }),
      );
      await expect(dialog).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Edit photo 1", exact: true }),
      ).toBeFocused();
      await expect(
        page
          .getByRole("list", { name: "Photo gallery", exact: true })
          .getByText(caption, { exact: true }),
      ).toBeVisible();
      await tap(
        page.getByRole("button", { name: "View photo 1", exact: true }),
      );
      await expect(
        page
          .getByRole("dialog")
          .getByText(`Photo · ${caption}`, { exact: true }),
      ).toBeVisible();
      await fits(page, info, "photo-dialog-view");
      await tap(page.getByRole("button", { name: "Close photo", exact: true }));
      await tap(
        page.getByRole("button", { name: "Remove photo 1", exact: true }),
      );
      await tap(page.getByRole("button", { name: "Cancel", exact: true }));
      expect(await fixture("media-records", firstId)).toMatchObject([
        { publicApproved: false },
      ]);
    });

    test("@mobile navigation scrolls to the final destination in landscape and survives desktop resizing", async ({
      page,
      context,
    }, info) => {
      await signIn(context, "ADMIN");
      await page.goto("/app");
      for (const viewport of [
        { width: 320, height: 480 },
        { width: 740, height: 360 },
        { width: 768, height: 1024 },
      ]) {
        await page.goto("/app");
        await page.setViewportSize(viewport);
        await tap(
          page.getByRole("button", { name: "Open navigation", exact: true }),
        );
        const dialog = page.getByRole("dialog", {
          name: "GemuKore",
          exact: true,
        });
        await fits(page, info, `navigation-${viewport.width}`);
        await tap(dialog.getByRole("link").last());
        await expect(dialog).toHaveCount(0);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      }
      await page.goto("/app");
      await tap(
        page.getByRole("button", { name: "Open navigation", exact: true }),
      );
      await page.setViewportSize({ width: 1280, height: 800 });
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByRole("main")).toBeFocused();
      await page.setViewportSize({ width: 320, height: 740 });
      await tap(
        page.getByRole("button", { name: "Open navigation", exact: true }),
      );
      await tap(page.getByRole("button", { name: "Close", exact: true }));
    });

    test("@mobile real touch orbit and pinch change the model while reset, expansion and page scroll remain usable", async ({
      page,
      context,
    }, info) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const { viewer } = await prepareModel(page, context);
      await openModel(page);
      const stage = viewer.getByRole("img", { name: /^Interactive 3D/ });
      await stage.scrollIntoViewIfNeeded();
      const box = (await stage.boundingBox())!;
      const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const capture = () =>
        stage.screenshot({
          style: "[data-model-stage] { box-shadow: none !important; }",
        });
      const initial = await capture();
      const session = await context.newCDPSession(page);
      async function gesture(pinch: boolean) {
        const points = (amount: number) =>
          pinch
            ? [
                { id: 1, x: center.x - 25 - amount, y: center.y },
                { id: 2, x: center.x + 25 + amount, y: center.y },
              ]
            : [{ id: 1, x: center.x + amount, y: center.y }];
        await session.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: points(0),
        });
        for (let index = 1; index <= 8; index++)
          await session.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: points(index * 5),
          });
        await session.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
      }
      await gesture(false);
      await expect
        .poll(async () => (await capture()).equals(initial))
        .toBe(false);
      await tap(
        viewer.getByRole("button", { name: "Reset camera", exact: true }),
      );
      await stage.scrollIntoViewIfNeeded();
      await expect
        .poll(async () => (await capture()).equals(initial))
        .toBe(true);
      await gesture(true);
      await expect
        .poll(async () => (await capture()).equals(initial))
        .toBe(false);
      await page.evaluate(() => window.scrollTo(0, 0));
      const gutter = page.viewportSize()!.width - 8;
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: gutter, y: 700 }],
      });
      for (let index = 1; index <= 8; index++)
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: gutter, y: 700 - index * 40 }],
        });
      await session.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
      await session.detach();
      await fits(page, info, "model-touch");
      await page.evaluate(() => {
        Element.prototype.requestFullscreen =
          undefined as unknown as typeof Element.prototype.requestFullscreen;
      });
      await tap(
        viewer.getByRole("button", { name: "Fullscreen", exact: true }),
      );
      const expanded = page.getByRole("dialog", {
        name: "Expanded 3D preview",
        exact: true,
      });
      await expect(expanded.getByRole("status")).toHaveText(
        "3D preview ready",
        {
          timeout: 20000,
        },
      );
      await page.setViewportSize({ width: 740, height: 360 });
      await fits(page, info, "model-expanded-landscape");
      await tap(expanded.getByRole("button", { name: "Close", exact: true }));
      await expect(page.locator("canvas")).toHaveCount(0);
      await expect(
        viewer.getByRole("button", { name: "View in 3D", exact: true }),
      ).toBeFocused();
    });
  });
}
