import { afterEach, expect, it, vi } from "vitest";
import { Box3, Mesh, Vector3 } from "three";
import { packagingFixture } from "../../../tests/helpers/packaging-fixture";
import { monochromePng } from "../../../tests/helpers/png-fixtures";
import { boxFamily } from "@/lib/three/packaging-contracts";
import { boxGeometry, loadBox } from "./box-resources";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it.each(boxFamily.options)(
  "uses physical face groups and upright UVs for all six %s surfaces",
  (familyKey) => {
    const dimensions = packagingFixture(familyKey).content.dimensions;
    const geometry = boxGeometry(dimensions),
      normals = geometry.getAttribute("normal"),
      uv = geometry.getAttribute("uv");
    expect(geometry.groups.map((g) => g.materialIndex)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect(
      Array.from({ length: 6 }, (_, i) => [
        normals.getX(i * 4),
        normals.getY(i * 4),
        normals.getZ(i * 4),
      ]),
    ).toEqual([
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ]);
    for (let i = 0; i < 6; i++) {
      expect(uv.getY(i * 4)).toBe(0);
      expect(uv.getY(i * 4 + 2)).toBe(1);
    }
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.getSize(new Vector3()).toArray()).toEqual(
      [dimensions.widthMm, dimensions.heightMm, dimensions.depthMm].map((mm) =>
        expect.closeTo(mm / 1000),
      ),
    );
    geometry.dispose();
  },
);
it("creates isolated neutral geometry and disposes every material and geometry once", async () => {
  const p = packagingFixture(),
    a = await loadBox(p, new AbortController().signal, vi.fn(), vi.fn()),
    b = await loadBox(p, new AbortController().signal, vi.fn(), vi.fn());
  const bounds = new Box3().setFromObject(a.scene);
  expect(bounds.getCenter(new Vector3()).length()).toBeLessThan(1e-6);
  expect(Math.max(...bounds.getSize(new Vector3()).toArray())).toBeCloseTo(2);
  const mesh = a.scene.children[0].children[0] as Mesh,
    spies = [
      mesh.geometry,
      ...(Array.isArray(mesh.material) ? mesh.material : [mesh.material]),
    ].map((r) => vi.spyOn(r, "dispose"));
  expect(a.scene).not.toBe(b.scene);
  a.owner.dispose();
  a.owner.dispose();
  spies.forEach((s) => expect(s).toHaveBeenCalledTimes(1));
  b.owner.dispose();
});
it.each(boxFamily.options)(
  "deduplicates transfers, composes independent %s face textures and releases bitmaps/canvases",
  async (familyKey) => {
    const bytes = monochromePng(32, 16),
      p = packagingFixture(familyKey),
      id = crypto.randomUUID(),
      close = vi.fn(),
      draw = vi.fn(),
      rotate = vi.fn(),
      canvases: { width: number; height: number }[] = [];
    for (const slot of p.content.slots)
      slot.resource = {
        id,
        url: `/api/media/private/${id}`,
        mimeType: "image/png",
        width: 32,
        height: 16,
        byteLength: bytes.length,
      };
    p.content.artworkComplete = true;
    p.content.slots[4].transform = {
      ...p.content.slots[4].transform,
      quarterTurns: 1,
    };
    const fetcher = vi.fn(
      async () =>
        new Response(bytes, {
          headers: {
            "Content-Type": "image/png",
            "Content-Length": String(bytes.length),
          },
        }),
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
            rotate,
            drawImage: draw,
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
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(draw).toHaveBeenCalledTimes(6);
    expect(rotate).toHaveBeenCalledWith(Math.PI / 2);
    expect(close).toHaveBeenCalledTimes(6);
    const mesh = loaded.scene.children[0].children[0] as Mesh;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    expect(
      new Set(materials.map((m) => ("map" in m ? m.map : null))).size,
    ).toBe(6);
    loaded.owner.dispose();
    expect(close).toHaveBeenCalledTimes(6);
    expect(canvases.every((c) => c.width === 0 && c.height === 0)).toBe(true);
  },
);
it("closes a bitmap completing after cancellation", async () => {
  const p = packagingFixture(),
    bytes = monochromePng(32, 16),
    id = crypto.randomUUID(),
    abort = new AbortController(),
    close = vi.fn();
  p.content.slots[0].resource = {
    id,
    url: `/api/media/private/${id}`,
    mimeType: "image/png",
    width: 32,
    height: 16,
    byteLength: bytes.length,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(bytes, {
          headers: {
            "Content-Type": "image/png",
            "Content-Length": String(bytes.length),
          },
        }),
    ),
  );
  let finish!: (value: unknown) => void;
  const started = Promise.withResolvers<void>();
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(() => {
      started.resolve();
      return new Promise((resolve) => {
        finish = resolve;
      });
    }),
  );
  const result = loadBox(p, abort.signal, vi.fn(), vi.fn());
  await started.promise;
  abort.abort();
  await expect(result).rejects.toThrow();
  finish({ width: 32, height: 16, close });
  await Promise.resolve();
  await Promise.resolve();
  expect(close).toHaveBeenCalledTimes(1);
});
