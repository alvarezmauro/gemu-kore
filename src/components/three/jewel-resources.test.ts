import { afterEach, expect, it, vi } from "vitest";
import { Mesh, MeshStandardMaterial, Box3, Vector3 } from "three";
import {
  jewelFixture,
  jewelPresentation,
} from "../../../tests/helpers/jewel-fixture";
import { monochromePng } from "../../../tests/helpers/png-fixtures";
import { loadBox } from "./box-resources";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it.each([false, true])(
  "preserves bounded clear housing and independent art with opposite spine bound=%s",
  async (oppositeBound) => {
    const f = jewelFixture(),
      p = jewelPresentation(f),
      image = monochromePng(32, 16),
      id = crypto.randomUUID(),
      close = vi.fn(),
      canvases: { width: number; height: number }[] = [];
    for (const slot of p.content.slots)
      if (slot.required || oppositeBound)
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
    );
    const meshes: Mesh[] = [];
    loaded.scene.traverse((o) => {
      if (o instanceof Mesh) meshes.push(o);
    });
    expect(meshes).toHaveLength(16);
    expect(
      meshes.filter((m) => (m.material as MeshStandardMaterial).transparent),
    ).toHaveLength(6);
    expect(
      (
        meshes.find((m) => m.name === "clear-lid")!
          .material as MeshStandardMaterial
      ).opacity,
    ).toBeCloseTo(0.18);
    const art = meshes
      .filter((m) =>
        (oppositeBound
          ? ["FRONT", "BACK", "SPINE", "OPPOSITE_SPINE"]
          : ["FRONT", "BACK", "SPINE"]
        ).includes(m.name),
      )
      .map((m) => m.material as MeshStandardMaterial);
    expect(new Set(art.map((m) => m.map)).size).toBe(oppositeBound ? 4 : 3);
    expect(
      art.every(
        (m) => !m.transparent && m.opacity === 1 && m.map?.flipY === false,
      ),
    ).toBe(true);
    if (!oppositeBound)
      expect(
        (
          meshes.find((m) => m.name === "OPPOSITE_SPINE")!
            .material as MeshStandardMaterial
        ).map,
      ).toBeNull();
    expect(
      Math.max(
        ...new Box3()
          .setFromObject(loaded.scene)
          .getSize(new Vector3())
          .toArray(),
      ),
    ).toBeCloseTo(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(oppositeBound ? 4 : 3);
    const spies = [
      ...new Set(
        meshes.flatMap((m) => [m.geometry, m.material as MeshStandardMaterial]),
      ),
    ].map((r) => vi.spyOn(r, "dispose"));
    loaded.owner.dispose();
    loaded.owner.dispose();
    spies.forEach((s) => expect(s).toHaveBeenCalledTimes(1));
    expect(canvases.every((c) => !c.width && !c.height)).toBe(true);
  },
);
it("rejects denied geometry before parsing and loads an independent fresh geometry-only session", async () => {
  const f = jewelFixture(),
    p = jewelPresentation(f);
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
