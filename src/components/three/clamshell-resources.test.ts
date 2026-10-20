import { afterEach, expect, it, vi } from "vitest";
import { Box3, Mesh, MeshStandardMaterial, Vector3 } from "three";
import {
  clamshellFixture,
  clamshellPresentation,
} from "../../../tests/helpers/clamshell-fixture";
import { monochromePng } from "../../../tests/helpers/png-fixtures";
import { loadBox } from "./box-resources";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function mockModel(f = clamshellFixture()) {
  const p = clamshellPresentation(f);
  const fetcher = vi.fn(
    async () =>
      new Response(new Uint8Array(f.bytes), {
        headers: {
          "Content-Type": "model/gltf-binary",
          "Content-Length": String(f.bytes.length),
        },
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  return { p, fetcher };
}
it("maps indexed art primitives and fits the authored clamshell without replacing its modeled housing", async () => {
  const { p, fetcher } = mockModel(),
    progress = vi.fn();
  const loaded = await loadBox(
    p,
    new AbortController().signal,
    progress,
    vi.fn(),
  );
  const meshes: Mesh[] = [];
  loaded.scene.traverse((o) => {
    if (o instanceof Mesh) meshes.push(o);
  });
  expect(meshes).toHaveLength(12);
  for (const name of ["FRONT", "BACK", "SPINE"]) {
    const m = meshes.find((m) => m.name === name)!;
    expect(m.material).toBeInstanceOf(MeshStandardMaterial);
    expect((m.material as MeshStandardMaterial).map).toBeNull();
  }
  expect(meshes.find((m) => m.name === "clasp")).toBeDefined();
  const bounds = new Box3().setFromObject(loaded.scene);
  expect(Math.max(...bounds.getSize(new Vector3()).toArray())).toBeCloseTo(2);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(progress).toHaveBeenLastCalledWith(
    p.content.geometry.byteLength,
    p.content.geometry.byteLength,
  );
  const spies = meshes
    .flatMap((m) => [m.geometry, m.material as MeshStandardMaterial])
    .map((r) => vi.spyOn(r, "dispose"));
  loaded.owner.dispose();
  loaded.owner.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
});
it("composes separate art textures for shared material indices and keeps housing neutral", async () => {
  const f = clamshellFixture();
  // A shared source material is legal; targeting is per node/mesh/primitive.
  f.document.meshes[1].primitives[0].material = 0;
  f.slots[1].target.materialIndex = 0;
  f.slots[1].target.materialName = "art:FRONT";
  f.bytes = buildGlb(f.document, f.binary);
  const { p } = mockModel(f),
    image = monochromePng(32, 16),
    id = crypto.randomUUID(),
    close = vi.fn(),
    canvases: { width: number; height: number }[] = [];
  const fetcher = vi.fn(
    async (url: string) =>
      new Response(
        new Uint8Array(url === p.content.geometry.url ? f.bytes : image),
        {
          headers: {
            "Content-Length": String(
              url === p.content.geometry.url ? f.bytes.length : image.length,
            ),
            "Content-Type":
              url === p.content.geometry.url
                ? "model/gltf-binary"
                : "image/png",
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
  for (const s of p.content.slots)
    s.resource = {
      id,
      url: `/api/media/private/${id}`,
      mimeType: "image/png",
      width: 32,
      height: 16,
      byteLength: image.length,
    };
  p.content.artworkComplete = true;
  const loaded = await loadBox(
    p,
    new AbortController().signal,
    vi.fn(),
    vi.fn(),
  );
  const art: MeshStandardMaterial[] = [],
    housing: MeshStandardMaterial[] = [];
  loaded.scene.traverse((o) => {
    if (o instanceof Mesh)
      (["FRONT", "BACK", "SPINE"].includes(o.name) ? art : housing).push(
        o.material as MeshStandardMaterial,
      );
  });
  expect(new Set(art.map((m) => m.map)).size).toBe(3);
  expect(art.every((m) => m.map?.flipY === false)).toBe(true);
  expect(housing.every((m) => m.map === null)).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(close).toHaveBeenCalledTimes(3);
  loaded.owner.dispose();
  expect(canvases.every((c) => !c.width && !c.height)).toBe(true);
});
it("fails safely on a denied or replaced model and can open a fresh session", async () => {
  const { p } = mockModel();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 403 })),
  );
  await expect(
    loadBox(p, new AbortController().signal, vi.fn(), vi.fn()),
  ).rejects.toThrow();
  const { p: fresh } = mockModel();
  const loaded = await loadBox(
    fresh,
    new AbortController().signal,
    vi.fn(),
    vi.fn(),
  );
  loaded.owner.dispose();
});
import { buildGlb } from "../../../tests/helpers/model-fixture";
it("resolves multi-primitive meshes through their indexed parent node instead of mesh names", async () => {
  const f = clamshellFixture();
  f.document.meshes[0].primitives.push(f.document.meshes[1].primitives[0]);
  f.document.nodes[0].name = "sleeve";
  f.document.scenes[0].nodes = f.document.scenes[0].nodes.filter(
    (i) => i !== 1,
  );
  for (const [i, slot] of f.slots.entries())
    if (i < 2)
      Object.assign(slot.target, {
        nodeIndex: 0,
        meshIndex: 0,
        primitiveIndex: i,
        nodeName: "sleeve",
      });
  f.bytes = buildGlb(f.document, f.binary);
  const { p } = mockModel(f),
    loaded = await loadBox(p, new AbortController().signal, vi.fn(), vi.fn());
  const materials: MeshStandardMaterial[] = [];
  loaded.scene.traverse((o) => {
    if (o instanceof Mesh) materials.push(o.material as MeshStandardMaterial);
  });
  expect(materials).toHaveLength(12);
  expect(new Set(materials).size).toBe(4);
  loaded.owner.dispose();
});
