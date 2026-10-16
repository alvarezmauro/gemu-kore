import { expect, it } from "vitest";
import { inspectModel } from "./profile";
import { ModelError, modelLimits } from "./contracts";
import {
  arrayBuffer,
  buildGlb,
  modelFixture,
  texturedFixture,
} from "../../../tests/helpers/model-fixture";
import { monochromePng } from "../../../tests/helpers/png-fixtures";
function inspect(document: unknown) {
  return inspectModel(arrayBuffer(buildGlb(document, modelFixture().binary)));
}
it("admits a self-contained static model and counts repeated mesh instances rather than unique geometry", () => {
  const { document, bytes } = modelFixture();
  expect(inspectModel(arrayBuffer(bytes))).toMatchObject({
    triangles: 4,
    draws: 1,
    textureCount: 0,
    geometryBytes: 96,
  });
  expect(
    inspect({
      ...document,
      nodes: [{ mesh: 0 }, { mesh: 0 }],
      scenes: [{ nodes: [0, 1] }],
    }),
  ).toMatchObject({ triangles: 8, draws: 2 });
});
it.each([
  { extensionsUsed: ["KHR_draco_mesh_compression"] },
  { extensionsRequired: ["KHR_materials_unlit"] },
  { extras: { uri: "https://example.com/texture.png" } },
  { extras: { uri: "data:image/png;base64,AA==" } },
  { extensions: { KHR_texture_basisu: {} } },
  { animations: [{}] },
  { skins: [{}] },
  { nodes: [{ mesh: 0, children: [0] }] },
  { nodes: Array.from({ length: 257 }, () => ({ mesh: 0 })) },
  { scenes: [{ nodes: [0] }, { nodes: [0] }] },
  { scenes: [] },
  { materials: Array.from({ length: 65 }, () => ({})) },
])(
  "refuses unsupported resources or structurally unsafe content before decoder use: %j",
  (patch) => {
    expect(() => inspect({ ...modelFixture().document, ...patch })).toThrow(
      ModelError,
    );
  },
);
it("counts extra transparent material passes and rejects excessive draws/triangle instances", () => {
  const { document } = modelFixture();
  const many = {
    ...document,
    nodes: Array.from({ length: 41 }, () => ({ mesh: 0 })),
    scenes: [{ nodes: Array.from({ length: 41 }, (_, i) => i) }],
    materials: [{ doubleSided: true, alphaMode: "BLEND" }],
  };
  expect(() => inspect(many)).toThrow(ModelError);
  expect(() =>
    inspect({
      ...document,
      accessors: [
        document.accessors[0],
        { ...document.accessors[1], count: 600003 },
      ],
    }),
  ).toThrow(ModelError);
});
it("checks embedded image dimensions before decoding, including unused images and repeated texture allocations", () => {
  const small = texturedFixture(monochromePng(24, 12));
  expect(inspectModel(arrayBuffer(small.bytes))).toMatchObject({
    textureCount: 1,
    texturePixels: 288,
  });
  const huge = texturedFixture(monochromePng(2049, 1));
  expect(() => inspectModel(arrayBuffer(huge.bytes))).toThrow(ModelError);
  expect(() =>
    inspectModel(
      arrayBuffer(buildGlb({ ...huge.document, textures: [] }, huge.binary)),
    ),
  ).toThrow(ModelError);
  const repeated = texturedFixture(monochromePng(2048, 2048));
  expect(() =>
    inspectModel(
      arrayBuffer(
        buildGlb(
          { ...repeated.document, textures: [{ source: 0 }, { source: 0 }] },
          repeated.binary,
        ),
      ),
    ),
  ).toThrow(ModelError);
});
it("refuses invalid containers, byte/JSON ceilings and out-of-range buffer views", () => {
  const { document, bytes } = modelFixture();
  const invalid = Buffer.from(bytes);
  invalid.writeUInt32LE(100, 8);
  for (const input of [
    new ArrayBuffer(0),
    arrayBuffer(invalid),
    new ArrayBuffer(modelLimits.bytes + 1),
  ])
    expect(() => inspectModel(input)).toThrow(ModelError);
  expect(() =>
    inspect({ ...document, bufferViews: [{ buffer: 0, byteLength: 1000 }] }),
  ).toThrow(ModelError);
  expect(() =>
    inspect({ ...document, extras: { value: "x".repeat(modelLimits.json) } }),
  ).toThrow(ModelError);
});
it("accepts optional unlit but refuses extensions hidden outside extensionsUsed", () => {
  const { document } = modelFixture();
  expect(
    inspect({
      ...document,
      extensionsUsed: ["KHR_materials_unlit"],
      materials: [{ extensions: { KHR_materials_unlit: {} } }],
    }).draws,
  ).toBe(1);
  expect(() =>
    inspect({
      ...document,
      materials: [
        {
          extensions: { KHR_materials_transmission: { transmissionFactor: 1 } },
        },
      ],
    }),
  ).toThrow(ModelError);
});
