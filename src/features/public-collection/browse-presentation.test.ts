import { expect, it } from "vitest";
import { activePublicFilters } from "./browse-presentation";
import { parsePublicBrowse, publicUrlParams } from "./browsing";
import type { PublicFacet } from "./contracts";
const id = "11111111-1111-4111-8111-111111111111";
it("removes one filter at a time, preserves the others and resets paging without mutating inputs", () => {
  const { input } = parsePublicBrowse({
    q: "café & games",
    type: "game",
    platform: id,
    region: id,
    company: id,
    location: id,
    year: "1995",
    hasBox: "unknown",
    hasDefects: "false",
    sort: "newest",
    page: "4",
  })!;
  const facets: PublicFacet[] = [
    { field: "platform", value: id, label: "SNES", count: 2 },
    { field: "location", value: id, label: "Display shelf", count: 1 },
  ];
  const before = structuredClone({ input, facets });
  const filters = activePublicFilters("search", input, facets);
  expect(filters.map((f) => f.key)).toEqual([
    "q",
    "type",
    "platform",
    "region",
    "company",
    "year",
    "location",
    "hasBox",
    "hasDefects",
  ]);
  expect(filters.find((f) => f.key === "q")?.label).toBe(
    "Search: café & games",
  );
  expect(filters.find((f) => f.key === "platform")?.label).toBe(
    "Platform: SNES",
  );
  expect(filters.find((f) => f.key === "location")?.label).toBe(
    "Location: Display shelf",
  );
  for (const filter of filters) {
    const url = new URL(filter.href, "https://example.test");
    expect(url.pathname).toBe("/collection/search");
    expect(url.searchParams.has(filter.key)).toBe(false);
    expect(url.searchParams.has("page")).toBe(false);
    const parsed = parsePublicBrowse(publicUrlParams(url.searchParams))!;
    const expected = { ...input, [filter.key]: undefined, offset: 0 };
    if (filter.key === "q") expected.q = "";
    expect(parsed.input).toEqual(expected);
  }
  expect({ input, facets }).toEqual(before);
});
it("uses only the matching public facet field and safe labels for absent options", () => {
  const { input } = parsePublicBrowse({
    platform: id,
    location: id,
    year: "1995",
  })!;
  const filters = activePublicFilters("search", input, [
    { field: "company", value: id, label: "Unrelated company", count: 1 },
  ]);
  expect(filters.map((f) => f.label)).toEqual([
    "Platform: Selected option",
    "Release year: 1995",
    "Location: Selected option",
  ]);
  expect(JSON.stringify(filters)).not.toContain("Unrelated company");
});
it.each(["consoles", "games", "accessories"] as const)(
  "keeps the fixed %s category without adding a removable type override",
  (category) => {
    const { input } = parsePublicBrowse({ q: "Game", page: "2" }, category)!;
    const filters = activePublicFilters(category, input, []);
    expect(filters).toEqual([
      { key: "q", label: "Search: Game", href: "/collection/" + category },
    ]);
  },
);
it("keeps false/unknown physical filters active and produces no chips for an unfiltered list", () => {
  const { input } = parsePublicBrowse({
    hasBox: "false",
    hasDefects: "false",
  })!;
  expect(activePublicFilters("search", input, []).map((f) => f.label)).toEqual([
    "Without box",
    "Without unresolved defects",
  ]);
  expect(
    activePublicFilters("search", parsePublicBrowse({})!.input, []),
  ).toEqual([]);
});
