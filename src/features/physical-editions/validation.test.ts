import { expect, it } from "vitest";
import { createBoxTemplate } from "./validation";
const input = {
  id: crypto.randomUUID(),
  name: "Synthetic box",
  slug: "synthetic-box",
  familyKey: "nes-cardboard",
  revisionNumber: 1,
  dimensions: { schemaVersion: 1, widthMm: 110, heightMm: 160, depthMm: 25 },
  synthetic: true,
  measurementNote: "Synthetic dimensions for tests only.",
};
it.each(["nes-cardboard", "snes-cardboard"])(
  "admits explicit %s curation with supplied measurements and provenance",
  (familyKey) => {
    expect(createBoxTemplate.parse({ ...input, familyKey })).toMatchObject({
      familyKey,
      dimensions: input.dimensions,
      measurementNote: input.measurementNote,
    });
  },
);
it("rejects inferred or unsupported formats, empty measurement evidence and invalid dimensions", () => {
  for (const familyKey of [
    undefined,
    "NES",
    "famicom",
    "genesis-clamshell",
    "playstation-jewel",
  ])
    expect(createBoxTemplate.safeParse({ ...input, familyKey }).success).toBe(
      false,
    );
  expect(
    createBoxTemplate.safeParse({ ...input, measurementNote: "" }).success,
  ).toBe(false);
  expect(
    createBoxTemplate.safeParse({
      ...input,
      dimensions: { ...input.dimensions, widthMm: 0 },
    }).success,
  ).toBe(false);
});
