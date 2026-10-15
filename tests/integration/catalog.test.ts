import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { requirePrivateAccess } from "@/server/auth/access";
import { getDatabase, disconnectDatabase } from "@/server/db/client";
import {
  saveCatalog,
  archiveCatalog,
  getCatalogManagement,
  lookupCatalog,
} from "@/server/services/catalog/management";
import * as repository from "@/server/repositories/catalog/management";
import type { AccessRole } from "@/features/auth/contracts";
import type { CatalogKind } from "@/features/catalog/contracts";
import { catalogInput } from "../helpers/catalog-input";
import { signedSessionCookie } from "../helpers/access-session";
const db = getDatabase();
const secret = "catalog-integration-secret-more-than-thirty-two-characters";
async function actor(role: AccessRole = "ADMIN") {
  const email = `${randomUUID()}@example.com`;
  const user = await db.user.create({
    data: { name: "Catalog test", email, emailVerified: true },
  });
  const session = await db.session.create({
    data: {
      userId: user.id,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  const grant = await db.accessGrant.create({
    data: { email, role, enabled: true },
  });
  const context = await requirePrivateAccess(
    new Headers({
      Cookie: `gemukore.session_token=${signedSessionCookie(session.token, secret)}`,
    }),
  );
  return { user, context, grant, session };
}
async function reset() {
  await db.$executeRaw`TRUNCATE TABLE company, region, console_platform, game, accessory CASCADE`;
  await db.accessGrant.deleteMany();
  await db.user.deleteMany();
}
beforeEach(async () => {
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3002");
  vi.stubEnv("BETTER_AUTH_SECRET", secret);
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
  vi.stubEnv("GITHUB_CLIENT_ID", "");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "");
  vi.restoreAllMocks();
  await reset();
});
afterAll(async () => {
  vi.restoreAllMocks();
  await reset();
  await disconnectDatabase();
  vi.unstubAllEnvs();
});
async function edit(
  context: Awaited<ReturnType<typeof actor>>["context"],
  kind: CatalogKind,
  id: string,
  changes: Record<string, unknown> = {},
) {
  const { selected } = await getCatalogManagement(context, { kind, id });
  return {
    kind,
    id,
    expectedRevision: selected!.revision,
    fields: {
      ...selected!.fields,
      ...(kind === "model"
        ? { regionIds: selected!.markets.map((m) => m.id) }
        : {}),
      ...changes,
    },
    references: selected!.references,
  };
}
it("starts with a bounded empty catalog and creates no fixtures", async () => {
  const { context } = await actor();
  const page = await getCatalogManagement(context, {});
  expect(page).toMatchObject({
    records: [],
    hasNext: false,
    selected: null,
    history: [],
    page: 1,
    kind: "platform",
  });
  expect(await db.collectionItem.count()).toBe(0);
});
it("creates all four concepts, records manual provenance and keeps markets separate from locks", async () => {
  const { context, user } = await actor();
  const companyId = await saveCatalog(
    context,
    catalogInput("company", { name: "Sony", slug: "sony", countryCode: "jp" }),
  );
  const market = await saveCatalog(
    context,
    catalogInput("region", { name: "Japan", slug: "japan" }),
  );
  const platformId = await saveCatalog(
    context,
    catalogInput("platform", {
      name: "PlayStation",
      slug: "playstation",
      manufacturerId: companyId,
    }),
  );
  const modelId = await saveCatalog(context, {
    ...catalogInput("model", {
      name: "SCPH-1000",
      slug: "scph-1000",
      platformId,
      regionIds: [market],
      regionLock: "UNRESTRICTED",
      widthMm: "270.125",
      specifications: '{"cpu":{"name":"R3000"}}',
    }),
    references: [
      {
        provider: " Wiki ",
        providerObjectType: "hardware",
        externalId: "1000",
        url: "HTTPS://EXAMPLE.COM:443/model#section",
      },
    ],
  });
  const { selected, history } = await getCatalogManagement(context, {
    kind: "model",
    id: modelId,
  });
  expect(selected).toMatchObject({
    revision: 1,
    manufacturer: null,
    fields: { platformId, regionLock: "UNRESTRICTED", widthMm: "270.125" },
    markets: [{ id: market, name: "Japan" }],
    references: [{ provider: "wiki", externalId: "1000" }],
  });
  expect(
    await db.consoleModel.findUniqueOrThrow({ where: { id: modelId } }),
  ).toMatchObject({
    manufacturerId: null,
    specifications: { schemaVersion: 1, data: { cpu: { name: "R3000" } } },
  });
  expect(await db.externalReference.findFirstOrThrow()).toMatchObject({
    consoleModelId: modelId,
    companyId: null,
    platformId: null,
    normalizedUrl: "https://example.com/model",
  });
  expect(
    history.some(
      (h) =>
        h.fieldPath === "regionIds" &&
        h.origin === "MANUAL" &&
        h.revision === 1,
    ),
  ).toBe(true);
  expect(
    await db.metadataChange.count({ where: { actorId: user.id } }),
  ).toBeGreaterThan(10);
  expect(await db.collectionItem.count()).toBe(0);
  expect(JSON.stringify(selected)).not.toMatch(
    /seedKey|storageNamespace|actorId|metadataChanges/,
  );
});
it.each(["EDITOR", "VIEWER"] as const)(
  "denies %s catalog reads, lookups, writes and archives",
  async (role) => {
    const { context } = await actor(role);
    for (const run of [
      () => getCatalogManagement(context, {}),
      () => lookupCatalog(context, { kind: "company", query: "" }),
      () => saveCatalog(context, catalogInput("company")),
      () =>
        archiveCatalog(context, {
          kind: "company",
          id: randomUUID(),
          expectedRevision: 1,
          archived: true,
        }),
    ])
      await expect(run()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await db.company.count()).toBe(0);
  },
);
it("rejects revoked and expired sessions from previously valid contexts", async () => {
  const { context, grant, session } = await actor();
  await db.accessGrant.update({
    where: { id: grant.id },
    data: { enabled: false },
  });
  await expect(
    saveCatalog(context, catalogInput("company")),
  ).rejects.toMatchObject({ code: "DENIED" });
  await db.accessGrant.update({
    where: { id: grant.id },
    data: { enabled: true },
  });
  await db.session.update({
    where: { id: session.id },
    data: { expiresAt: new Date(0) },
  });
  await expect(getCatalogManagement(context, {})).rejects.toMatchObject({
    code: "UNAUTHENTICATED",
  });
});
it("rechecks access after waiting for the catalog write lock", async () => {
  const { context, grant } = await actor();
  const lock = repository.lockCatalogWrites;
  vi.spyOn(repository, "lockCatalogWrites").mockImplementation(async (tx) => {
    await lock(tx);
    await db.accessGrant.update({
      where: { id: grant.id },
      data: { role: "VIEWER" },
    });
  });
  await expect(
    saveCatalog(context, catalogInput("company")),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await db.company.count()).toBe(0);
});
it("allows exactly one concurrent edit and audits only its applied fields", async () => {
  const { context } = await actor();
  const id = await saveCatalog(context, catalogInput("company"));
  const input = await edit(context, "company", id);
  const results = await Promise.allSettled([
    saveCatalog(context, {
      ...input,
      fields: { ...input.fields, name: "First" },
    }),
    saveCatalog(context, {
      ...input,
      fields: { ...input.fields, name: "Second" },
    }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { code: "STALE" },
  });
  const { selected, history } = await getCatalogManagement(context, {
    kind: "company",
    id,
  });
  expect(selected!.revision).toBe(2);
  expect(history.filter((h) => h.revision === 2)).toMatchObject([
    {
      fieldPath: "name",
      before: '"Test record"',
      after: JSON.stringify(selected!.name),
    },
  ]);
});
it("rolls back all fields, relationships and history when audit persistence fails", async () => {
  const { context } = await actor();
  const platformId = await saveCatalog(context, catalogInput("platform"));
  const regionId = await saveCatalog(context, catalogInput("region"));
  const id = await saveCatalog(context, catalogInput("model", { platformId }));
  const before = await getCatalogManagement(context, { kind: "model", id });
  vi.spyOn(repository, "appendCatalogHistory").mockRejectedValue(
    new Error("deliberate rollback"),
  );
  await expect(
    saveCatalog(context, {
      ...(await edit(context, "model", id, {
        name: "Changed",
        regionIds: [regionId],
      })),
      references: [
        {
          provider: "wiki",
          providerObjectType: "",
          externalId: "",
          url: "https://example.com/model",
        },
      ],
    }),
  ).rejects.toMatchObject({ code: "UNAVAILABLE" });
  expect(await getCatalogManagement(context, { kind: "model", id })).toEqual(
    before,
  );
  expect(await db.externalReference.count()).toBe(0);
});
it("preserves owned copies during canonical corrections, archive and restore", async () => {
  const { context } = await actor();
  const platformId = await saveCatalog(context, catalogInput("platform"));
  const id = await saveCatalog(context, catalogInput("model", { platformId }));
  const copy = await db.collectionItem.create({
    data: {
      type: "CONSOLE",
      notes: "Private notes",
      serialNumber: "Private serial",
      ownedConsole: { create: { consoleModelId: id } },
    },
  });
  await saveCatalog(
    context,
    await edit(context, "model", id, { name: "Correct identity" }),
  );
  await archiveCatalog(context, {
    kind: "model",
    id,
    expectedRevision: 2,
    archived: true,
  });
  expect(
    await db.collectionItem.findUniqueOrThrow({ where: { id: copy.id } }),
  ).toEqual(copy);
  expect(
    await db.ownedConsole.findUniqueOrThrow({
      where: { collectionItemId: copy.id },
    }),
  ).toMatchObject({ consoleModelId: id });
  expect(
    (await getCatalogManagement(context, { kind: "model" })).records,
  ).toHaveLength(0);
  expect(
    (
      await getCatalogManagement(context, {
        kind: "model",
        archived: "archived",
      })
    ).records,
  ).toHaveLength(1);
  await expect(
    saveCatalog(context, await edit(context, "model", id)),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await archiveCatalog(context, {
    kind: "model",
    id,
    expectedRevision: 3,
    archived: false,
  });
  expect(
    (await getCatalogManagement(context, { kind: "model", id })).selected,
  ).toMatchObject({ archived: false, revision: 4 });
});
it("rejects missing dependencies and new archived links but permits retained archived links", async () => {
  const { context } = await actor();
  await expect(
    saveCatalog(context, catalogInput("model", { platformId: randomUUID() })),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  const companyId = await saveCatalog(context, catalogInput("company"));
  const platformId = await saveCatalog(
    context,
    catalogInput("platform", { manufacturerId: companyId }),
  );
  const regionId = await saveCatalog(context, catalogInput("region"));
  const id = await saveCatalog(
    context,
    catalogInput("model", {
      platformId,
      manufacturerId: companyId,
      regionIds: [regionId],
    }),
  );
  for (const [kind, targetId] of [
    ["company", companyId],
    ["platform", platformId],
    ["region", regionId],
  ] as const)
    await archiveCatalog(context, {
      kind,
      id: targetId,
      expectedRevision: 1,
      archived: true,
    });
  await saveCatalog(
    context,
    await edit(context, "model", id, {
      description: "Correction while archived links remain",
    }),
  );
  await expect(
    saveCatalog(
      context,
      catalogInput("model", { slug: "another", platformId }),
    ),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    saveCatalog(
      context,
      catalogInput("platform", { slug: "another", manufacturerId: companyId }),
    ),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(await lookupCatalog(context, { kind: "company", query: "" })).toEqual(
    [],
  );
});
it("rejects duplicate slugs and market codes without partial history", async () => {
  const { context } = await actor();
  const id = await saveCatalog(context, catalogInput("region"));
  const history = await db.metadataChange.count();
  await expect(
    saveCatalog(context, catalogInput("region", { slug: "other" })),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    saveCatalog(context, catalogInput("region", { code: "NA" })),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(await db.metadataChange.count()).toBe(history);
  expect(await db.region.count()).toBe(1);
  expect(id).toBeTruthy();
});
it("keeps reference IDs and metadata on updates, supports swaps, and audits removals", async () => {
  const { context } = await actor();
  const id = await saveCatalog(context, {
    ...catalogInput("company"),
    references: ["1", "2"].map((externalId) => ({
      provider: "wiki",
      providerObjectType: "company",
      externalId,
      url: "",
    })),
  });
  const input = await edit(context, "company", id);
  const first = input.references[0];
  await db.externalReference.update({
    where: { id: first.id },
    data: { metadata: { schemaVersion: 1, data: { preserved: true } } },
  });
  await saveCatalog(context, {
    ...input,
    references: input.references.map((ref, i) => ({
      ...ref,
      externalId: input.references[1 - i].externalId,
    })),
  });
  expect(
    await db.externalReference.findUniqueOrThrow({ where: { id: first.id } }),
  ).toMatchObject({
    metadata: { schemaVersion: 1, data: { preserved: true } },
    externalId: input.references[1].externalId,
  });
  const next = await edit(context, "company", id);
  await saveCatalog(context, { ...next, references: [] });
  expect(await db.externalReference.count()).toBe(0);
  expect(
    await db.metadataChange.findFirstOrThrow({
      where: {
        companyId: id,
        rootRevision: 3,
        fieldPath: "externalReferences",
      },
    }),
  ).toMatchObject({ after: [] });
});
it("rejects a foreign reference ID and reference target injection", async () => {
  const { context } = await actor();
  const ref = {
    provider: "wiki",
    providerObjectType: "",
    externalId: "",
    url: "https://example.com/company",
  };
  const first = await saveCatalog(context, {
    ...catalogInput("company"),
    references: [ref],
  });
  const second = await saveCatalog(
    context,
    catalogInput("company", { slug: "second" }),
  );
  const input = await edit(context, "company", second);
  const refs = (
    await getCatalogManagement(context, { kind: "company", id: first })
  ).selected!.references;
  await expect(
    saveCatalog(context, { ...input, references: refs }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    saveCatalog(context, {
      ...input,
      references: [{ ...ref, companyId: first }],
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(await db.externalReference.count()).toBe(1);
});
it("bounds lists and lookups with stable paging, literal search and wrong-kind isolation", async () => {
  const { context } = await actor();
  await db.company.createMany({
    data: Array.from({ length: 53 }, (_, i) => ({
      name: i === 0 ? "Literal 100%_Maker" : "Same name",
      slug: `company-${i}`,
    })),
  });
  const first = await getCatalogManagement(context, { kind: "company" });
  const second = await getCatalogManagement(context, {
    kind: "company",
    page: "2",
  });
  const third = await getCatalogManagement(context, {
    kind: "company",
    page: "3",
  });
  expect(first.records).toHaveLength(25);
  expect(first.hasNext).toBe(true);
  expect(third.hasNext).toBe(false);
  expect(
    new Set(
      [...first.records, ...second.records, ...third.records].map((r) => r.id),
    ).size,
  ).toBe(53);
  expect(
    await lookupCatalog(context, { kind: "company", query: "100%_" }),
  ).toHaveLength(1);
  expect(
    await lookupCatalog(context, { kind: "company", query: "same" }),
  ).toHaveLength(25);
  await expect(
    getCatalogManagement(context, {
      kind: "platform",
      id: first.records[0].id,
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("shows bounded immutable provenance and never accepts client supplied seed keys", async () => {
  const { context } = await actor();
  const id = await saveCatalog(context, catalogInput("company"));
  await db.metadataChange.createMany({
    data: Array.from({ length: 55 }, (_, i) => ({
      companyId: id,
      rootRevision: i + 2,
      fieldPath: "name",
      before: "a",
      after: "b",
      origin: "SEED",
    })),
  });
  expect(
    (await getCatalogManagement(context, { kind: "company", id })).history,
  ).toHaveLength(50);
  await expect(
    saveCatalog(context, {
      ...(await edit(context, "company", id)),
      seedKey: "spoof",
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(
    (await db.company.findUniqueOrThrow({ where: { id } })).seedKey,
  ).toBeNull();
});
