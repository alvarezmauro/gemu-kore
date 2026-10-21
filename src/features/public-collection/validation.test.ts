import { describe, expect, it } from "vitest";
import {
  publicCollectionInput,
  publicDetailInput,
  settingsMutation,
  itemPublicationMutation,
} from "./validation";
describe("public collection input boundary", () => {
  it("normalizes bounded public terms and defaults without inheriting private controls", () => {
    expect(
      publicCollectionInput.parse({ q: "  café\n  games  " }),
    ).toMatchObject({
      q: "café games",
      limit: 20,
      offset: 0,
      sort: "name-asc",
    });
    expect(publicCollectionInput.parse({})).toMatchObject({ q: "", limit: 20 });
  });
  it.each([
    "audience",
    "role",
    "includePrivate",
    "serialNumber",
    "repairNote",
    "controls",
    "select",
    "publicationStatus",
    "notes",
  ])("rejects injected %s", (key) => {
    expect(publicCollectionInput.safeParse({ [key]: "private" }).success).toBe(
      false,
    );
    expect(
      publicDetailInput.safeParse({
        id: "dfad76dc-f390-4db6-9ea5-e062461b68c2",
        [key]: true,
      }).success,
    ).toBe(false);
  });
  it.each([
    { limit: 51 },
    { offset: 5001 },
    { offset: -1 },
    { q: "x".repeat(161) },
    { q: "a b c d e f g h i" },
    { sort: "location" },
    { platform: "snes" },
    { q: "a\0b" },
    { type: "game" },
  ])("rejects unsafe or unsupported controls %j", (input) => {
    expect(publicCollectionInput.safeParse(input).success).toBe(false);
  });
  it("requires explicit review and version/freshness evidence for mutations", () => {
    expect(
      settingsMutation.safeParse({ reviewed: false, expectedRevision: 1 })
        .success,
    ).toBe(false);
    expect(
      itemPublicationMutation.safeParse({
        id: "dfad76dc-f390-4db6-9ea5-e062461b68c2",
        expectedRevision: 1,
        expectedSettingsRevision: 1,
        published: true,
        reviewed: true,
      }).success,
    ).toBe(false);
  });
});
