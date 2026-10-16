import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { threeChunks, threeBundleLimits } from "../../scripts/lib/three-bundle";
import { fixture, openModel, prepareModel } from "../helpers/model-browser";
import { modelBenchmark } from "../helpers/model-benchmarks";
import { buildGlb, modelFixture } from "../helpers/model-fixture";
import { monochromePng } from "../helpers/png-fixtures";
import type { ModelProbeSnapshot } from "../helpers/model-performance";
const probe = readFileSync("scripts/three-performance-probe.js", "utf8");
const snapshot = (page: Page) =>
  page.evaluate(() => window.__gemu3dProbe.snapshot());
const frames = (value: ModelProbeSnapshot) =>
  value.contexts.reduce((sum, context) => sum + context.frames, 0);
async function attach(info: TestInfo, name: string, value: unknown) {
  const path = info.outputPath(name);
  await writeFile(
    path,
    JSON.stringify(
      {
        project: info.project.name,
        host: {
          platform: process.platform,
          architecture: process.arch,
          node: process.version,
        },
        evidence: value,
      },
      null,
      2,
    ) + "\n",
  );
  await info.attach(name, { path, contentType: "application/json" });
}
async function settle(page: Page) {
  // Controls damping must reach rest; compare two windows instead of assuming one draw.
  await expect
    .poll(
      async () => {
        const before = frames(await snapshot(page));
        await page.waitForTimeout(500);
        return frames(await snapshot(page)) - before;
      },
      { timeout: 8000 },
    )
    .toBe(0);
}
test.beforeEach(async ({ page }) => {
  await fixture("reset-search");
  await fixture("reset");
  await page.addInitScript(probe);
});
test.afterAll(async () => {
  await fixture("reset-search");
  await fixture("reset");
});
test("keeps renderer chunks, contexts and model transfers out of static grids and inactive detail pages", async ({
  page,
  context,
}, info) => {
  const chunks = await threeChunks();
  const totals = chunks.reduce(
    (sum, c) => ({
      rawBytes: sum.rawBytes + c.rawBytes,
      gzipBytes: sum.gzipBytes + c.gzipBytes,
    }),
    { rawBytes: 0, gzipBytes: 0 },
  );
  expect(totals.rawBytes).toBeLessThanOrEqual(threeBundleLimits.rawBytes);
  expect(totals.gzipBytes).toBeLessThanOrEqual(threeBundleLimits.gzipBytes);
  const requests = new Set<string>();
  page.on("request", (request) =>
    requests.add(new URL(request.url()).pathname),
  );
  const { id, url } = await prepareModel(page, context);
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(chunks.some((chunk) => requests.has(chunk.path))).toBe(false);
  expect(requests.has(url)).toBe(false);
  expect((await snapshot(page)).contexts).toHaveLength(0);
  await page.goto(`/app/media?itemId=${id}`);
  await page.getByLabel("Photo files", { exact: true }).setInputFiles({
    name: "static-preview.png",
    mimeType: "image/png",
    buffer: monochromePng(120, 80),
  });
  await expect(
    page.getByText("Saved privately", { exact: true }),
  ).toBeVisible();
  await page.goto("/app/collection?type=console");
  const image = page
    .getByRole("list", { name: "Search results" })
    .getByRole("img")
    .first();
  await image.scrollIntoViewIfNeeded();
  await expect
    .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(image).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(chunks.some((chunk) => requests.has(chunk.path))).toBe(false);
  expect(requests.has(url)).toBe(false);
  await page.goto(`/app/consoles/${id}`);
  await openModel(page);
  expect(chunks.some((chunk) => requests.has(chunk.path))).toBe(true);
  expect(requests.has(url)).toBe(true);
  await attach(info, "deferred-bundle.json", {
    project: info.project.name,
    chunks,
    totals,
    limits: threeBundleLimits,
    inactiveRendererRequests: 0,
    gridContexts: 0,
  });
});
test("settles to zero idle draws, pauses offscreen and stops rotation on live reduced motion", async ({
  page,
  context,
}, info) => {
  await prepareModel(page, context);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const viewer = await openModel(page),
    stage = viewer.getByRole("img", { name: /^Interactive 3D/ });
  await stage.scrollIntoViewIfNeeded();
  await settle(page);
  const restingPixels = (await snapshot(page)).contexts.find(
    (c) => c.connected && !c.lost,
  )!.pixels;
  let before = frames(await snapshot(page));
  await page.waitForTimeout(500);
  expect(frames(await snapshot(page)) - before).toBe(0);
  await viewer
    .getByRole("button", { name: "Rotate left", exact: true })
    .click();
  await stage.scrollIntoViewIfNeeded();
  await settle(page);
  before = frames(await snapshot(page));
  await page.waitForTimeout(500);
  expect(frames(await snapshot(page)) - before).toBe(0);
  await viewer
    .getByRole("button", { name: "Auto rotate", exact: true })
    .click();
  await stage.scrollIntoViewIfNeeded();
  await expect
    .poll(async () => frames(await snapshot(page)) - before)
    .toBeGreaterThan(2);
  await expect
    .poll(
      async () =>
        (await snapshot(page)).contexts.find((c) => c.connected && !c.lost)!
          .pixels,
    )
    .toBe(restingPixels);
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await expect(viewer.getByRole("status")).toHaveText("3D preview paused");
  await settle(page);
  before = frames(await snapshot(page));
  await page.waitForTimeout(500);
  expect(frames(await snapshot(page)) - before).toBe(0);
  await stage.scrollIntoViewIfNeeded();
  await expect(
    viewer.getByRole("button", { name: "Auto rotate", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await viewer
    .getByRole("button", { name: "Auto rotate", exact: true })
    .click();
  await stage.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(viewer.getByRole("status")).toHaveText("3D preview paused");
  await settle(page);
  before = frames(await snapshot(page));
  await page.waitForTimeout(500);
  expect(frames(await snapshot(page)) - before).toBe(0);
  await page.evaluate(() => {
    Reflect.deleteProperty(document, "visibilityState");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    viewer.getByRole("button", { name: "Auto rotate", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await viewer
    .getByRole("button", { name: "Auto rotate", exact: true })
    .click();
  await stage.scrollIntoViewIfNeeded();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await settle(page);
  before = frames(await snapshot(page));
  await page.waitForTimeout(500);
  expect(frames(await snapshot(page)) - before).toBe(0);
  expect(
    (await snapshot(page)).contexts.find((c) => c.connected && !c.lost)!.pixels,
  ).toBe(restingPixels);
  await attach(info, "idle-rendering.json", {
    project: info.project.name,
    idleFrames: 0,
    offscreenFrames: 0,
    reducedMotionIdleFrames: 0,
    snapshot: await snapshot(page),
  });
});
for (const kind of ["plain", "shiny", "textured"] as const)
  test(`records ${kind} loading, draw cadence and released resources across repeated sessions`, async ({
    page,
    context,
  }, info) => {
    test.setTimeout(60000);
    const model = modelBenchmark(kind);
    const { viewer, url } = await prepareModel(page, context, model.bytes);
    const sessions = [],
      allocations = [];
    const heapSession = await context.newCDPSession(page);
    const heaps: { usedBytes: number; backingBytes: number | null }[] = [];
    let transfers = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === url) transfers++;
    });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    for (let cycle = 0; cycle < (kind === "textured" ? 5 : 2); cycle++) {
      const started = await page.evaluate(() => performance.now());
      await openModel(page);
      const readyMs = (await page.evaluate(() => performance.now())) - started;
      await viewer
        .getByRole("button", { name: "Auto rotate", exact: true })
        .click();
      await viewer
        .getByRole("img", { name: /^Interactive 3D/ })
        .scrollIntoViewIfNeeded();
      await page.waitForTimeout(350); // Allow controls to start before sampling.
      await page.evaluate(() => window.__gemu3dProbe.startSample());
      await page.waitForTimeout(700);
      const cadence = await page.evaluate(() =>
        window.__gemu3dProbe.stopSample(),
      );
      const state = await snapshot(page),
        active = state.contexts.filter((c) => c.connected && !c.lost);
      expect(active).toHaveLength(1);
      expect(active[0].pixels).toBeLessThanOrEqual(2_000_000);
      expect(cadence!.frames).toBeGreaterThan(1);
      allocations.push(
        Object.fromEntries(
          Object.entries(active[0].resources).map(([name, resource]) => [
            name,
            resource.live,
          ]),
        ),
      );
      if (allocations.length > 1)
        for (const [name, count] of Object.entries(allocations.at(-1)!))
          expect(count).toBeLessThanOrEqual(allocations[0][name] + 1);
      sessions.push({ readyMs, cadence, active: active[0] });
      await viewer
        .getByRole("button", { name: "Close 3D preview", exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (await snapshot(page)).contexts.filter((c) => !c.lost).length,
          { timeout: 5000 },
        )
        .toBe(0);
      await expect(page.locator("canvas")).toHaveCount(0);
      await heapSession.send("HeapProfiler.collectGarbage");
      const heap = await heapSession.send("Runtime.getHeapUsage");
      heaps.push({
        usedBytes: heap.usedSize,
        backingBytes: heap.backingStorageSize ?? null,
      });
    }
    // A warm-session drift guard, not an OS/GPU-memory measurement or a reserved-heap limit.
    expect(heaps.at(-1)!.usedBytes - heaps[0].usedBytes).toBeLessThan(
      8 * 1024 * 1024,
    );
    await heapSession.detach();
    expect(transfers).toBe(sessions.length);
    await attach(info, `benchmark-${kind}.json`, {
      project: info.project.name,
      environment:
        "Automated Chromium on the test host; mobile viewport is emulation, not a phone GPU",
      userAgent: await page.evaluate(() => navigator.userAgent),
      model: {
        bytes: model.bytes.length,
        triangles: model.triangles,
        pixels: model.pixels,
      },
      sessions,
      heapsAfterForcedGc: heaps,
      quality: { dpr: 1, adaptiveResolution: false },
      afterClose: await snapshot(page),
    });
  });
test("bounds drawing-buffer resolution after an oversized stage resize", async ({
  page,
  context,
}, info) => {
  await prepareModel(page, context);
  const viewer = await openModel(page),
    stage = viewer.getByRole("img", { name: /^Interactive 3D/ });
  await stage.evaluate((node: HTMLElement) => {
    node.style.width = "4000px";
    node.style.height = "2500px";
    node.style.maxHeight = "none";
  });
  const dimensions = () =>
    viewer.locator("canvas").evaluate((node: HTMLCanvasElement) => ({
      pixels: node.width * node.height,
      width: node.width,
      cssWidth: node.clientWidth,
    }));
  await expect.poll(async () => (await dimensions()).cssWidth).toBe(4000);
  await expect
    .poll(async () => (await dimensions()).width)
    .toBeGreaterThan(1000);
  await expect
    .poll(async () => (await dimensions()).pixels)
    .toBeLessThanOrEqual(2_000_000);
  await attach(info, "drawing-buffer.json", await dimensions());
});
test("keeps the canvas centered inside a height-limited landscape stage and expanded dialog", async ({
  page,
  context,
}, info) => {
  await page.setViewportSize({ width: 393, height: 735 });
  await prepareModel(page, context, modelBenchmark("textured").bytes);
  await page.evaluate(() => {
    Element.prototype.requestFullscreen =
      undefined as unknown as typeof Element.prototype.requestFullscreen;
  });
  const viewer = await openModel(page);
  const layout = () =>
    page.locator("[data-model-stage]").evaluate((node) => {
      const canvas = node.querySelector("canvas")!,
        stage = node.getBoundingClientRect(),
        drawing = canvas.getBoundingClientRect();
      return {
        widthDifference: drawing.width - stage.width,
        heightDifference: drawing.height - stage.height,
        centerXDifference:
          drawing.x + drawing.width / 2 - (stage.x + stage.width / 2),
        centerYDifference:
          drawing.y + drawing.height / 2 - (stage.y + stage.height / 2),
        stage: { width: stage.width, height: stage.height },
        buffer: { width: canvas.width, height: canvas.height },
      };
    });
  async function fitted() {
    await expect
      .poll(async () => {
        const value = await layout();
        return Math.max(
          ...[
            value.widthDifference,
            value.heightDifference,
            value.centerXDifference,
            value.centerYDifference,
          ].map(Math.abs),
        );
      })
      .toBeLessThan(1);
    const value = await layout();
    expect(
      Math.abs(
        value.buffer.width / value.buffer.height -
          value.stage.width / value.stage.height,
      ),
    ).toBeLessThan(0.03);
    return value;
  }
  await fitted();
  await page.setViewportSize({ width: 734, height: 393 });
  const landscape = await fitted();
  expect(landscape.stage.height).toBeLessThanOrEqual(393 * 0.6 + 1);
  await viewer.getByRole("button", { name: "Fullscreen", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Expanded 3D preview" });
  await expect(dialog.getByRole("status")).toHaveText("3D preview ready", {
    timeout: 20000,
  });
  const expandedLandscape = await fitted();
  await dialog
    .getByRole("img", { name: /^Interactive 3D/ })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("expanded-landscape.png") });
  await dialog
    .getByRole("button", { name: "Reset camera", exact: true })
    .click();
  await page.setViewportSize({ width: 393, height: 735 });
  const portrait = await fitted();
  await dialog
    .getByRole("button", { name: "Close 3D preview", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await attach(info, "orientation-layout.json", {
    landscape,
    expandedLandscape,
    portrait,
  });
});
test("keeps a stable drawing buffer during orbit and after damping settles", async ({
  page,
  context,
}, info) => {
  test.setTimeout(60000);
  await prepareModel(page, context, modelBenchmark("textured").bytes);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const viewer = await openModel(page),
    stage = viewer.getByRole("img", { name: /^Interactive 3D/ });
  await stage.scrollIntoViewIfNeeded();
  await settle(page);
  await viewer.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
    canvas.dataset.bufferWrites = "0";
    for (const dimension of ["width", "height"] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(
        HTMLCanvasElement.prototype,
        dimension,
      )!;
      Object.defineProperty(canvas, dimension, {
        configurable: true,
        get() {
          return descriptor.get!.call(this);
        },
        set(value: number) {
          canvas.dataset.bufferWrites = String(
            Number(canvas.dataset.bufferWrites) + 1,
          );
          descriptor.set!.call(this, value);
        },
      });
    }
  });
  const bounds = (await stage.boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width * 0.4,
    bounds.y + bounds.height * 0.5,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width * 0.7,
    bounds.y + bounds.height * 0.6,
    { steps: 30 },
  );
  await page.mouse.up();
  await settle(page);
  await viewer
    .getByRole("button", { name: "Auto rotate", exact: true })
    .click();
  await page.waitForTimeout(1500);
  await viewer
    .getByRole("button", { name: "Stop auto rotate", exact: true })
    .click();
  await settle(page);
  const before = frames(await snapshot(page));
  await page.waitForTimeout(4000);
  const idleFrames = frames(await snapshot(page)) - before;
  expect(idleFrames).toBe(0);
  expect(
    await viewer.locator("canvas").getAttribute("data-buffer-writes"),
  ).toBe("0");
  await attach(info, "stable-drawing-buffer.json", {
    bufferWrites: 0,
    idleFrames,
    idleWindowMs: 4000,
  });
});
test("shows bounded download progress and cancels a slow private transfer", async ({
  page,
  context,
}, info) => {
  const original = modelFixture(),
    binary = Buffer.concat([original.binary, Buffer.alloc(128 * 1024)]);
  const bytes = buildGlb(
    { ...original.document, buffers: [{ byteLength: binary.length }] },
    binary,
  );
  const { viewer } = await prepareModel(page, context, bytes);
  await openModel(page); // Warm only the JS chunks; every subsequent GLB request remains no-store.
  await viewer
    .getByRole("button", { name: "Close 3D preview", exact: true })
    .click();
  const session = await context.newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 100,
    downloadThroughput: 64 * 1024,
    uploadThroughput: -1,
  });
  await viewer.getByRole("button", { name: "View in 3D", exact: true }).click();
  const progress = viewer.getByRole("progressbar", {
    name: "Downloading 3D model",
  });
  await expect(progress).toBeVisible();
  await expect
    .poll(() => progress.evaluate((node: HTMLProgressElement) => node.value))
    .toBeGreaterThan(0);
  expect(
    await progress.evaluate((node: HTMLProgressElement) => node.value),
  ).toBeLessThan(100);
  await expect(page.locator("canvas")).toHaveCount(0);
  await viewer
    .getByRole("button", { name: "Close 3D preview", exact: true })
    .click();
  await expect(progress).toHaveCount(0);
  await expect(viewer).toHaveAttribute("aria-busy", "false");
  await expect(
    page.getByRole("heading", { name: "My copy", exact: true }),
  ).toBeVisible();
  await session.detach();
  await attach(info, "loading-states.json", {
    boundedProgress: true,
    cancelDuringTransfer: true,
    modelBytes: bytes.length,
    throttleBytesPerSecond: 64 * 1024,
  });
});
test("disposes a late texture decode after close without resurrecting the stage", async ({
  page,
  context,
}, info) => {
  const { viewer } = await prepareModel(
    page,
    context,
    modelBenchmark("textured").bytes,
  );
  await page.evaluate(() => {
    const original = window.createImageBitmap,
      close = ImageBitmap.prototype.close;
    ImageBitmap.prototype.close = function () {
      document.documentElement.dataset.lateBitmapClosed = String(
        Number(document.documentElement.dataset.lateBitmapClosed ?? 0) + 1,
      );
      close.call(this);
    };
    window.createImageBitmap = new Proxy(original, {
      apply(target, scope, args) {
        return Reflect.apply(target, scope, args).then(
          (bitmap: ImageBitmap) =>
            new Promise<ImageBitmap>((resolve) => {
              document.documentElement.dataset.lateBitmapReady = "true";
              window.addEventListener(
                "gemu:release-bitmap",
                () => {
                  window.createImageBitmap = original;
                  resolve(bitmap);
                },
                { once: true },
              );
            }),
        );
      },
    });
  });
  await viewer.getByRole("button", { name: "View in 3D", exact: true }).click();
  await expect(viewer.getByRole("status")).toHaveText("Preparing 3D model…", {
    timeout: 20000,
  });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.dataset.lateBitmapReady),
    )
    .toBe("true");
  await expect(viewer.getByRole("progressbar")).toHaveCount(0);
  await viewer
    .getByRole("button", { name: "Close 3D preview", exact: true })
    .click();
  await page.evaluate(() =>
    window.dispatchEvent(new Event("gemu:release-bitmap")),
  );
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.dataset.lateBitmapClosed),
    )
    .toBe("1");
  await expect(page.locator("canvas")).toHaveCount(0);
  expect((await snapshot(page)).contexts).toHaveLength(0);
  await openModel(page);
  await attach(info, "late-decoder.json", {
    closedLateBitmaps: 1,
    resurrectedContexts: 0,
    explicitRetry: true,
  });
});
