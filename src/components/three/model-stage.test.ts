import { expect, it, vi } from "vitest";
import {
  InstancedMesh,
  Mesh,
  PMREMGenerator,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { modelSettings } from "@/lib/three/contracts";
import { fitModelCamera, installStudio } from "./model-stage";
it("reset clears pending drag damping and restores the fitted camera without a continuing drift", () => {
  const camera = new PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(3, 2, 4);
  const controls = new OrbitControls(camera);
  const settings = modelSettings.parse({ preset: "console" });
  fitModelCamera(camera, controls, 1, 1, settings, true);
  const initial = camera.position.clone();
  controls.enableDamping = true;
  controls.rotateLeft(0.4);
  controls.update();
  expect(camera.position.distanceTo(initial)).toBeGreaterThan(0.01);
  fitModelCamera(camera, controls, 1, 1, settings, true);
  for (let frame = 0; frame < 10; frame++) controls.update();
  expect(camera.position.distanceTo(initial)).toBeLessThan(1e-8);
  expect(controls.target.distanceTo(new Vector3())).toBe(0);
  expect(controls.enableDamping).toBe(true);
});
it.each([false, true])(
  "releases reflection bake inputs immediately, including instancing, on failure=%s",
  (fail) => {
    const target = new WebGLRenderTarget(16, 16),
      disposeTarget = vi.spyOn(target, "dispose"),
      disposeGenerator = vi.spyOn(PMREMGenerator.prototype, "dispose"),
      scene = new Scene(),
      released: ReturnType<typeof vi.spyOn>[] = [];
    const bake = vi
      .spyOn(PMREMGenerator.prototype, "fromScene")
      .mockImplementation((room) => {
        const resources = new Set<{ dispose: () => void }>();
        room.traverse((object) => {
          if (object instanceof Mesh) {
            resources.add(object.geometry);
            for (const material of Array.isArray(object.material)
              ? object.material
              : [object.material])
              resources.add(material);
          }
          if (object instanceof InstancedMesh) resources.add(object);
        });
        for (const resource of resources)
          released.push(vi.spyOn(resource, "dispose"));
        if (fail) throw new Error("Bake unavailable");
        return target;
      });
    try {
      const release = installStudio({} as WebGLRenderer, scene);
      expect(bake).toHaveBeenCalledTimes(1);
      expect(released.length).toBeGreaterThan(2);
      for (const dispose of released) expect(dispose).toHaveBeenCalledTimes(1);
      expect(disposeGenerator).toHaveBeenCalledTimes(1);
      expect(disposeTarget).not.toHaveBeenCalled();
      expect(scene.environment).toBe(fail ? null : target.texture);
      release();
      release();
      expect(scene.environment).toBeNull();
      expect(disposeTarget).toHaveBeenCalledTimes(fail ? 0 : 1);
    } finally {
      bake.mockRestore();
      disposeGenerator.mockRestore();
      disposeTarget.mockRestore();
    }
  },
);
