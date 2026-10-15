import { expect, it } from "vitest";
import {
  catalogSave,
  catalogArchive,
  catalogPage,
  catalogLookup,
  normalizedWebUrl,
} from "./validation";
import { catalogInput } from "../../../tests/helpers/catalog-input";
it.each(["company", "region", "platform", "model"] as const)(
  "accepts a minimal %s without inventing unknown facts",
  (kind) => {
    const parsed = catalogSave.parse(catalogInput(kind));
    expect(parsed.fields.description).toBeNull();
    if (parsed.kind === "model") {
      expect(parsed.fields.regionIds).toEqual([]);
      expect(parsed.fields.regionLock).toBeNull();
      expect(parsed.fields.manufacturerId).toBeNull();
    }
  },
);
it.each([
  ["company", { countryCode: "Japan" }],
  ["company", { foundedYear: "0" }],
  ["company", { website: "javascript:alert(1)" }],
  ["platform", { originalReleaseYear: "2000", discontinuedYear: "1999" }],
  ["platform", { generation: "0" }],
  ["model", { releaseYear: "2000", discontinuedYear: "1999" }],
  ["model", { widthMm: "0" }],
  ["model", { widthMm: "1.0001" }],
  ["model", { widthMm: "10000000" }],
  ["model", { weightGrams: "1000000000" }],
  ["model", { specifications: "[]" }],
  ["model", { specifications: '{"schemaVersion":1,"data":{}}' }],
  ["model", { specifications: '{"__proto__":{}}' }],
  ["model", { identificationStatus: "ASSUMED" }],
  ["region", { code: "PAL" }],
  ["region", { name: "Region Free" }],
] as const)("rejects invalid %s details %j", (kind, fields) =>
  expect(catalogSave.safeParse(catalogInput(kind, fields)).success).toBe(false),
);
it("wraps flexible specs, preserves measured precision and deduplicates aliases", () => {
  const result = catalogSave.parse(
    catalogInput("model", {
      specifications: '{"cpu":{"name":"R3000"}}',
      widthMm: "270.125",
      weightGrams: "999999999.999",
    }),
  );
  if (result.kind !== "model") throw new Error();
  expect(result.fields.specifications).toEqual({
    schemaVersion: 1,
    data: { cpu: { name: "R3000" } },
  });
  expect(result.fields.widthMm).toBe("270.125");
  expect(result.fields.weightGrams).toBe("999999999.999");
  expect(
    catalogSave.parse(
      catalogInput("company", {
        aliases: "Sony\n Sony \nSCE\n",
        countryCode: "jp",
      }),
    ).fields,
  ).toMatchObject({ aliases: ["Sony", "SCE"], countryCode: "JP" });
});
it.each([
  {},
  { seedKey: "seed" },
  { revision: 20 },
  { createdById: "actor" },
  { archivedAt: new Date() },
  { companyId: "id" },
])("rejects field or root injection %j", (extra) => {
  const input = catalogInput("company");
  if (!Object.keys(extra).length) input.fields.unknown = "injected";
  expect(catalogSave.safeParse({ ...input, ...extra }).success).toBe(false);
});
it.each([
  "",
  "not-a-url",
  "javascript:alert(1)",
  "https://user:password@example.com",
  "file:///tmp/a",
])("rejects invalid references safely: %s", (url) => {
  const input = {
    ...catalogInput("company"),
    references: [
      { provider: "wiki", providerObjectType: "", externalId: "", url },
    ],
  };
  expect(() => catalogSave.safeParse(input)).not.toThrow();
  expect(catalogSave.safeParse(input).success).toBe(false);
});
it("requires typed IDs, disallows region targets and detects normalized duplicate links", () => {
  const ref = {
    provider: " Wiki ",
    providerObjectType: "",
    externalId: "",
    url: "HTTPS://EXAMPLE.COM:443/a#one",
  };
  expect(
    catalogSave.safeParse({
      ...catalogInput("company"),
      references: [{ ...ref, url: "", externalId: "1" }],
    }).success,
  ).toBe(false);
  expect(
    catalogSave.safeParse({ ...catalogInput("region"), references: [ref] })
      .success,
  ).toBe(false);
  expect(
    catalogSave.safeParse({
      ...catalogInput("company"),
      references: [ref, { ...ref, url: "https://example.com/a#two" }],
    }).success,
  ).toBe(false);
  expect(normalizedWebUrl(ref.url)).toBe("https://example.com/a");
  expect(normalizedWebUrl("https://example.com/Case?x=2&x=1")).toBe(
    "https://example.com/Case?x=2&x=1",
  );
});
it("bounds requests and requires revisions for edits", () => {
  expect(catalogPage.parse({})).toEqual({
    kind: "platform",
    page: 1,
    archived: "active",
  });
  expect(catalogPage.safeParse({ page: "10000" }).success).toBe(false);
  expect(catalogPage.safeParse({ kind: ["model", "company"] }).success).toBe(
    false,
  );
  expect(catalogLookup.safeParse({ kind: "game", query: "" }).success).toBe(
    false,
  );
  const id = "11111111-1111-4111-8111-111111111111";
  expect(
    catalogSave.safeParse({ ...catalogInput("company"), id }).success,
  ).toBe(false);
  expect(
    catalogSave.safeParse({ ...catalogInput("company"), expectedRevision: 1 })
      .success,
  ).toBe(false);
  expect(
    catalogArchive.safeParse({
      kind: "company",
      id,
      expectedRevision: 0,
      archived: true,
    }).success,
  ).toBe(false);
});
