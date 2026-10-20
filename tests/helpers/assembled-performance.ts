import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { expect, type Page, type TestInfo } from "@playwright/test";
import type { ModelProbeSnapshot } from "./model-performance";

type ArtworkSnapshot = {
  decoded: number;
  closed: number;
  composites: { width: number; height: number }[];
};
declare global {
  interface Window {
    __gemuArtworkProbe: { snapshot: () => ArtworkSnapshot };
  }
}
export async function installAssembledProbe(page: Page) {
  await page.addInitScript(
    readFileSync("scripts/three-performance-probe.js", "utf8"),
  );
  await page.addInitScript(() => {
    let decoded = 0,
      closed = 0;
    const retired = new WeakSet<ImageBitmap>();
    // Weak references let the probe observe cleanup without retaining canvases.
    const canvases: WeakRef<HTMLCanvasElement>[] = [],
      seen = new WeakSet<HTMLCanvasElement>(),
      create = window.createImageBitmap,
      close = ImageBitmap.prototype.close,
      draw = CanvasRenderingContext2D.prototype.drawImage;
    window.createImageBitmap = new Proxy(create, {
      apply(target, scope, args) {
        return Reflect.apply(target, scope, args).then(
          (bitmap: ImageBitmap) => {
            decoded++;
            return bitmap;
          },
        );
      },
    });
    ImageBitmap.prototype.close = function () {
      if (!retired.has(this)) {
        retired.add(this);
        closed++;
      }
      close.call(this);
    };
    CanvasRenderingContext2D.prototype.drawImage = new Proxy(draw, {
      apply(target, scope: CanvasRenderingContext2D, args) {
        if (args[0] instanceof ImageBitmap && !seen.has(scope.canvas)) {
          seen.add(scope.canvas);
          canvases.push(new WeakRef(scope.canvas));
        }
        return Reflect.apply(target, scope, args);
      },
    });
    window.__gemuArtworkProbe = {
      snapshot: () => ({
        decoded,
        closed,
        composites: canvases.flatMap((reference) => {
          const canvas = reference.deref();
          return canvas ? [{ width: canvas.width, height: canvas.height }] : [];
        }),
      }),
    };
  });
}
const snapshot = (page: Page) =>
  page.evaluate(() => ({
    graphics: window.__gemu3dProbe.snapshot(),
    artwork: window.__gemuArtworkProbe.snapshot(),
  }));
const frames = (value: ModelProbeSnapshot) =>
  value.contexts.reduce((sum, context) => sum + context.frames, 0);

export async function assembledSession(page: Page) {
  await page
    .getByRole("img", { name: /^Interactive 3D/ })
    .scrollIntoViewIfNeeded();
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect
    .poll(async () => {
      const before = frames((await snapshot(page)).graphics);
      await page.waitForTimeout(250);
      return frames((await snapshot(page)).graphics) - before;
    })
    .toBe(0);
  const before = await snapshot(page);
  await page.waitForTimeout(500);
  const state = await snapshot(page),
    active = state.graphics.contexts.filter((c) => c.connected && !c.lost);
  expect(frames(state.graphics) - frames(before.graphics)).toBe(0);
  expect(active).toHaveLength(1);
  expect(active[0].pixels).toBeGreaterThan(0);
  expect(active[0].pixels).toBeLessThanOrEqual(2_000_000);
  expect(state.artwork.decoded).toBeGreaterThan(0);
  expect(state.artwork.closed).toBe(state.artwork.decoded);
  expect(state.artwork.composites.some((c) => c.width > 0)).toBe(true);
  return {
    active: active[0],
    artwork: state.artwork,
    idleFrames: 0,
    idleWindowMs: 500,
  };
}

export async function assembledClosed(page: Page) {
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await snapshot(page)).graphics.contexts.filter((c) => !c.lost).length,
    )
    .toBe(0);
  const state = await snapshot(page);
  expect(state.artwork.closed).toBe(state.artwork.decoded);
  expect(
    state.artwork.composites.every((c) => c.width === 0 && c.height === 0),
  ).toBe(true);
  return state;
}

export async function attachAssembledEvidence(
  info: TestInfo,
  family: string,
  sessions: Awaited<ReturnType<typeof assembledSession>>[],
  afterClose: Awaited<ReturnType<typeof assembledClosed>>,
) {
  expect(sessions.length).toBeGreaterThanOrEqual(2);
  for (const session of sessions.slice(1))
    for (const [name, resource] of Object.entries(session.active.resources))
      expect(resource.live).toBeLessThanOrEqual(
        sessions[0].active.resources[name].live + 1,
      );
  const path = info.outputPath(`assembled-${family}.json`);
  await writeFile(
    path,
    JSON.stringify(
      {
        project: info.project.name,
        family,
        environment:
          "Instrumented Chromium with reduced motion and a 320px viewport; software WebGL, not physical-phone GPU or native-memory measurements.",
        sessions,
        afterClose,
      },
      null,
      2,
    ) + "\n",
  );
  await info.attach(`assembled-${family}.json`, {
    path,
    contentType: "application/json",
  });
}
