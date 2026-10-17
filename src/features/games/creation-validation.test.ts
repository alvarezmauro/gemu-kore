import { describe, expect, it } from "vitest";
import {
  gameCopyCreate,
  gameSearch,
  releaseSearch,
  releaseSelection,
} from "./creation-validation";
import { emptyCopyPhysical } from "@/features/collection/copy-validation";
const id = "11111111-1111-4111-8111-111111111111";
const input = {
  ...emptyCopyPhysical,
  id,
  platformId: id,
  platformRevision: 1,
  gameId: id,
  gameRevision: 1,
  releaseId: id,
  releaseRevision: 1,
};
describe("game creation boundary", () => {
  it("allows unknown copy details and keeps three canonical identities separate", () => {
    expect(gameCopyCreate.parse(input)).toMatchObject({
      hasBox: null,
      notes: null,
      locationId: null,
      releaseId: id,
    });
    for (const field of [
      "platformId",
      "platformRevision",
      "gameId",
      "gameRevision",
      "releaseId",
      "releaseRevision",
    ]) {
      expect(
        gameCopyCreate.safeParse({ ...input, [field]: undefined }).success,
      ).toBe(false);
    }
  });
  it.each([
    "marketId",
    "editionType",
    "publicationStatus",
    "createdById",
    "components",
    "metadata",
  ])("rejects injected %s", (field) => {
    expect(
      gameCopyCreate.safeParse({ ...input, [field]: "forged" }).success,
    ).toBe(false);
  });
  it("bounds and validates structured copy details", () => {
    expect(
      gameCopyCreate.safeParse({
        ...input,
        defects: [{ title: "", description: "", severity: "MINOR" }],
      }).success,
    ).toBe(false);
    expect(
      gameCopyCreate.safeParse({ ...input, notes: "x".repeat(16001) }).success,
    ).toBe(false);
    expect(
      gameCopyCreate.safeParse({
        ...input,
        defects: Array.from({ length: 21 }, () => ({
          title: "Damage",
          description: "",
          severity: "MINOR",
        })),
      }).success,
    ).toBe(false);
  });
  it("allows optional market and edition filters and bounded searches", () => {
    expect(releaseSearch.parse({ platformId: id, gameId: id })).toMatchObject({
      marketId: "",
      editionType: "",
      query: "",
      page: 0,
    });
    expect(
      releaseSearch.safeParse({
        platformId: id,
        gameId: id,
        editionType: "DELUXE",
        marketId: id,
      }).success,
    ).toBe(true);
    expect(
      releaseSearch.safeParse({
        platformId: id,
        gameId: id,
        editionType: "invented",
      }).success,
    ).toBe(false);
    expect(gameSearch.safeParse({ page: 1001 }).success).toBe(false);
    expect(gameSearch.safeParse({ query: "x".repeat(201) }).success).toBe(
      false,
    );
    expect(
      releaseSelection.safeParse({
        id,
        platformId: id,
        gameId: id,
        archived: false,
      }).success,
    ).toBe(false);
  });
});
