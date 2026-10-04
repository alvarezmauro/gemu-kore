import { expect, it } from "vitest";
import { canPerform, isFreshLogin, permissions } from "./permissions";

// Explicit expectations make adding a permission require a policy decision.
const matrix = [
  ["private.read", true, true, true],
  ["collection.manage", true, true, false],
  ["media.manage", true, true, false],
  ["enrichment.suggest", true, true, false],
  ["catalog.manage", true, false, false],
  ["enrichment.accept", true, false, false],
  ["publication.manage", true, false, false],
  ["settings.manage", true, false, false],
  ["access.read", true, false, false],
  ["access.manage", true, false, false],
] as const;

it("covers every declared permission explicitly", () => {
  expect(matrix.map(([permission]) => permission)).toEqual(permissions);
});

it.each(matrix)(
  "enforces %s for admin/editor/viewer",
  (permission, admin, editor, viewer) => {
    expect(canPerform("ADMIN", permission)).toBe(admin);
    expect(canPerform("EDITOR", permission)).toBe(editor);
    expect(canPerform("VIEWER", permission)).toBe(viewer);
  },
);

it.each([null, undefined, "admin", "OWNER", "__proto__", { role: "ADMIN" }])(
  "rejects unknown role %j",
  (role) => expect(canPerform(role, "private.read")).toBe(false),
);
it.each([
  null,
  undefined,
  "*",
  "constructor",
  "catalog.delete",
  { permission: "private.read" },
])("rejects unknown permission %j even for admin", (permission) =>
  expect(canPerform("ADMIN", permission)).toBe(false),
);

it.each([
  [0, true],
  [299999, true],
  [300000, true],
  [300001, false],
  [-1, false],
  [Number.NaN, false],
])(
  "requires session creation within five minutes (age %s)",
  (age, expected) => {
    const now = new Date("2026-10-04T12:00:00Z");
    expect(isFreshLogin(new Date(now.getTime() - age), now)).toBe(expected);
  },
);
