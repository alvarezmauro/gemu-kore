import { expect, it } from "vitest";
import { cameraFit, drawingDpr } from "./camera";
import { modelSettings } from "./contracts";
it("fits narrow viewports, encloses the zoom range, and caps fullscreen drawing resolution", () => {
  const settings = modelSettings.parse({});
  const wide = cameraFit(1, 2, settings),
    narrow = cameraFit(1, 0.4, settings);
  expect(narrow.distance).toBeGreaterThan(wide.distance);
  expect(narrow.near).toBeGreaterThan(0);
  expect(narrow.far).toBeGreaterThan(narrow.maxDistance + 1);
  expect(narrow.minDistance).toBeLessThan(narrow.distance);
  expect(drawingDpr(320, 240)).toBe(1);
  const dpr = drawingDpr(4000, 3000);
  expect(4000 * 3000 * dpr * dpr).toBeLessThanOrEqual(2_000_001);
  expect(drawingDpr(1000, 1000, 512)).toBe(0.512);
});
it.each([
  { fov: 0 },
  { fov: 100 },
  { scale: 0 },
  { scale: -1 },
  { orientation: [NaN, 0, 0] },
  { targetOffset: [Infinity, 0, 0] },
  { distanceFactor: 100 },
])("rejects unsafe camera/orientation settings: %j", (settings) => {
  expect(modelSettings.safeParse(settings).success).toBe(false);
});
