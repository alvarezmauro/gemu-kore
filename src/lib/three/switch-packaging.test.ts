import { expect, it } from "vitest";
import { validateBytes } from "gltf-validator";
import {
  switchFixture,
  switchPresentation,
} from "../../../tests/helpers/switch-fixture";
import { arrayBuffer, buildGlb } from "../../../tests/helpers/model-fixture";
import { inspectAuthoredPackage } from "./authored-packaging";
import { packagingPresentation } from "./contracts";
const inspect = (f = switchFixture()) =>
  inspectAuthoredPackage(
    arrayBuffer(buildGlb(f.document, f.binary)),
    f.dimensions,
    f.slots,
    "switch-case",
  );
it("admits a standards-valid slim clear Switch case with an empty card retainer", async () => {
  const f = switchFixture(),
    report = await validateBytes(new Uint8Array(f.bytes), {
      format: "glb",
      maxIssues: 20,
      writeTimestamp: false,
      externalResourceFunction: async () => {
        throw new Error("No external resources");
      },
    });
  expect(report.issues.numErrors).toBe(0);
  expect(inspect(f)).toMatchObject({ textureCount: 0, draws: 14 });
  expect(f.document.nodes.map((n) => n.name)).toEqual(
    expect.arrayContaining([
      "front-clear-shell",
      "rear-clear-shell",
      "flexible-hinge",
      "latch",
      "empty-card-retainer-base",
    ]),
  );
  expect(packagingPresentation.safeParse(switchPresentation()).success).toBe(
    true,
  );
});
it("keeps the three-plane Switch contract distinct from jewel mappings and opaque housing families", () => {
  const p = switchPresentation();
  expect(
    packagingPresentation.safeParse({
      ...p,
      content: { ...p.content, familyKey: "playstation-jewel" },
    }).success,
  ).toBe(false);
  const f = switchFixture();
  for (const family of ["genesis-clamshell", "ps2-dvd"] as const)
    expect(() =>
      inspectAuthoredPackage(
        arrayBuffer(f.bytes),
        f.dimensions,
        f.slots,
        family,
      ),
    ).toThrow();
  p.content.slots[1].target = { ...p.content.slots[0].target };
  expect(packagingPresentation.safeParse(p).success).toBe(false);
});
it.each([0, 0.81, 1])(
  "rejects Switch housing alpha %s outside the bounded clear profile",
  (alpha) => {
    const f = switchFixture();
    f.document.materials[3].pbrMetallicRoughness.baseColorFactor[3] = alpha;
    expect(() => inspect(f)).toThrow();
  },
);
it("counts instanced translucent housing toward the eight-primitive cap", () => {
  const f = switchFixture();
  f.document.nodes.push({ name: "ninth-clear-instance", mesh: 3 });
  f.document.scenes[0].nodes.push(f.document.nodes.length - 1);
  expect(() => inspect(f)).toThrow();
});
it("rejects transparent artwork, metal, emission, masking and double-sided clear housing", () => {
  const art = switchFixture();
  // Stay below the blend cap so this exercises the opaque-art rule itself.
  art.document.materials[3].alphaMode = "OPAQUE";
  art.document.materials[3].pbrMetallicRoughness.baseColorFactor[3] = 1;
  art.document.materials[0].alphaMode = "BLEND";
  art.document.materials[0].pbrMetallicRoughness.baseColorFactor[3] = 0.2;
  expect(() => inspect(art)).toThrow();
  for (const patch of [
    { doubleSided: true },
    { alphaMode: "MASK" },
    { emissiveFactor: [1, 0, 0] },
  ]) {
    const f = switchFixture();
    Object.assign(f.document.materials[3], patch);
    expect(() => inspect(f)).toThrow();
  }
  const metal = switchFixture();
  metal.document.materials[3].pbrMetallicRoughness.metallicFactor = 1;
  expect(() => inspect(metal)).toThrow();
});
it("validates measured bounds, indexed diagnostics, UV orientation and outward winding", () => {
  const f = switchFixture();
  f.dimensions.heightMm = 150;
  expect(() => inspect(f)).toThrow();
  const g = switchFixture();
  g.slots[2].target.nodeName = "wrong-spine";
  expect(() => inspect(g)).toThrow();
  const h = switchFixture(),
    primitive = h.document.meshes[0].primitives[0];
  const uv = h.document.accessors[primitive.attributes.TEXCOORD_0];
  h.binary.writeFloatLE(0.5, h.document.bufferViews[uv.bufferView].byteOffset);
  expect(() => inspect(h)).toThrow();
  const w = switchFixture(),
    index = w.document.accessors[w.document.meshes[0].primitives[0].indices!],
    offset = w.document.bufferViews[index.bufferView].byteOffset;
  w.binary.writeUInt16LE(1, offset + 2);
  w.binary.writeUInt16LE(2, offset + 4);
  expect(() => inspect(w)).toThrow();
});
it("requires complete art claims and enforces the aggregate model/art transfer budget", () => {
  const p = switchPresentation();
  p.content.artworkComplete = true;
  expect(packagingPresentation.safeParse(p).success).toBe(false);
  p.content.geometry.byteLength = 8 * 1024 * 1024;
  for (const s of p.content.slots) {
    const id = crypto.randomUUID();
    s.resource = {
      id,
      url: `/api/media/private/${id}`,
      mimeType: "image/png",
      width: 32,
      height: 32,
      byteLength: 2 * 1024 * 1024,
    };
  }
  expect(packagingPresentation.safeParse(p).success).toBe(false);
});
