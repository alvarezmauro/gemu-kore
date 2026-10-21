import { describe, expect, it } from "vitest";
import { emptyCopyPhysical } from "@/features/collection/copy-validation";
import {
  accessoryCopyCreate,
  accessoryCopyMutation,
  accessoryCopyDetail,
  accessorySearch,
  variantSearch,
} from "./copy-validation";
const id = "00000000-0000-4000-8000-000000000001";
const input = {
  ...emptyCopyPhysical,
  id,
  accessoryId: id,
  accessoryRevision: 1,
  variantId: id,
  variantRevision: 1,
};
describe("accessory copy boundaries", () => {
  it("normalizes personal fields while keeping unknown has-box distinct", () => {
    expect(
      accessoryCopyCreate.parse({
        ...input,
        serialNumber: "  009 ",
        notes: "  ",
      }),
    ).toMatchObject({ serialNumber: "009", notes: null, hasBox: null });
  });
  it.each([
    "producerId",
    "platformIds",
    "regionIds",
    "publicationStatus",
    "customModelAssetId",
    "quantity",
  ])("rejects canonical/publication field %s", (key) => {
    expect(accessoryCopyCreate.safeParse({ ...input, [key]: id }).success).toBe(
      false,
    );
  });
  it("requires both canonical revisions and a client save reference", () => {
    expect(
      accessoryCopyCreate.safeParse({ ...input, id: undefined }).success,
    ).toBe(false);
    expect(
      accessoryCopyCreate.safeParse({ ...input, variantRevision: 0 }).success,
    ).toBe(false);
  });
  it("does not accept defects as an edit side effect", () => {
    expect(
      accessoryCopyMutation.safeParse({
        ...input,
        operation: "update",
        expectedRevision: 1,
      }).success,
    ).toBe(false);
    const { defects, ...fields } = input;
    void defects;
    expect(
      accessoryCopyMutation.safeParse({
        ...fields,
        operation: "update",
        expectedRevision: 1,
      }).success,
    ).toBe(true);
  });
  it("strictly scopes delete and model operations", () => {
    expect(
      accessoryCopyMutation.safeParse({
        operation: "delete",
        id,
        expectedRevision: 1,
      }).success,
    ).toBe(true);
    expect(
      accessoryCopyMutation.safeParse({
        operation: "model",
        id,
        expectedRevision: 1,
        useId: null,
      }).success,
    ).toBe(true);
    expect(
      accessoryCopyMutation.safeParse({
        operation: "removeModel",
        id,
        expectedRevision: 1,
        useId: null,
      }).success,
    ).toBe(false);
  });
  it("bounds search and detail pages", () => {
    expect(accessorySearch.parse({})).toEqual({ query: "", page: 0 });
    expect(variantSearch.safeParse({}).success).toBe(false);
    expect(accessorySearch.safeParse({ query: "x".repeat(201) }).success).toBe(
      false,
    );
    expect(accessoryCopyDetail.safeParse({ id, modelPage: 0 }).success).toBe(
      false,
    );
  });
});
