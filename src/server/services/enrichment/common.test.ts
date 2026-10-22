import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({
  getDatabase: () => {
    throw new Error("Unit tests must not access a database.");
  },
}));
import { bounded, equal, failure, hash } from "./common";
import { EnrichmentError } from "./errors";
import { PermissionError } from "@/server/auth/permissions";

it("compares and hashes nested JSON independently of database object-key ordering", () => {
  const before = {
    name: "Manual title",
    source: { provider: "IGDB", id: "42" },
    entries: [{ name: "First", id: 1 }],
  };
  const reordered = {
    entries: [{ id: 1, name: "First" }],
    source: { id: "42", provider: "IGDB" },
    name: "Manual title",
  };
  const retained = structuredClone(before);
  expect(equal(before, reordered)).toBe(true);
  expect(hash(before)).toBe(hash(reordered));
  expect(before).toEqual(retained);
});
it("treats array order and meaningful scalar differences as changes", () => {
  expect(
    equal({ aliases: ["First", "Second"] }, { aliases: ["Second", "First"] }),
  ).toBe(false);
  expect(hash({ aliases: ["First", "Second"] })).not.toBe(
    hash({ aliases: ["Second", "First"] }),
  );
  for (const [left, right] of [
    [null, "null"],
    [0, "0"],
    [false, "false"],
    ["", null],
  ])
    expect(equal(left, right)).toBe(false);
  expect(equal("", "")).toBe(true);
  expect(hash({ name: "Manual title" })).not.toBe(
    hash({ name: "Changed title" }),
  );
});
it("bounds serialized UTF-8 bytes, including the exact limit and multibyte text", () => {
  expect(() => bounded("x", 3)).not.toThrow();
  expect(() => bounded("x", 2)).toThrow(EnrichmentError);
  expect(() => bounded("é", 4)).not.toThrow();
  expect(() => bounded("é", 3)).toThrow(EnrichmentError);
});
it("preserves expected domain/permission failures while redacting unexpected diagnostics", () => {
  for (const error of [
    new EnrichmentError("STALE"),
    new PermissionError("FORBIDDEN"),
  ]) {
    let caught: unknown;
    try {
      failure(error);
    } catch (value) {
      caught = value;
    }
    expect(caught).toBe(error);
  }
  expect(() => failure(new Error("postgresql://private/credentials"))).toThrow(
    "Enrichment is unavailable. Check its status before retrying.",
  );
  expect(() => failure(new Error("postgresql://private/credentials"))).toThrow(
    EnrichmentError,
  );
});
