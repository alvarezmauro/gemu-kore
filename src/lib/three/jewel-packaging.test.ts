import { expect, it } from "vitest";
import { validateBytes } from "gltf-validator";
import {
  jewelFixture,
  jewelPresentation,
} from "../../../tests/helpers/jewel-fixture";
import { arrayBuffer, buildGlb } from "../../../tests/helpers/model-fixture";
import { inspectAuthoredPackage } from "./authored-packaging";
import { packagingPresentation } from "./contracts";
function inspect(f = jewelFixture()) {
  return inspectAuthoredPackage(
    arrayBuffer(buildGlb(f.document, f.binary)),
    f.dimensions,
    f.slots,
    "playstation-jewel",
  );
}
it("admits a standards-valid jewel case with a clear lid, rear, tray, hinges and two distinct spines", async () => {
  const f = jewelFixture(),
    report = await validateBytes(new Uint8Array(f.bytes), {
      format: "glb",
      maxIssues: 20,
      writeTimestamp: false,
      externalResourceFunction: async () => {
        throw new Error("No external resources");
      },
    });
  expect(report.issues.numErrors).toBe(0);
  expect(inspect(f)).toMatchObject({ textureCount: 0, draws: 16 });
  expect(() =>
    inspectAuthoredPackage(
      arrayBuffer(f.bytes),
      f.dimensions,
      f.slots,
      "genesis-clamshell",
    ),
  ).toThrow();
});
it("keeps the opposite spine optional, explicit and independent of required artwork", () => {
  const p = jewelPresentation();
  for (const s of p.content.slots.filter((s) => s.required)) {
    const id = crypto.randomUUID();
    s.resource = {
      id,
      url: `/api/media/private/${id}`,
      mimeType: "image/png",
      width: 32,
      height: 32,
      byteLength: 60,
    };
  }
  p.content.artworkComplete = true;
  expect(packagingPresentation.safeParse(p).success).toBe(true);
  const copy = structuredClone(p);
  copy.content.slots[3].required = true;
  expect(packagingPresentation.safeParse(copy).success).toBe(false);
  expect(
    packagingPresentation.safeParse({
      ...p,
      content: { ...p.content, slots: p.content.slots.slice(0, 3) },
    }).success,
  ).toBe(false);
  expect(
    packagingPresentation.safeParse({
      ...p,
      content: { ...p.content, familyKey: "genesis-clamshell" },
    }).success,
  ).toBe(false);
});

it("rejects transparency on artwork, excessive/invisible housing and masked or double-sided materials", () => {
  for (const change of [
    (f: ReturnType<typeof jewelFixture>) => {
      f.document.materials[0].alphaMode = "BLEND";
      f.document.materials[0].pbrMetallicRoughness.baseColorFactor[3] = 0.2;
    },
    (f: ReturnType<typeof jewelFixture>) => {
      f.document.materials[5].pbrMetallicRoughness.baseColorFactor[3] = 0;
    },
    (f: ReturnType<typeof jewelFixture>) => {
      Object.assign(f.document.materials[5], { doubleSided: true });
    },
    (f: ReturnType<typeof jewelFixture>) => {
      Object.assign(f.document.materials[5], { alphaMode: "MASK" });
    },
    (f: ReturnType<typeof jewelFixture>) => {
      f.document.scenes[0].nodes.push(16, 17, 18);
      f.document.nodes.push(
        ...[16, 17, 18].map((i) => ({ name: `duplicate-${i}`, mesh: 4 })),
      );
    },
  ]) {
    const f = jewelFixture();
    change(f);
    expect(() => inspect(f)).toThrow();
  }
});
it("checks the opposite spine's outward winding, upright UVs, dimensions and positive-X target", () => {
  for (const change of [
    (f: ReturnType<typeof jewelFixture>) => {
      f.slots[3].target.artWidthMm = 15;
    },
    (f: ReturnType<typeof jewelFixture>) => {
      f.slots[3].target = { ...f.slots[2].target };
    },
    (f: ReturnType<typeof jewelFixture>) => {
      Object.assign(f.document.nodes[3], { rotation: [0, 1, 0, 0] });
    },
  ]) {
    const f = jewelFixture();
    change(f);
    expect(() => inspect(f)).toThrow();
  }
});
import { clamshellFixture } from "../../../tests/helpers/clamshell-fixture";
it("keeps Genesis housing opaque even after jewel blending is enabled", () => {
  const f = clamshellFixture();
  f.document.materials[3].alphaMode = "BLEND";
  f.document.materials[3].pbrMetallicRoughness.baseColorFactor[3] = 0.2;
  expect(() =>
    inspectAuthoredPackage(
      arrayBuffer(buildGlb(f.document, f.binary)),
      f.dimensions,
      f.slots,
    ),
  ).toThrow();
});
it("includes optional jewel artwork in the existing aggregate transfer budget", () => {
  const p = jewelPresentation();
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
  p.content.artworkComplete = true;
  expect(packagingPresentation.safeParse(p).success).toBe(false);
});
