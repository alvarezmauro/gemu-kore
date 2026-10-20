import { expect, it } from "vitest";
import { cartridgeFixture } from "../../../tests/helpers/cartridge-fixture";
import { createCartridgeTemplate, assignCartridge } from "./validation";
it("requires explicit cartridge type, measured dimensions, evidence and one front label mapping", () => {
  const f = cartridgeFixture(),
    input = {
      id: crypto.randomUUID(),
      name: "Synthetic cartridge",
      slug: "synthetic-cartridge",
      familyKey: "cartridge",
      type: "CARTRIDGE",
      revisionNumber: 1,
      dimensions: f.dimensions,
      slots: f.slots,
      synthetic: true,
      measurementNote: "Original synthetic study",
    };
  expect(createCartridgeTemplate.safeParse(input).success).toBe(true);
  for (const patch of [
    { type: "DISC" },
    { familyKey: "snes" },
    { slots: [] },
    { measurementNote: "" },
    { dimensions: { ...f.dimensions, depthMm: 0 } },
  ])
    expect(
      createCartridgeTemplate.safeParse({ ...input, ...patch }).success,
    ).toBe(false);
  expect(
    assignCartridge.safeParse({
      releaseId: crypto.randomUUID(),
      componentId: crypto.randomUUID(),
      expectedRevision: 1,
      templateId: null,
      expectedTemplateRevision: null,
      bindings: [],
    }).success,
  ).toBe(true);
});
