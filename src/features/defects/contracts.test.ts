import { expect, it } from "vitest";
import { defectCounts, type DefectSummary } from "./contracts";
import { defectMutation } from "./validation";

const id = "b41b30e9-0562-4896-9740-f9b742c102eb";
const valid = {
  operation: "create",
  collectionItemId: id,
  expectedRevision: 1,
  title: " Scratch ",
  description: " ",
  severity: "COSMETIC",
  status: "ACTIVE",
  repairNote: " ",
};
it("normalizes required titles and optional notes without merging records", () => {
  expect(defectMutation.parse(valid)).toEqual({
    ...valid,
    title: "Scratch",
    description: null,
    repairNote: null,
  });
});
it("defaults new records to active and permits absent optional notes", () => {
  expect(
    defectMutation.parse({
      operation: "create",
      collectionItemId: id,
      expectedRevision: 1,
      title: "Scratch",
      severity: "COSMETIC",
    }),
  ).toMatchObject({ status: "ACTIVE", description: null, repairNote: null });
});
it.each([
  { title: " " },
  { title: "x".repeat(201) },
  { description: "x".repeat(4001) },
  { repairNote: "x".repeat(4001) },
  { severity: "MEDIUM" },
  { status: "IGNORED" },
  { collectionItemId: "bad" },
  { expectedRevision: 0 },
  { expectedRevision: 1.5 },
  { expectedRevision: 2147483647 },
  { role: "ADMIN" },
  { resolvedAt: "2026-10-05T00:00:00Z" },
  { publicationStatus: "PUBLISHED" },
])("rejects invalid input and server-owned fields %j", (change) => {
  expect(defectMutation.safeParse({ ...valid, ...change }).success).toBe(false);
});
it("labels accepted defects as unresolved while keeping active counts distinct", () => {
  expect(
    defectCounts([
      { status: "ACTIVE" },
      { status: "ACCEPTED" },
      { status: "REPAIRED" },
      { status: "ACCEPTED" },
    ] as DefectSummary[]),
  ).toEqual({ active: 1, accepted: 2, repaired: 1, unresolved: 3 });
  expect(defectCounts([])).toEqual({
    active: 0,
    accepted: 0,
    repaired: 0,
    unresolved: 0,
  });
});
