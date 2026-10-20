import { expect, it } from "vitest";
import { validateBytes } from "gltf-validator";
import {
  dvdFixture,
  dvdPresentation,
} from "../../../tests/helpers/dvd-fixture";
import { jewelFixture } from "../../../tests/helpers/jewel-fixture";
import { arrayBuffer, buildGlb } from "../../../tests/helpers/model-fixture";
import { inspectAuthoredPackage } from "./authored-packaging";
import { packagingPresentation } from "./contracts";
const inspect = (f = dvdFixture()) =>
  inspectAuthoredPackage(
    arrayBuffer(buildGlb(f.document, f.binary)),
    f.dimensions,
    f.slots,
    "ps2-dvd",
  );
it("admits a standards-valid synthetic DVD keep case with rounded hollow shells, hinge and latch details", async () => {
  const f = dvdFixture(),
    report = await validateBytes(new Uint8Array(f.bytes), {
      format: "glb",
      maxIssues: 20,
      writeTimestamp: false,
      externalResourceFunction: async () => {
        throw new Error("No external resources");
      },
    });
  expect(report.issues.numErrors).toBe(0);
  expect(inspect(f)).toMatchObject({ textureCount: 0, draws: 23 });
  expect(f.document.nodes.map((n) => n.name)).toEqual(
    expect.arrayContaining([
      "front-shell",
      "rear-shell",
      "flexible-hinge",
      "latch--0.032",
      "tray-hub",
    ]),
  );
});
it("requires three unique mapped opaque art surfaces and refuses jewel slot/transparency contracts", () => {
  const p = dvdPresentation();
  expect(packagingPresentation.safeParse(p).success).toBe(true);
  expect(
    packagingPresentation.safeParse({
      ...p,
      content: { ...p.content, familyKey: "playstation-jewel" },
    }).success,
  ).toBe(false);
  const jewel = jewelFixture();
  expect(() =>
    inspectAuthoredPackage(
      arrayBuffer(jewel.bytes),
      jewel.dimensions,
      jewel.slots,
      "ps2-dvd",
    ),
  ).toThrow();
  const f = dvdFixture();
  f.document.materials[3].alphaMode = "BLEND";
  f.document.materials[3].pbrMetallicRoughness.baseColorFactor[3] = 0.2;
  expect(() => inspect(f)).toThrow();
  const duplicate = dvdPresentation();
  duplicate.content.slots[1].target = { ...duplicate.content.slots[0].target };
  expect(packagingPresentation.safeParse(duplicate).success).toBe(false);
});
it("checks DVD dimensions, upright surface diagnostics and artwork completeness independently", () => {
  const f = dvdFixture();
  f.dimensions.heightMm = 170;
  expect(() => inspect(f)).toThrow();
  const g = dvdFixture();
  g.slots[2].target.nodeName = "not-the-spine";
  expect(() => inspect(g)).toThrow();
  const p = dvdPresentation();
  p.content.artworkComplete = true;
  expect(packagingPresentation.safeParse(p).success).toBe(false);
});
it("keeps geometry plus unique DVD artwork within the existing aggregate transfer limit", () => {
  const p = dvdPresentation();
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
