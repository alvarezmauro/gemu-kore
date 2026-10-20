import { afterEach, expect, it, vi } from "vitest";
import { Mesh, MeshStandardMaterial, Box3, Vector3 } from "three";
import {
  dvdFixture,
  dvdPresentation,
} from "../../../tests/helpers/dvd-fixture";
import { monochromePng } from "../../../tests/helpers/png-fixtures";
import { loadBox } from "./box-resources";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("keeps DVD housing opaque, composes separate upright art textures and releases every resource", async () => {
  const f = dvdFixture(),
    p = dvdPresentation(f),
    image = monochromePng(32, 16),
    id = crypto.randomUUID(),
    close = vi.fn(),
    canvases: { width: number; height: number }[] = [];
  for (const slot of p.content.slots)
    slot.resource = {
      id,
      url: `/api/media/private/${id}`,
      mimeType: "image/png",
      width: 32,
      height: 16,
      byteLength: image.length,
    };
  p.content.artworkComplete = true;
  const fetcher = vi.fn(
    async (url: string) =>
      new Response(
        new Uint8Array(url === p.content.geometry.url ? f.bytes : image),
        {
          headers: {
            "Content-Type":
              url === p.content.geometry.url
                ? "model/gltf-binary"
                : "image/png",
            "Content-Length": String(
              url === p.content.geometry.url ? f.bytes.length : image.length,
            ),
          },
        },
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 32, height: 16, close })),
  );
  vi.stubGlobal("document", {
    createElement: () => {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          fillRect: vi.fn(),
          translate: vi.fn(),
          rotate: vi.fn(),
          drawImage: vi.fn(),
        }),
      };
      canvases.push(canvas);
      return canvas;
    },
  });
  const loaded = await loadBox(
      p,
      new AbortController().signal,
      vi.fn(),
      vi.fn(),
    ),
    meshes: Mesh[] = [];
  loaded.scene.traverse((o) => {
    if (o instanceof Mesh) meshes.push(o);
  });
  expect(meshes).toHaveLength(23);
  expect(
    meshes.every((m) => !(m.material as MeshStandardMaterial).transparent),
  ).toBe(true);
  const art = meshes
    .filter((m) => ["FRONT", "BACK", "SPINE"].includes(m.name))
    .map((m) => m.material as MeshStandardMaterial);
  expect(new Set(art.map((m) => m.map)).size).toBe(3);
  expect(art.every((m) => m.map?.flipY === false)).toBe(true);
  expect(
    meshes
      .filter((m) => !["FRONT", "BACK", "SPINE"].includes(m.name))
      .every((m) => (m.material as MeshStandardMaterial).map === null),
  ).toBe(true);
  expect(
    Math.max(
      ...new Box3()
        .setFromObject(loaded.scene)
        .getSize(new Vector3())
        .toArray(),
    ),
  ).toBeCloseTo(2);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(close).toHaveBeenCalledTimes(3);
  const spies = [
    ...new Set(
      meshes.flatMap((m) => [m.geometry, m.material as MeshStandardMaterial]),
    ),
  ].map((r) => vi.spyOn(r, "dispose"));
  loaded.owner.dispose();
  loaded.owner.dispose();
  spies.forEach((s) => expect(s).toHaveBeenCalledTimes(1));
  expect(canvases.every((c) => !c.width && !c.height)).toBe(true);
});
it("fails safely on denied DVD geometry and creates independent neutral sessions on reopen", async () => {
  const f = dvdFixture(),
    p = dvdPresentation(f);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 403 })),
  );
  await expect(
    loadBox(p, new AbortController().signal, vi.fn(), vi.fn()),
  ).rejects.toThrow();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(new Uint8Array(f.bytes), {
          headers: {
            "Content-Type": "model/gltf-binary",
            "Content-Length": String(f.bytes.length),
          },
        }),
    ),
  );
  const a = await loadBox(p, new AbortController().signal, vi.fn(), vi.fn()),
    b = await loadBox(p, new AbortController().signal, vi.fn(), vi.fn());
  expect(a.scene).not.toBe(b.scene);
  a.owner.dispose();
  b.owner.dispose();
});
