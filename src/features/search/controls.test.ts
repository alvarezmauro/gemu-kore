import { expect, it } from "vitest";
import {
  collectionControls,
  controlsActive,
  controlsQuery,
  parseControls,
  sortLabels,
} from "./controls";
it("round-trips canonical bookmark controls without private free text", () => {
  const data = collectionControls.parse({
    type: "game",
    platform: "snes",
    region: "japan",
    hasBox: "true",
    year: "1995",
    sort: "year-desc",
  });
  const query = controlsQuery(data);
  expect(query).toBe(
    "type=game&platform=snes&region=japan&year=1995&hasBox=true&sort=year-desc",
  );
  expect(parseControls(new URLSearchParams(query))).toMatchObject({
    success: true,
    data,
  });
  expect(controlsActive(data)).toBe(true);
  expect(controlsQuery(collectionControls.parse({}))).toBe("");
});
it.each([
  "platform=snes&platform=nes",
  "q=private+serial",
  "sort=drop+table",
  "type=GAME",
  "hasBox=0",
  "hasDefects=unknown",
  "year=0",
  "year=1995.5",
  "year=10000",
  "rating=5",
  "location=home",
  "platform=%3Cscript%3E",
  "__proto__=x",
])("rejects unsupported or ambiguous URL %s", (query) => {
  expect(parseControls(new URLSearchParams(query)).success).toBe(false);
});
it("preserves explicit unknown/false and rejects oversized values", () => {
  expect(
    collectionControls.parse({
      year: "unknown",
      hasBox: "false",
      location: "unassigned",
    }),
  ).toMatchObject({ year: "unknown", hasBox: "false", location: "unassigned" });
  expect(collectionControls.safeParse({ hasBox: false }).success).toBe(false);
  expect(
    parseControls(new URLSearchParams({ platform: "a".repeat(2050) })).success,
  ).toBe(false);
  expect(
    collectionControls.safeParse({ platform: "a".repeat(161) }).success,
  ).toBe(false);
});
it.each(Object.keys(sortLabels))(
  "only serializes the fixed %s sort",
  (sort) => {
    const parsed = collectionControls.parse({ sort });
    expect(
      parseControls(new URLSearchParams(controlsQuery(parsed))),
    ).toMatchObject({ success: true, data: parsed });
  },
);
