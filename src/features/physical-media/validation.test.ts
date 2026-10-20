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
import { cartridgeFormatKey } from "./template-metadata";
it.each(cartridgeFormatKey.options)(
  "accepts %s metadata only alongside explicit model measurements and mappings",
  (formatKey) => {
    const f = cartridgeFixture(),
      input = {
        id: crypto.randomUUID(),
        name: "Synthetic study",
        slug: "synthetic-study",
        familyKey: "cartridge",
        type: "CARTRIDGE",
        revisionNumber: 2,
        dimensions: f.dimensions,
        slots: f.slots,
        synthetic: true,
        measurementNote: "Curator-supplied synthetic study",
        format: { schemaVersion: 1, formatKey, variant: "Study variant" },
      };
    expect(createCartridgeTemplate.parse(input)).toMatchObject({
      dimensions: f.dimensions,
      slots: f.slots,
      format: input.format,
    });
    expect(
      createCartridgeTemplate.safeParse({ ...input, dimensions: undefined })
        .success,
    ).toBe(false);
    expect(
      createCartridgeTemplate.safeParse({ ...input, slots: undefined }).success,
    ).toBe(false);
  },
);
