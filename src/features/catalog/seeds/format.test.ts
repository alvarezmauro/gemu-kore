import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { loadConsoleSeeds } from "../../../../scripts/console-seeds/load";
import { catalogSave } from "../validation";
import { consoleSeedFiles, consoleSeedSchema } from "./format";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const directory = join(root, "prisma/seed-data");
const tsxLoader = createRequire(import.meta.url).resolve("tsx");
const starter = await loadConsoleSeeds(directory);
const fresh = () => structuredClone(starter);
const curation = { sources: [], note: "Synthetic test vocabulary." };
const reference = {
  provider: "test",
  providerObjectType: "hardware",
  externalId: "1",
};

it("validates the small committed dataset and preserves explicit unknowns without defaults", () => {
  expect(starter.companies).toHaveLength(1);
  expect(starter.regions).toHaveLength(1);
  expect(starter.platforms).toHaveLength(1);
  expect(starter.models).toHaveLength(1);
  expect(starter.models[0]).toMatchObject({
    seedKey: "model:sony.playstation.scph-1000",
    platformSeedKey: starter.platforms[0].seedKey,
    regionSeedKeys: [starter.regions[0].seedKey],
    identificationStatus: "INCOMPLETE",
  });
  for (const key of [
    "manufacturerSeedKey",
    "widthMm",
    "regionLock",
    "specifications",
    "discontinuedYear",
  ])
    expect(starter.models[0]).not.toHaveProperty(key);
  const data = fresh();
  data.models[0].manufacturerSeedKey = null;
  data.models[0].regionLock = null;
  expect(consoleSeedSchema.parse(data).models[0]).toMatchObject({
    manufacturerSeedKey: null,
    regionLock: null,
  });
});
it("accepts an empty valid dataset for authoring without inventing fixtures", () => {
  expect(
    consoleSeedSchema.parse({
      schemaVersion: 1,
      companies: [],
      regions: [],
      platforms: [],
      models: [],
    }).models,
  ).toEqual([]);
});
it.each(["companies", "regions", "platforms", "models"] as const)(
  "rejects duplicate stable keys and slugs within %s",
  (category) => {
    const data = fresh();
    data[category].push(structuredClone(data[category][0]) as never);
    const result = consoleSeedSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.map((issue) => issue.path.at(-1))).toEqual(
        expect.arrayContaining(["seedKey", "slug"]),
      );
  },
);
it("keeps seed keys independent of mutable slugs and permits duplicate display names and model numbers", () => {
  const data = fresh();
  const original = data.models[0];
  data.models.push({
    ...original,
    seedKey: "model:sony.playstation.other",
    slug: "other-hardware",
  });
  data.platforms[0].slug = "original-playstation";
  expect(consoleSeedSchema.safeParse(data).success).toBe(true);
  expect(data.models[0].platformSeedKey).toBe(starter.platforms[0].seedKey);
});
it.each([
  "id",
  "revision",
  "seedRevision",
  "actorId",
  "archivedAt",
  "serialNumber",
  "notes",
  "storageKey",
  "published",
  "ownedConsole",
  "seedPolicy",
])("rejects the unapproved field %s", (field) => {
  const data = fresh();
  Object.assign(data.models[0], { [field]: "injected" });
  expect(consoleSeedSchema.safeParse(data).success).toBe(false);
});
it.each(["manufacturerSeedKey", "platformSeedKey"] as const)(
  "rejects unresolved or wrong-kind %s relationships",
  (field) => {
    const data = fresh();
    data.models[0][field] =
      field === "platformSeedKey" ? "platform:missing" : "company:missing";
    expect(consoleSeedSchema.safeParse(data).success).toBe(false);
    data.models[0][field] = "region:jp";
    expect(consoleSeedSchema.safeParse(data).success).toBe(false);
  },
);
it("rejects unresolved platform companies, missing markets and duplicate market codes", () => {
  let data = fresh();
  data.platforms[0].manufacturerSeedKey = "company:missing";
  expect(consoleSeedSchema.safeParse(data).success).toBe(false);
  data = fresh();
  data.models[0].regionSeedKeys = ["region:missing"];
  expect(consoleSeedSchema.safeParse(data).success).toBe(false);
  data = fresh();
  data.regions.push({
    ...data.regions[0],
    seedKey: "region:other",
    slug: "other",
  });
  expect(consoleSeedSchema.safeParse(data).success).toBe(false);
});
it.each(["PAL", "NTSC", "SECAM", "REGION-FREE", "RF"])(
  "rejects %s as a market code",
  (code) => {
    const data = fresh();
    data.regions[0].code = code;
    expect(consoleSeedSchema.safeParse(data).success).toBe(false);
  },
);
it("keeps unknown markets, region locking and explicit Worldwide coverage separate", () => {
  const data = fresh();
  data.models[0].regionSeedKeys = [];
  data.models[0].regionLock = "UNRESTRICTED";
  expect(consoleSeedSchema.parse(data).models[0].regionSeedKeys).toEqual([]);
  data.regions.push({
    seedKey: "region:worldwide",
    name: "Worldwide",
    slug: "worldwide",
    code: "WW",
    provenance: curation,
  });
  data.models[0].regionSeedKeys = ["region:worldwide"];
  expect(consoleSeedSchema.safeParse(data).success).toBe(true);
  data.models[0].regionSeedKeys.push("region:jp");
  expect(consoleSeedSchema.safeParse(data).success).toBe(false);
  data.models[0].regionSeedKeys = ["region:jp", "region:jp"];
  expect(consoleSeedSchema.safeParse(data).success).toBe(false);
});
it.each([
  { releaseYear: 0 },
  { releaseYear: "1994" },
  { releaseYear: 10000 },
  { releaseYear: 2000, discontinuedYear: 1999 },
  { widthMm: "0" },
  { widthMm: 270.125 },
  { widthMm: "-1" },
  { widthMm: "1.0001" },
  { widthMm: "10000000" },
  { weightGrams: "1000000000" },
  { identificationStatus: "ASSUMED" },
  { regionLock: "REGION_FREE" },
  { modelNumber: "" },
])("rejects invalid typed facts %j", (fields) => {
  const data = fresh();
  Object.assign(data.models[0], fields);
  expect(consoleSeedSchema.safeParse(data).success).toBe(false);
});
it("validates platform chronology and bounded aliases without deducing a model manufacturer", () => {
  const data = fresh();
  data.platforms[0].discontinuedYear = 1993;
  expect(consoleSeedSchema.safeParse(data).success).toBe(false);
  data.platforms[0].discontinuedYear = null;
  data.platforms[0].aliases = ["PS", " PS "];
  expect(consoleSeedSchema.safeParse(data).success).toBe(false);
  data.platforms[0].aliases = ["PS"];
  expect(consoleSeedSchema.parse(data).models[0]).not.toHaveProperty(
    "manufacturerSeedKey",
  );
});
it("accepts bounded versioned specifications and exact decimal strings", () => {
  const data = fresh();
  data.models[0].specifications = {
    schemaVersion: 1,
    data: { cpu: { name: "Synthetic CPU" }, videoOutputs: ["composite"] },
  };
  data.models[0].widthMm = "270.125";
  data.models[0].weightGrams = "999999999.999";
  expect(consoleSeedSchema.parse(data).models[0]).toMatchObject({
    widthMm: "270.125",
    weightGrams: "999999999.999",
  });
});
it.each([
  [],
  { cpu: {} },
  { schemaVersion: 2, data: {} },
  { schemaVersion: 1, data: [] },
  { schemaVersion: 1, data: { value: "x".repeat(16000) } },
  { schemaVersion: 1, data: { ports: Array(201).fill("port") } },
  { schemaVersion: 1, data: JSON.parse('{"__proto__":{}}') },
  { schemaVersion: 1, data: { invalid: Number.POSITIVE_INFINITY } },
])("rejects invalid JSON specifications %j", (specifications) => {
  const data = fresh();
  Object.assign(data.models[0], { specifications });
  expect(consoleSeedSchema.safeParse(data).success).toBe(false);
});
it("rejects deeply nested specifications and missing provenance", () => {
  const data = fresh();
  let nested: object = {};
  for (let i = 0; i < 12; i++) nested = { nested };
  data.models[0].specifications = {
    schemaVersion: 1,
    data: nested as Record<string, unknown>,
  };
  expect(consoleSeedSchema.safeParse(data).success).toBe(false);
  delete data.models[0].specifications;
  data.models[0].provenance = { sources: [] };
  expect(consoleSeedSchema.safeParse(data).success).toBe(false);
});
it("validates actual calendar source dates and accepts a curation note for controlled vocabulary", () => {
  const data = fresh();
  data.models[0].provenance.sources[0].checkedOn = "2026-02-29";
  expect(consoleSeedSchema.safeParse(data).success).toBe(false);
  data.models[0].provenance.sources[0].checkedOn = "2024-02-29";
  expect(consoleSeedSchema.safeParse(data).success).toBe(true);
  expect(data.regions[0].provenance.sources).toHaveLength(0);
});
it.each([
  { provider: "test" },
  { ...reference, providerObjectType: null },
  { ...reference, companyId: "injected" },
  { provider: "test", url: "javascript:alert(1)" },
  { provider: "test", url: "file:///tmp/test" },
  { provider: "test", url: "https://user:password@example.com" },
  { provider: "test", url: "invalid" },
  { ...reference, metadata: { arbitrary: true } },
  { ...reference, provider: "MixedCase" },
])("rejects invalid or mis-scoped references %j", (ref) => {
  const data = fresh();
  Object.assign(data.models[0], { references: [ref] });
  expect(() => consoleSeedSchema.safeParse(data)).not.toThrow();
  expect(consoleSeedSchema.safeParse(data).success).toBe(false);
});
it("allows reference identities across targets but rejects normalized duplicates on one target", () => {
  const data = fresh();
  data.companies[0].references = [reference];
  data.models[0].references = [reference];
  expect(consoleSeedSchema.safeParse(data).success).toBe(true);
  data.models[0].references = [
    { provider: "test", url: "HTTPS://EXAMPLE.COM:443/model#one" },
    { provider: "test", url: "https://example.com/model#two" },
  ];
  expect(consoleSeedSchema.safeParse(data).success).toBe(false);
  Object.assign(data.regions[0], { references: [reference] });
  expect(consoleSeedSchema.safeParse(data).success).toBe(false);
});
it("rejects unknown format versions, missing groups, excessive record counts and private top-level data", () => {
  expect(
    consoleSeedSchema.safeParse({ ...starter, schemaVersion: 2 }).success,
  ).toBe(false);
  expect(consoleSeedSchema.safeParse({ schemaVersion: 1 }).success).toBe(false);
  expect(
    consoleSeedSchema.safeParse({ ...starter, collectionItems: [] }).success,
  ).toBe(false);
  expect(
    consoleSeedSchema.safeParse({
      ...starter,
      companies: Array(2001).fill(starter.companies[0]),
    }).success,
  ).toBe(false);
});
it("keeps starter facts compatible with the existing catalog service input contract", () => {
  const uuid = "11111111-1111-4111-8111-111111111111";
  for (const [kind, records] of [
    ["company", starter.companies],
    ["region", starter.regions],
    ["platform", starter.platforms],
    ["model", starter.models],
  ] as const)
    for (const record of records) {
      const fields: Record<string, unknown> = {
        name: record.name,
        slug: record.slug,
        description: record.description ?? "",
      };
      const strings =
        kind === "company"
          ? ["countryCode", "foundedYear", "website"]
          : kind === "platform"
            ? [
                "generation",
                "originalReleaseYear",
                "discontinuedYear",
                "history",
              ]
            : kind === "model"
              ? [
                  "modelNumber",
                  "releaseYear",
                  "discontinuedYear",
                  "widthMm",
                  "heightMm",
                  "depthMm",
                  "weightGrams",
                  "regionLock",
                  "regionLockNote",
                ]
              : ["code"];
      for (const field of strings)
        fields[field] = String(Reflect.get(record, field) ?? "");
      if (kind === "company" || kind === "platform")
        fields.aliases =
          "aliases" in record ? (record.aliases?.join("\n") ?? "") : "";
      if (kind === "model" || kind === "platform")
        fields.manufacturerId =
          "manufacturerSeedKey" in record && record.manufacturerSeedKey
            ? uuid
            : "";
      if (kind === "model" && "platformSeedKey" in record)
        Object.assign(fields, {
          platformId: uuid,
          regionIds: (record.regionSeedKeys ?? []).map(() => uuid),
          identificationStatus: record.identificationStatus,
          specifications: record.specifications
            ? JSON.stringify(record.specifications.data)
            : "",
        });
      expect(
        catalogSave.safeParse({
          kind,
          fields,
          references:
            "references" in record
              ? (record.references ?? []).map((ref) => ({
                  provider: ref.provider,
                  providerObjectType: ref.providerObjectType ?? "",
                  externalId: ref.externalId ?? "",
                  url: ref.url ?? "",
                }))
              : [],
        }).success,
      ).toBe(true);
    }
});
it("checks the fixed files offline, deterministically, without changing inputs or loading database configuration", async () => {
  const digest = async () =>
    Promise.all(
      consoleSeedFiles.map(async (file) =>
        createHash("sha256")
          .update(await readFile(join(directory, file.path)))
          .digest("hex"),
      ),
    );
  const before = await digest();
  const run = () =>
    execFileSync(
      process.execPath,
      ["--import", tsxLoader, join(root, "scripts/check-console-seeds.ts")],
      {
        cwd: tmpdir(),
        env: {
          ...process.env,
          DATABASE_URL: "deliberately-invalid-and-offline",
        },
        encoding: "utf8",
        timeout: 10000,
      },
    );
  const first = run();
  expect(first).toContain("1 platforms, 1 models. No database changes.");
  expect(run()).toBe(first);
  expect(await digest()).toEqual(before);
  const invalid = spawnSync(
    process.execPath,
    [
      "--import",
      tsxLoader,
      join(root, "scripts/check-console-seeds.ts"),
      "--apply",
    ],
    { cwd: root, encoding: "utf8", timeout: 10000 },
  );
  expect(invalid.status).toBe(1);
  expect(invalid.stderr).toContain("accepts no arguments");
});
it("rejects wrong file categories, invalid JSON, missing files and oversized input with useful locations", async () => {
  const temp = await mkdtemp(join(tmpdir(), "gemukore-seed-format-"));
  try {
    for (const file of consoleSeedFiles) {
      await mkdir(dirname(join(temp, file.path)), { recursive: true });
      await writeFile(
        join(temp, file.path),
        await readFile(join(directory, file.path)),
      );
    }
    const path = join(temp, consoleSeedFiles[0].path);
    const original = await readFile(path);
    await writeFile(
      path,
      await readFile(join(directory, "regions/regions.json")),
    );
    await expect(loadConsoleSeeds(temp)).rejects.toThrow(
      "companies/companies.json",
    );
    await writeFile(path, "{broken");
    await expect(loadConsoleSeeds(temp)).rejects.toThrow("invalid JSON");
    await writeFile(path, " ".repeat(2 * 1024 * 1024 + 1));
    await expect(loadConsoleSeeds(temp)).rejects.toThrow("exceeds 2 MiB");
    await writeFile(path, original);
    await rm(join(temp, "consoles/models.json"));
    await expect(loadConsoleSeeds(temp)).rejects.toThrow();
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
