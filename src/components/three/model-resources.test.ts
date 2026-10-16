import { expect, it, vi } from "vitest";
import {
  Box3,
  BufferGeometry,
  Mesh,
  MeshStandardMaterial,
  Texture,
  Vector3,
} from "three";
import { modelSettings } from "@/lib/three/contracts";
import {
  arrayBuffer,
  modelFixture,
} from "../../../tests/helpers/model-fixture";
import { ModelResources, parseModel } from "./model-resources";
it("disposes shared GPU resources and ImageBitmaps once, including late allocations after cancellation", () => {
  const bitmap = { close: vi.fn() };
  const texture = new Texture(bitmap);
  const material = new MeshStandardMaterial({
    map: texture,
    emissiveMap: texture,
  });
  const geometry = new BufferGeometry();
  const spies = [geometry, material, texture].map((resource) =>
    vi.spyOn(resource, "dispose"),
  );
  const owner = new ModelResources();
  owner.track(new Mesh(geometry, material));
  owner.track(new Mesh(geometry, material));
  owner.dispose();
  owner.dispose();
  spies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
  expect(bitmap.close).toHaveBeenCalledTimes(1);
  const late = new Texture(bitmap);
  const dispose = vi.spyOn(late, "dispose");
  owner.track(late);
  owner.track(late);
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(bitmap.close).toHaveBeenCalledTimes(1);
});
it("parses an original embedded GLB and centers/fits finite geometry without a shared cache", async () => {
  const bytes = arrayBuffer(modelFixture().bytes);
  const settings = modelSettings.parse({
    preset: "console",
    orientation: [0, Math.PI / 2, 0],
  });
  const first = await parseModel(bytes, settings, new AbortController().signal);
  const second = await parseModel(
    bytes,
    settings,
    new AbortController().signal,
  );
  const bounds = new Box3().setFromObject(first.scene);
  expect(bounds.getCenter(new Vector3()).length()).toBeLessThan(1e-6);
  expect(Math.max(...bounds.getSize(new Vector3()).toArray())).toBeCloseTo(2);
  expect(first.scene).not.toBe(second.scene);
  expect(first.radius).toBeGreaterThan(0);
  first.owner.dispose();
  second.owner.dispose();
});
it("does not allocate for an already cancelled session or malformed file", async () => {
  const abort = new AbortController();
  abort.abort();
  await expect(
    parseModel(
      arrayBuffer(modelFixture().bytes),
      modelSettings.parse({}),
      abort.signal,
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
  await expect(
    parseModel(
      new ArrayBuffer(20),
      modelSettings.parse({}),
      new AbortController().signal,
    ),
  ).rejects.toThrow();
});
