import { expect, it } from "vitest";
import { gameDetailInput, gameMutation } from "./management-validation";
import { emptyCopyPhysical } from "@/features/collection/copy-validation";
const id = "11111111-1111-4111-8111-111111111111";
const { defects, ...fields } = emptyCopyPhysical;
void defects;
const input = {
  operation: "update",
  ...fields,
  id,
  expectedRevision: 1,
  platformId: id,
  platformRevision: 1,
  gameId: id,
  gameRevision: 1,
  releaseId: id,
  releaseRevision: 1,
};
it("normalizes copy observations and requires root and canonical revisions", () => {
  expect(
    gameMutation.parse({ ...input, serialNumber: " 00001 " }),
  ).toMatchObject({ serialNumber: "00001", hasBox: null, notes: null });
  for (const key of [
    "expectedRevision",
    "platformRevision",
    "gameRevision",
    "releaseRevision",
  ])
    for (const value of [undefined, 0, 1.1, 2147483647])
      expect(gameMutation.safeParse({ ...input, [key]: value }).success).toBe(
        false,
      );
});
it.each([
  "editionType",
  "marketId",
  "description",
  "metadata",
  "components",
  "defects",
  "publicationStatus",
  "updatedById",
])("rejects injected %s on an owned-copy edit", (key) => {
  expect(gameMutation.safeParse({ ...input, [key]: "forged" }).success).toBe(
    false,
  );
});
it("accepts only the targeted revision for deletion and UUID-only detail input", () => {
  expect(
    gameMutation.parse({ operation: "delete", id, expectedRevision: 2 }),
  ).toEqual({ operation: "delete", id, expectedRevision: 2 });
  expect(
    gameMutation.safeParse({
      operation: "delete",
      id,
      expectedRevision: 2,
      ...fields,
    }).success,
  ).toBe(false);
  expect(gameDetailInput.safeParse({ id: "invalid" }).success).toBe(false);
  expect(gameDetailInput.safeParse({ id, role: "ADMIN" }).success).toBe(false);
});
