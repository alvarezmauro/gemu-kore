import { expect, it } from "vitest";
import { paletteInput, paletteResult } from "./palette-validation";
it("accepts only bounded normalized free text for the palette", () => {
  expect(paletteInput.parse({ q: "  CHRONO  trigger " })).toEqual({
    q: "CHRONO trigger",
  });
  for (const value of [
    { q: "a".repeat(161) },
    { q: "one two three four five six seven eight nine" },
    { q: "chrono", limit: 2 },
    { q: "chrono", includePrivate: true },
    { q: "chrono", actor: "ADMIN" },
  ])
    expect(paletteInput.safeParse(value).success).toBe(false);
});
it("rejects untyped catalog IDs, excessive results and extra private properties", () => {
  const data = {
    collection: {
      state: "ready",
      items: [],
      limit: 20,
      offset: 0,
      hasMore: false,
    },
    catalog: [],
    catalogHasMore: false,
  };
  const item = {
    id: "b41b30e9-0562-4896-9740-f9b742c102eb",
    kind: "game",
    title: "Name",
    context: "",
    identificationStatus: null,
  };
  expect(paletteResult.safeParse({ ...data, catalog: [item] }).success).toBe(
    true,
  );
  for (const catalog of [
    [{ ...item, kind: "copy" }],
    [{ ...item, id: "slug" }],
    [{ ...item, metadata: {} }],
    Array(11).fill(item),
  ])
    expect(paletteResult.safeParse({ ...data, catalog }).success).toBe(false);
});
