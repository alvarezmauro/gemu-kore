import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  parsePublicBrowse,
  publicBrowseHref,
  publicUrlParams,
} from "./browsing";

it("normalizes bookmarkable filters and maps routes to fixed public categories", () => {
  const id = randomUUID();
  const parsed = parsePublicBrowse({
    q: "  café\n game ",
    type: "game",
    page: "3",
    platform: id,
    year: "1995",
    hasDefects: "false",
    hasBox: "unknown",
    sort: "relevance",
  });
  expect(parsed).toMatchObject({
    page: 3,
    input: {
      q: "café game",
      type: "GAME",
      offset: 40,
      limit: 20,
      platform: id,
      year: 1995,
      hasDefects: false,
      hasBox: "unknown",
      sort: "relevance",
    },
  });
  const href = publicBrowseHref("search", parsed!.input, parsed!.page);
  expect(
    parsePublicBrowse(
      publicUrlParams(new URL(href, "https://example.test").searchParams),
    ),
  ).toEqual(parsed);
  expect(parsePublicBrowse({}, "consoles")?.input.type).toBe("CONSOLE");
  expect(parsePublicBrowse({}, "accessories")?.input.type).toBe("ACCESSORY");
  expect(parsePublicBrowse({ type: "game" }, "consoles")).toBeNull();
});
it("accepts empty native form fields, caps pages and never carries pagination into edited filters", () => {
  const parsed = parsePublicBrowse(
    { q: "", platform: "", year: "", hasDefects: "", page: "251", sort: "" },
    "games",
  )!;
  expect(parsed.input).toMatchObject({
    limit: 20,
    offset: 5000,
    type: "GAME",
    sort: "name-asc",
  });
  expect(publicBrowseHref("games", parsed.input)).toBe("/collection/games");
  expect(parsePublicBrowse({ page: "252" })).toBeNull();
});
it.each([
  { audience: "private" },
  { role: "ADMIN" },
  { includePrivate: "true" },
  { controls: "{}" },
  { select: "*" },
  { limit: "5000" },
  { offset: "0" },
  { type: "GAME" },
  { type: "__proto__" },
  { sort: "location" },
  { hasDefects: "1" },
  { hasBox: "yes" },
  { year: "0" },
  { year: "10000" },
  { platform: "snes" },
  { location: "private-location" },
  { page: "-1" },
  { page: "0" },
  { page: "1.5" },
  { page: "01" },
  { page: ["1", "2"] },
  { q: ["first", "second"] },
  { q: "x".repeat(161) },
  { q: "one two three four five six seven eight nine" },
  { q: "bad\0value" },
  { untrusted: "x".repeat(4097) },
])("rejects unsafe, ambiguous or private URL controls %j", (params) => {
  expect(parsePublicBrowse(params)).toBeNull();
});
it("preserves duplicates for rejection and handles prototype-looking keys without mutation", () => {
  expect(
    parsePublicBrowse(publicUrlParams(new URLSearchParams("q=first&q=second"))),
  ).toBeNull();
  const params = publicUrlParams(
    new URLSearchParams("__proto__=private&constructor=admin"),
  );
  expect(Object.getPrototypeOf(params)).toBeNull();
  expect(parsePublicBrowse(params)).toBeNull();
});
