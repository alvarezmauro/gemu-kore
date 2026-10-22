import { expect, it } from "vitest";
import {
  copyPhysical,
  emptyCopyPhysical,
  newCopyDefect,
} from "./copy-validation";

const location = "11111111-1111-4111-8111-111111111111";
it("normalizes absent physical observations without inventing facts", () => {
  const input = structuredClone(emptyCopyPhysical);
  expect(copyPhysical.parse(input)).toEqual({
    serialNumber: null,
    observedMarkings: null,
    hasBox: null,
    locationId: null,
    notes: null,
    defects: [],
  });
  expect(input).toEqual(emptyCopyPhysical);
});
it("preserves serial zeroes, manual line breaks and an explicit location", () => {
  const input = {
    ...emptyCopyPhysical,
    serialNumber: "  0000123  ",
    locationId: location,
    observedMarkings: "  Label A\nLabel B  ",
    notes: "  First line\n\nSecond line  ",
  };
  const before = structuredClone(input);
  expect(copyPhysical.parse(input)).toMatchObject({
    serialNumber: "0000123",
    locationId: location,
    observedMarkings: "Label A\nLabel B",
    notes: "First line\n\nSecond line",
  });
  expect(input).toEqual(before);
});
it.each([
  ["unknown", null],
  ["yes", true],
  ["no", false],
] as const)("keeps the box observation %s distinct", (hasBox, expected) => {
  expect(copyPhysical.parse({ ...emptyCopyPhysical, hasBox }).hasBox).toBe(
    expected,
  );
});
it.each([
  ["serialNumber", 200],
  ["observedMarkings", 4000],
  ["notes", 16000],
] as const)(
  "bounds %s after trimming, including the exact limit",
  (key, limit) => {
    expect(
      copyPhysical.parse({
        ...emptyCopyPhysical,
        [key]: "  " + "x".repeat(limit) + "  ",
      })[key],
    ).toBe("x".repeat(limit));
    expect(
      copyPhysical.safeParse({
        ...emptyCopyPhysical,
        [key]: "x".repeat(limit + 1),
      }).success,
    ).toBe(false);
    expect(
      copyPhysical.parse({ ...emptyCopyPhysical, [key]: " \n\t " })[key],
    ).toBeNull();
  },
);
it("retains twenty separately described defects, but refuses a twenty-first", () => {
  const defects = Array.from({ length: 20 }, (_, n) => ({
    title: "  Defect " + n + "  ",
    description: " \n ",
    severity: "MINOR",
  }));
  const output = copyPhysical.parse({ ...emptyCopyPhysical, defects });
  expect(output.defects).toHaveLength(20);
  expect(output.defects[0]).toEqual({
    title: "Defect 0",
    description: null,
    severity: "MINOR",
  });
  expect(
    copyPhysical.safeParse({
      ...emptyCopyPhysical,
      defects: [...defects, defects[0]],
    }).success,
  ).toBe(false);
});
it("validates trimmed defect text limits and rejects repair or publication authority", () => {
  const defect = {
    title: "x".repeat(200),
    description: "x".repeat(4000),
    severity: "CRITICAL",
  };
  expect(newCopyDefect.parse(defect)).toEqual(defect);
  for (const patch of [
    { title: " " },
    { title: "x".repeat(201) },
    { description: "x".repeat(4001) },
    { severity: "UNKNOWN" },
    { status: "REPAIRED" },
    { repairNote: "Already repaired" },
    { publicApproved: true },
  ])
    expect(newCopyDefect.safeParse({ ...defect, ...patch }).success).toBe(
      false,
    );
});
it.each([
  { hasBox: true },
  { hasBox: "false" },
  { locationId: "unknown" },
  { locationId: null },
  { publicationStatus: "PUBLISHED" },
  { publishedById: location },
  { type: "GAME" },
])("rejects non-form or authority-bearing physical input %j", (patch) => {
  expect(
    copyPhysical.safeParse({ ...emptyCopyPhysical, ...patch }).success,
  ).toBe(false);
});
