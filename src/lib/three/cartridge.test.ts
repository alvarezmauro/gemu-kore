import { expect, it } from "vitest";
import { validateBytes } from "gltf-validator";
import {
  cartridgeFixture,
  cartridgeStudy,
} from "../../../tests/helpers/cartridge-fixture";
import { arrayBuffer, buildGlb } from "../../../tests/helpers/model-fixture";
import { inspectCartridge, inspectAuthoredPackage } from "./authored-packaging";
import {
  cartridgePresentation,
  packagingPresentation,
  viewerPresentation,
} from "./contracts";
const inspect = (f = cartridgeFixture()) =>
  inspectCartridge(
    arrayBuffer(buildGlb(f.document, f.binary)),
    f.dimensions,
    f.slots,
  );
it("validates original stepped cartridge geometry with a neutral, upright front label", async () => {
  const f = cartridgeFixture();
  const report = await validateBytes(new Uint8Array(f.bytes), {
    format: "glb",
    maxIssues: 20,
    writeTimestamp: false,
    externalResourceFunction: async () => {
      throw new Error("No external resources");
    },
  });
  expect(report.issues.numErrors).toBe(0);
  expect(inspect(f)).toMatchObject({ draws: 21, textureCount: 0 });
  expect(f.document.nodes.map((n) => n.name)).toEqual(
    expect.arrayContaining([
      "stepped-shell",
      "recessed-connector",
      "FRONT_LABEL",
    ]),
  );
});
it("keeps cartridge descriptors distinct from packaging while sharing the viewer", () => {
  const p = cartridgeStudy();
  expect(viewerPresentation.safeParse(p).success).toBe(true);
  expect(cartridgePresentation.safeParse(p).success).toBe(true);
  expect(packagingPresentation.safeParse(p).success).toBe(false);
  const f = cartridgeFixture();
  expect(() =>
    inspectAuthoredPackage(arrayBuffer(f.bytes), f.dimensions, f.slots),
  ).toThrow();
  for (const patch of [
    { type: "DISC" },
    { kind: "PACKAGING" },
    { slots: [] },
    { slots: [...p.content.slots, ...p.content.slots] },
  ])
    expect(
      cartridgePresentation.safeParse({
        ...p,
        content: { ...p.content, ...patch },
      }).success,
    ).toBe(false);
});
it("rejects baked/transparent label material, transparent shells and wrong indexed targets", () => {
  for (const material of [0, 1]) {
    const f = cartridgeFixture();
    f.document.materials[material].pbrMetallicRoughness.baseColorFactor[3] =
      0.2;
    Object.assign(f.document.materials[material], { alphaMode: "BLEND" });
    expect(() => inspect(f)).toThrow();
  }
  const f = cartridgeFixture();
  f.document.materials[0].pbrMetallicRoughness.baseColorFactor[0] = 0.5;
  expect(() => inspect(f)).toThrow();
  const g = cartridgeFixture();
  g.slots[0].target.nodeIndex = 1;
  expect(() => inspect(g)).toThrow();
});
it("checks dimensions, rectangular UVs, winding and diagnostic names", () => {
  const f = cartridgeFixture();
  f.dimensions.widthMm = 80;
  expect(() => inspect(f)).toThrow();
  const g = cartridgeFixture();
  g.slots[0].target.materialName = "other";
  expect(() => inspect(g)).toThrow();
  const h = cartridgeFixture(),
    uv =
      h.document.accessors[
        h.document.meshes[0].primitives[0].attributes.TEXCOORD_0
      ];
  h.binary.writeFloatLE(0.5, h.document.bufferViews[uv.bufferView].byteOffset);
  expect(() => inspect(h)).toThrow();
  const w = cartridgeFixture(),
    index = w.document.accessors[w.document.meshes[0].primitives[0].indices!],
    offset = w.document.bufferViews[index.bufferView].byteOffset;
  w.binary.writeUInt16LE(1, offset + 2);
  w.binary.writeUInt16LE(2, offset + 4);
  expect(() => inspect(w)).toThrow();
});
it("fails closed on invalid completeness, resource identity and oversized geometry", () => {
  const p = cartridgeStudy();
  p.content.artworkComplete = true;
  expect(cartridgePresentation.safeParse(p).success).toBe(false);
  p.content.artworkComplete = false;
  p.content.geometry.byteLength = 8 * 1024 * 1024 + 1;
  expect(cartridgePresentation.safeParse(p).success).toBe(false);
  p.content.geometry.byteLength = 100;
  p.content.slots[0].resource = {
    id: p.content.geometry.id,
    url: p.content.geometry.url,
    mimeType: "image/png",
    width: 16,
    height: 16,
    byteLength: 100,
  };
  p.content.artworkComplete = true;
  expect(cartridgePresentation.safeParse(p).success).toBe(false);
});
