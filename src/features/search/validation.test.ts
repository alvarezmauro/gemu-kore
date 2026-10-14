import { expect, it } from "vitest";
import { searchInput, searchResult } from "./validation";
it("normalizes whitespace and NFC with bounded paging defaults", () => {
  expect(searchInput.parse({ q: " e\u0301clair   SNES " })).toEqual({
    q: "éclair SNES",
    limit: 20,
    offset: 0,
  });
});
it.each([
  { q: "a".repeat(161) },
  { q: "one two three four five six seven eight nine" },
  { q: "a\0b" },
  { q: 1 },
  { q: "chrono", role: "ADMIN" },
  { q: "chrono", audience: "public" },
  { q: "chrono", limit: 51 },
  { q: "chrono", limit: 0 },
  { q: "chrono", offset: -1 },
  { q: "chrono", offset: 5001 },
  { q: "chrono", sort: "notes" },
])("rejects invalid or server-owned input %j", (value) => {
  expect(searchInput.safeParse(value).success).toBe(false);
});
it("counts Unicode code points instead of UTF16 halves", () => {
  expect(searchInput.safeParse({ q: "😀".repeat(160) }).success).toBe(true);
  expect(searchInput.safeParse({ q: "😀".repeat(161) }).success).toBe(false);
});
it("does not trim or strip punctuation from identifiers", () => {
  expect(searchInput.parse({ q: "00-ABC_%" }).q).toBe("00-ABC_%");
});
it("rejects unexpected private fields in the browser result contract", () => {
  expect(
    searchResult.safeParse({
      state: "ready",
      items: [
        {
          id: "b41b30e9-0562-4896-9740-f9b742c102eb",
          type: "GAME",
          title: "Game",
          context: "SNES",
          identificationStatus: "CONFIRMED",
          matchSources: ["Identity"],
          notes: "private",
        },
      ],
      hasMore: false,
      limit: 20,
      offset: 0,
    }).success,
  ).toBe(false);
});
