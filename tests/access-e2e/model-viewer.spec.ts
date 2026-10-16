import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type Locator,
} from "@playwright/test";
import { signedSessionCookie } from "../helpers/access-session";
import { buildGlb, modelFixture } from "../helpers/model-fixture";
import { monochromePng } from "../helpers/png-fixtures";
const exec = promisify(execFile);
// Keep keyboard focus decoration from changing image comparisons of the same camera.
const capture = (canvas: Locator) =>
  canvas.screenshot({ style: '[role="img"] { box-shadow: none !important; }' });
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
  role: "EDITOR" | "VIEWER" = "EDITOR",
) {
  const identity = await fixture("sign-in", JSON.stringify({ role }));
  await context.addCookies([
    {
      name: "__Secure-gemukore.session_token",
      value: signedSessionCookie(
        identity.token,
        process.env.BETTER_AUTH_SECRET!,
      ),
      url: "https://127.0.0.1:3111",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  return identity;
}
async function prepare(
  page: Page,
  context: BrowserContext,
  bytes = modelFixture().bytes,
) {
  const identity = await signIn(context);
  const { modelId } = await fixture("seed-console-creation");
  const { id } = await fixture("seed-console-copies", modelId);
  await page.goto(`/app/consoles/${id}`);
  await page.getByLabel("File purpose").selectOption("CUSTOM_MODEL");
  await page.getByLabel("Choose override file", { exact: true }).setInputFiles({
    name: "synthetic-console.glb",
    mimeType: "model/gltf-binary",
    buffer: bytes,
  });
  await page.getByRole("button", { name: "Upload file", exact: true }).click();
  const model = page
    .getByRole("list", { name: "Copy overrides" })
    .getByRole("listitem")
    .filter({ hasText: "synthetic-console.glb" });
  await expect(model).toBeVisible({ timeout: 20000 });
  await model
    .getByRole("button", { name: "Use for this copy", exact: true })
    .click();
  const viewer = page.getByRole("region", { name: "3D preview", exact: true });
  await expect(viewer).toBeVisible();
  const url = (await page
    .getByRole("link", { name: "Download 3D file", exact: true })
    .getAttribute("href"))!;
  return { viewer, url, id, identity };
}
async function open(page: Page) {
  const viewer = page.getByRole("region", { name: "3D preview", exact: true });
  await viewer.getByRole("button", { name: "View in 3D", exact: true }).click();
  await expect(viewer.getByRole("status")).toHaveText("3D preview ready", {
    timeout: 20000,
  });
  return viewer;
}
test.beforeEach(async () => {
  await fixture("reset-search");
  await fixture("reset");
});
test.afterAll(async () => {
  await fixture("reset-search");
  await fixture("reset");
});
test("loads only on activation, renders private GLB and supports orbit/zoom/reset/keyboard, close and fresh reopen", async ({
  page,
  context,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { viewer, url } = await prepare(page, context);
  let transfers = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === url) transfers++;
  });
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(transfers).toBe(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  expect(transfers).toBe(1);
  await expect(page.locator("canvas")).toHaveCount(1);
  const canvas = viewer.locator("canvas");
  const initial = await capture(canvas);
  await viewer
    .getByRole("button", { name: "Rotate left", exact: true })
    .click();
  expect((await capture(canvas)).equals(initial)).toBe(false);
  await viewer
    .getByRole("button", { name: "Reset camera", exact: true })
    .click();
  await expect
    .poll(async () => (await capture(canvas)).equals(initial))
    .toBe(true);
  await viewer.getByRole("button", { name: "Zoom in", exact: true }).click();
  expect((await capture(canvas)).equals(initial)).toBe(false);
  await viewer.getByRole("img", { name: /^Interactive 3D/ }).focus();
  await page.keyboard.press("Home");
  await expect
    .poll(async () => (await capture(canvas)).equals(initial))
    .toBe(true);
  await page.keyboard.press("ArrowRight");
  expect((await capture(canvas)).equals(initial)).toBe(false);
  await expect(
    viewer.getByRole("button", { name: "Auto rotate", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("model-viewer.png"),
    fullPage: true,
  });
  await viewer
    .getByRole("button", { name: "Close 3D preview", exact: true })
    .click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(
    viewer.getByRole("button", { name: "View in 3D", exact: true }),
  ).toBeFocused();
  await open(page);
  expect(transfers).toBe(2);
  expect(errors).toEqual([]);
});
test("honors live reduced motion and expands through an accessible dialog when native fullscreen is unavailable", async ({
  page,
  context,
}) => {
  await prepare(page, context);
  await page.evaluate(() => {
    Element.prototype.requestFullscreen =
      undefined as unknown as typeof Element.prototype.requestFullscreen;
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const viewer = await open(page);
  await viewer
    .getByRole("button", { name: "Auto rotate", exact: true })
    .click();
  await expect(
    viewer.getByRole("button", { name: "Stop auto rotate", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(
    viewer.getByRole("button", { name: "Auto rotate", exact: true }),
  ).toBeDisabled();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(
    viewer.getByRole("button", { name: "Auto rotate", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await viewer.getByRole("button", { name: "Fullscreen", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Expanded 3D preview" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("status")).toHaveText("3D preview ready", {
    timeout: 20000,
  });
  await expect(page.locator("canvas")).toHaveCount(1);
  expect(
    await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(
    viewer.getByRole("button", { name: "View in 3D", exact: true }),
  ).toBeFocused();
});
test("retains a download/static fallback for an unsupported model", async ({
  page,
  context,
}) => {
  const fixtureModel = modelFixture();
  const bytes = buildGlb(
    { ...fixtureModel.document, extensionsUsed: ["KHR_materials_clearcoat"] },
    fixtureModel.binary,
  );
  const { viewer, url } = await prepare(page, context, bytes);
  await viewer.getByRole("button", { name: "View in 3D", exact: true }).click();
  await expect(viewer.getByRole("alert")).toContainText("cannot be previewed", {
    timeout: 20000,
  });
  await expect(viewer.getByText("Static preview unavailable")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  expect((await context.request.get(url)).ok()).toBe(true);
});
test("cancels a pending transfer on close, retries privately and rejects a revoked session", async ({
  page,
  context,
}) => {
  const { viewer, url, identity } = await prepare(page, context);
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested!: () => void;
  const arrived = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await page.route(`**${url}`, async (route) => {
    requested();
    await blocked;
    await route.continue().catch(() => {});
  });
  await viewer.getByRole("button", { name: "View in 3D", exact: true }).click();
  await arrived;
  await viewer
    .getByRole("button", { name: "Close 3D preview", exact: true })
    .click();
  release();
  await page.unroute(`**${url}`);
  await expect(page.locator("canvas")).toHaveCount(0);
  await open(page);
  await viewer
    .getByRole("button", { name: "Close 3D preview", exact: true })
    .click();
  await fixture("revoke", identity.email);
  await viewer.getByRole("button", { name: "View in 3D", exact: true }).click();
  await expect(viewer.getByRole("alert")).toContainText(
    /access|sign in|approved/i,
  );
  await expect(page.locator("canvas")).toHaveCount(0);
  expect((await context.request.get(url)).ok()).toBe(false);
});
test("falls back when WebGL cannot create a context without breaking console details", async ({
  page,
  context,
}) => {
  const { viewer } = await prepare(page, context);
  await page.evaluate(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (
        type === "webgl2" ||
        type === "webgl" ||
        type === "experimental-webgl"
      )
        return null;
      return Reflect.apply(getContext, this, [type, ...args]);
    } as typeof getContext;
  });
  await viewer.getByRole("button", { name: "View in 3D", exact: true }).click();
  await expect(viewer.getByRole("alert")).toContainText(
    /unavailable on this device/,
    { timeout: 20000 },
  );
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "My copy", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download 3D file", exact: true }),
  ).toBeVisible();
});
test("supports pointer/touch gestures, responsive resize and native fullscreen or its dialog fallback", async ({
  page,
  context,
}, info) => {
  await prepare(page, context);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const viewer = await open(page);
  const stage = viewer.getByRole("img", { name: /^Interactive 3D/ });
  const canvas = viewer.locator("canvas");
  await stage.scrollIntoViewIfNeeded();
  const initial = await capture(canvas);
  const bounds = (await stage.boundingBox())!;
  const x = bounds.x + bounds.width / 2,
    y = bounds.y + bounds.height / 2;
  if (info.project.name.includes("mobile")) {
    const session = await context.newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y, id: 1 }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + 45, y: y + 10, id: 1 }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    expect((await capture(canvas)).equals(initial)).toBe(false);
    const rotated = await capture(canvas);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: x - 25, y, id: 1 },
        { x: x + 25, y, id: 2 },
      ],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: x - 65, y, id: 1 },
        { x: x + 65, y, id: 2 },
      ],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    expect((await capture(canvas)).equals(rotated)).toBe(false);
    await session.detach();
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 80, y + 20, { steps: 5 });
    await page.mouse.up();
    expect((await capture(canvas)).equals(initial)).toBe(false);
  }
  await page.setViewportSize({ width: 320, height: 720 });
  await expect(viewer.getByRole("status")).toHaveText("3D preview ready");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const dimensions = await canvas.evaluate((node: HTMLCanvasElement) => ({
    width: node.width,
    height: node.height,
  }));
  expect(dimensions.width * dimensions.height).toBeLessThanOrEqual(2_000_000);
  await viewer.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect
    .poll(
      async () =>
        Boolean(await page.evaluate(() => document.fullscreenElement)) ||
        (await page.getByRole("dialog").isVisible()),
    )
    .toBe(true);
  await expect(page.locator("canvas")).toHaveCount(1);
  const exit = page.getByRole("button", {
    name: "Exit fullscreen",
    exact: true,
  });
  if (await exit.isVisible()) await exit.click();
  else await page.keyboard.press("Escape");
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === null))
    .toBe(true);
});
test("releases the stage after graphics context loss and keeps an explicit retry", async ({
  page,
  context,
}) => {
  await prepare(page, context);
  const viewer = await open(page);
  await viewer.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
    canvas
      .getContext("webgl2")!
      .getExtension("WEBGL_lose_context")!
      .loseContext();
  });
  await expect(viewer.getByRole("alert")).toContainText(
    "display was interrupted",
  );
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(
    viewer.getByRole("button", { name: "Try 3D again", exact: true }),
  ).toBeVisible();
});

