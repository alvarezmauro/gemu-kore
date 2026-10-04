import { expect, it } from "vitest";
import { locationEntries, type LocationSummary } from "./contracts";
import { locationMutation } from "./validation";

const row = (
  id: string,
  parentId: string | null,
  sortOrder = 0,
): LocationSummary => ({
  id,
  parentId,
  name: id,
  sortOrder,
  type: "CUSTOM",
  description: null,
  updatedAt: "2026-10-04T00:00:00.000Z",
  childCount: 0,
  itemCount: 0,
});

it("derives sorted full breadcrumbs from unordered records without changing the input", () => {
  const input = [
    row("shelf", "cabinet"),
    row("office", "home"),
    row("cabinet", "office"),
    row("other", null, 1),
    row("home", null),
  ];
  const copy = structuredClone(input);
  const entries = locationEntries(input);
  expect(entries.map((entry) => entry.id)).toEqual([
    "home",
    "office",
    "cabinet",
    "shelf",
    "other",
  ]);
  expect(entries[3].path.map((part) => part.name)).toEqual([
    "home",
    "office",
    "cabinet",
    "shelf",
  ]);
  expect(entries[0]).toMatchObject({ canMoveUp: false, canMoveDown: true });
  expect(entries[4]).toMatchObject({ canMoveUp: true, canMoveDown: false });
  expect(input).toEqual(copy);
});
it("reflects renaming and moving ancestors without storing breadcrumb strings", () => {
  const rows = [
    row("home", null),
    { ...row("office", "home"), name: "Studio" },
    row("shelf", "office"),
    row("other", null),
  ];
  expect(
    locationEntries(rows)
      .find((entry) => entry.id === "shelf")
      ?.path.map((part) => part.name),
  ).toEqual(["home", "Studio", "shelf"]);
  rows[1].parentId = "other";
  expect(
    locationEntries(rows)
      .find((entry) => entry.id === "shelf")
      ?.path.map((part) => part.name),
  ).toEqual(["other", "Studio", "shelf"]);
});
it.each(
  [
    [row("orphan", "missing")],
    [row("same", null), row("same", null)],
    [row("a", "b"), row("b", "a")],
    [row("self", "self")],
  ].map((rows) => ({ rows })),
)("fails closed on malformed hierarchy %j", ({ rows }) => {
  expect(() => locationEntries(rows)).toThrow("Invalid location hierarchy.");
});
it("handles deeply nested locations without recursive stack overflow", () => {
  const rows = Array.from({ length: 1000 }, (_, index) =>
    row(String(index), index ? String(index - 1) : null),
  );
  expect(locationEntries(rows).at(-1)?.path).toHaveLength(1000);
});
const valid = {
  operation: "create",
  name: " Home ",
  type: "PROPERTY",
  parentId: null,
  description: " ",
};
it("trims names/descriptions and treats an empty description as absent", () => {
  expect(locationMutation.parse(valid)).toEqual({
    ...valid,
    name: "Home",
    description: null,
  });
});
it.each([
  { name: " " },
  { name: "x".repeat(201) },
  { type: "HOUSE" },
  { parentId: "bad" },
  { description: "x".repeat(2001) },
  { role: "ADMIN" },
  { sortOrder: -1 },
  { operation: "delete", id: "bad" },
])("rejects invalid and authority-bearing input %j", (change) => {
  expect(locationMutation.safeParse({ ...valid, ...change }).success).toBe(
    false,
  );
});
