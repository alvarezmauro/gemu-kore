import { describe, expect, it } from "vitest";
import { validateBytes } from "gltf-validator";
import { clamshellFixture } from "../../../tests/helpers/clamshell-fixture";
import { arrayBuffer, buildGlb } from "../../../tests/helpers/model-fixture";
import { inspectAuthoredPackage } from "./authored-packaging";
const inspect = (fixture = clamshellFixture()) =>
  inspectAuthoredPackage(
    arrayBuffer(buildGlb(fixture.document, fixture.binary)),
    fixture.dimensions,
    fixture.slots,
  );
it("admits a standards-valid original clamshell with three explicit upright art surfaces and modeled housing", async () => {
  const f = clamshellFixture();
  const report = await validateBytes(new Uint8Array(f.bytes), {
    format: "glb",
    maxIssues: 20,
    writeTimestamp: false,
    externalResourceFunction: async () => {
      throw new Error("No external resources");
    },
  });
  expect(report.issues.numErrors).toBe(0);
  expect(inspect(f)).toMatchObject({ textureCount: 0, draws: 12 });
});
describe("rejects authored contracts that cannot truthfully map upright artwork", () => {
  it.each([
    "nodeIndex",
    "meshIndex",
    "primitiveIndex",
    "materialIndex",
    "nodeName",
    "materialName",
    "artWidthMm",
    "artHeightMm",
  ] as const)("checks %s against stored geometry", (key) => {
    const f = clamshellFixture();
    const target = f.slots[0].target;
    Object.assign(target, {
      [key]:
        typeof target[key] === "number" ? Number(target[key]) + 10 : "wrong",
    });
    expect(() => inspect(f)).toThrow();
  });
  it("rejects incorrect physical dimensions", () => {
    const f = clamshellFixture();
    f.dimensions.depthMm = 40;
    expect(() => inspect(f)).toThrow();
  });
  it("rejects flipped UVs and inside-out art", () => {
    for (const kind of ["uv", "winding"]) {
      const f = clamshellFixture(),
        p = f.document.meshes[0].primitives[0],
        a =
          f.document.accessors[
            kind === "uv" ? p.attributes.TEXCOORD_0 : p.indices!
          ],
        v = f.document.bufferViews[a.bufferView];
      if (kind === "uv") f.binary.writeFloatLE(1, v.byteOffset);
      else f.binary.writeUInt16LE(1, v.byteOffset + 2);
      expect(() => inspect(f)).toThrow();
    }
  });
  it("rejects duplicate surface use, diagnostic drift, nested extras and non-neutral art materials", () => {
    for (const change of [
      (f: ReturnType<typeof clamshellFixture>) => {
        f.slots[1].target = { ...f.slots[0].target };
      },
      (f: ReturnType<typeof clamshellFixture>) => {
        Object.assign(f.document.nodes[0], { extras: { pivot: [1, 0, 0] } });
      },
      (f: ReturnType<typeof clamshellFixture>) => {
        f.document.materials[0].pbrMetallicRoughness.baseColorFactor = [
          0.5, 1, 1, 1,
        ];
      },
      (f: ReturnType<typeof clamshellFixture>) => {
        Object.assign(f.document, { textures: [{ source: 0 }] });
      },
      (f: ReturnType<typeof clamshellFixture>) => {
        Object.assign(f.document.nodes[0], { scale: [-1, 1, 1] });
      },
    ]) {
      const f = clamshellFixture();
      change(f);
      expect(() => inspect(f)).toThrow();
    }
  });
  it("rejects invalid indices, missing UVs, alternate scenes and oversized material graphs", () => {
    for (const change of [
      (f: ReturnType<typeof clamshellFixture>) => {
        f.binary.writeUInt16LE(
          4095,
          f.document.bufferViews[
            f.document.accessors[f.document.meshes[0].primitives[0].indices!]
              .bufferView
          ].byteOffset,
        );
      },
      (f: ReturnType<typeof clamshellFixture>) => {
        delete f.document.meshes[0].primitives[0].attributes.TEXCOORD_0;
      },
      (f: ReturnType<typeof clamshellFixture>) => {
        f.document.scenes.push({ nodes: [] });
      },
      (f: ReturnType<typeof clamshellFixture>) => {
        f.document.materials = Array.from(
          { length: 62 },
          () => f.document.materials[0],
        );
      },
    ]) {
      const f = clamshellFixture();
      change(f);
      expect(() => inspect(f)).toThrow();
    }
  });
});