test("decodes an embedded private texture and closes its ImageBitmap on every session", async ({
  page,
  context,
}) => {
  const original = modelFixture();
  const uv = Buffer.from(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]).buffer);
  const image = monochromePng(16, 16);
  const imageOffset = original.binary.length + uv.length;
  const binary = Buffer.concat([original.binary, uv, image]);
  const glbDocument = {
    ...original.document,
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      ...original.document.bufferViews,
      { buffer: 0, byteOffset: original.binary.length, byteLength: uv.length },
      { buffer: 0, byteOffset: imageOffset, byteLength: image.length },
    ],
    accessors: [
      ...original.document.accessors,
      { bufferView: 2, componentType: 5126, count: 4, type: "VEC2" },
    ],
    images: [{ bufferView: 3, mimeType: "image/png" }],
    textures: [{ source: 0 }],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          metallicFactor: 0,
          roughnessFactor: 0.5,
        },
      },
    ],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0, TEXCOORD_0: 2 },
            indices: 1,
            material: 0,
          },
        ],
      },
    ],
  };
  const { viewer } = await prepare(
    page,
    context,
    buildGlb(glbDocument, binary),
  );
  await page.evaluate(() => {
    const counts = { created: 0, closed: 0 };
    const report = () => {
      document.documentElement.dataset.bitmaps = JSON.stringify(counts);
    };
    const close = ImageBitmap.prototype.close;
    ImageBitmap.prototype.close = function () {
      counts.closed++;
      report();
      close.call(this);
    };
    window.createImageBitmap = new Proxy(window.createImageBitmap, {
      apply(target, scope, args) {
        return Reflect.apply(target, scope, args).then(
          (bitmap: ImageBitmap) => {
            counts.created++;
            report();
            return bitmap;
          },
        );
      },
    });
    report();
  });
  for (let count = 1; count <= 2; count++) {
    await open(page);
    const counts = () =>
      page.evaluate(() =>
        JSON.parse(document.documentElement.dataset.bitmaps!),
      );
    expect(await counts()).toEqual({ created: count, closed: count - 1 });
    await viewer
      .getByRole("button", { name: "Close 3D preview", exact: true })
      .click();
    await expect.poll(counts).toEqual({ created: count, closed: count });
    await expect(page.locator("canvas")).toHaveCount(0);
  }
});
