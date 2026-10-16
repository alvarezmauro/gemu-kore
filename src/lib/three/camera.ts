import { modelLimits, type ModelSettings } from "./contracts";
export function cameraFit(
  radius: number,
  aspect: number,
  settings: ModelSettings,
) {
  const extent = radius + Math.hypot(...settings.targetOffset);
  const vertical = (settings.fov * Math.PI) / 180;
  const horizontal =
    2 * Math.atan(Math.tan(vertical / 2) * Math.max(0.05, aspect));
  const distance =
    (extent / Math.sin(Math.min(vertical, horizontal) / 2)) *
    1.2 *
    settings.distanceFactor;
  return {
    distance,
    minDistance: extent * 1.05,
    maxDistance: distance * 4,
    near: Math.max(0.001, extent / 100),
    far: distance * 4 + extent * 4,
  };
}
export function drawingDpr(
  width: number,
  height: number,
  hardwareLimit = 16384,
) {
  return Math.min(
    1,
    Math.sqrt(modelLimits.canvasPixels / Math.max(1, width * height)),
    hardwareLimit / Math.max(1, width, height),
  );
}
