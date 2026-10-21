import { randomUUID } from "node:crypto";
import { beforeEach, afterAll, expect, it, vi } from "vitest";
import { getDatabase, disconnectDatabase } from "@/server/db/client";
import { requirePrivateAccess } from "@/server/auth/access";
import {
  saveAccessoryCatalog,
  getAccessoryCatalog,
  archiveAccessoryCatalog,
  getAccessoryDomain,
  getAccessoryCompatibilityDraft,
} from "@/server/services/catalog/accessories";
import * as shared from "@/server/repositories/catalog/management";
import { lookupCatalog } from "@/server/services/catalog/management";
import { getOwnedAccessoryDomain } from "@/server/services/collection/accessories";
import { signedSessionCookie } from "../helpers/access-session";
import { accessoryInput, variantInput } from "../helpers/accessory-input";
const db = getDatabase(),
  secret = "accessory-integration-secret-longer-than-thirty-two";
async function actor(role: "ADMIN" | "EDITOR" | "VIEWER" = "ADMIN") {
  const email = `${randomUUID()}@example.com`;
  const user = await db.user.create({
    data: { name: "Curator", email, emailVerified: true },
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
  return { context, grant };
}
async function setup() {
  const admin = await actor();
  const company = await db.company.create({
    data: { name: "Producer", slug: randomUUID() },
  });
  const region = await db.region.create({
    data: { name: "North America", code: "NA", slug: randomUUID() },
  });
  const platforms = await Promise.all(
    ["PlayStation", "PlayStation 2"].map((name) =>
      db.consolePlatform.create({ data: { name, slug: randomUUID() } }),
    ),
  );
  const f = accessoryInput();
  const familyId = await saveAccessoryCatalog(admin.context, {
    ...f,
    fields: {
      ...f.fields,
      description: "Family description",
      specifications: '{"connection":"wired","buttons":12}',
      releaseYear: "2000",
      producerId: company.id,
      trailer: { provider: "YOUTUBE", id: "aqz-KE-bpKQ" },
    },
  });
  const input = variantInput(familyId);
  const variantId = await saveAccessoryCatalog(admin.context, {
    ...input,
    fields: {
      ...input.fields,
      regionIds: [region.id],
      platforms: platforms.map((p, i) => ({
        platformId: p.id,
        compatibilityNote: i ? "PS2 connector" : "Adapter required",
      })),
    },
  });
  return { ...admin, familyId, variantId, platforms, company, region, input };
}
async function selected(
  context: Awaited<ReturnType<typeof actor>>["context"],
  kind: "accessory" | "variant",
  id: string,
) {
  return (await getAccessoryCatalog(context, { kind, id })).selected!;
}
beforeEach(async () => {
  vi.restoreAllMocks();
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3002");
  vi.stubEnv("BETTER_AUTH_SECRET", secret);
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
  await db.$executeRaw`TRUNCATE TABLE company, region, console_platform, game, accessory, collection_item CASCADE`;
  await db.accessGrant.deleteMany();
  await db.user.deleteMany();
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await disconnectDatabase();
});
it("persists separate family/variant identities, explicit compatibility notes and commercial markets", async () => {
  const s = await setup();
  const v = await selected(s.context, "variant", s.variantId);
  expect(v).toMatchObject({
    kind: "variant",
    fields: {
      accessoryId: s.familyId,
      regionIds: [s.region.id],
      platforms: expect.arrayContaining([
        {
          platformId: s.platforms[0].id,
          compatibilityNote: "Adapter required",
        },
        { platformId: s.platforms[1].id, compatibilityNote: "PS2 connector" },
      ]),
    },
  });
  const family = await getAccessoryCatalog(s.context, {
    kind: "accessory",
    id: s.familyId,
  });
  expect(family.familyCompatibility.map((p) => p.id).sort()).toEqual(
    s.platforms.map((p) => p.id).sort(),
  );
  expect(family.history.some((h) => h.fieldPath === "specifications")).toBe(
    true,
  );
  expect(
    (
      await getAccessoryCatalog(s.context, { kind: "variant", id: s.variantId })
    ).history.some((h) => h.fieldPath === "platforms"),
  ).toBe(true);
  await saveAccessoryCatalog(s.context, {
    ...s.input,
    fields: { ...s.input.fields, slug: "same-name-different-identity" },
  });
  expect(await db.accessoryVariant.count()).toBe(2);
  expect(await db.ownedAccessory.count()).toBe(0);
  expect(JSON.stringify(v)).not.toMatch(
    /seedKey|normalizedValue|objectKey|sha256|trailerPublicApproved/,
  );
});
it("resolves whole-field family defaults and variant overrides without merging specifications or mixing video groups", async () => {
  const s = await setup(),
    reader = await actor("VIEWER");
  expect(
    await getAccessoryDomain(reader.context, { id: s.variantId }),
  ).toMatchObject({
    description: { value: "Family description", scope: "family" },
    specifications: {
      scope: "family",
      value: { schemaVersion: 1, data: { connection: "wired", buttons: 12 } },
    },
    video: {
      scope: "family",
      value: { provider: "YOUTUBE", id: "aqz-KE-bpKQ" },
    },
    producer: { scope: "family", value: { id: s.company.id } },
    releaseYear: { value: 2000, scope: "family" },
  });
  const v = await selected(s.context, "variant", s.variantId);
  if (v.kind !== "variant") throw Error();
  await saveAccessoryCatalog(s.context, {
    kind: "variant",
    id: v.id,
    expectedRevision: v.revision,
    fields: {
      ...v.fields,
      descriptionOverride: "Variant only",
      specificationsOverride: '{"buttons":14}',
      trailer: {
        provider: "DIRECT_URL",
        url: "https://example.com/video.mp4#position",
      },
      releaseYear: "2001",
    },
    references: [],
  });
  const result = await getAccessoryDomain(reader.context, { id: v.id });
  expect(result.specifications).toEqual({
    scope: "variant",
    value: { schemaVersion: 1, data: { buttons: 14 } },
  });
  expect(result.video).toEqual({
    scope: "variant",
    value: { provider: "DIRECT_URL", url: "https://example.com/video.mp4" },
  });
  expect(result.description).toEqual({
    scope: "variant",
    value: "Variant only",
  });
  expect(result.compatibility).toHaveLength(2);
  const updated = await selected(s.context, "variant", v.id);
  if (updated.kind !== "variant") throw Error();
  await saveAccessoryCatalog(s.context, {
    kind: "variant",
    id: v.id,
    expectedRevision: updated.revision,
    fields: { ...updated.fields, specificationsOverride: "", trailer: null },
    references: [],
  });
  expect(await getAccessoryDomain(reader.context, { id: v.id })).toMatchObject({
    specifications: { scope: "family" },
    video: { scope: "family" },
  });
});
it("copies compatibility only as an explicitly reviewed initial value with no ongoing inheritance", async () => {
  const s = await setup();
  const draft = await getAccessoryCompatibilityDraft(s.context, {
    accessoryId: s.familyId,
    sourceId: s.variantId,
  });
  const input = {
    ...s.input,
    fields: {
      ...s.input.fields,
      slug: "silver",
      name: "Silver",
      platforms: draft.platforms,
    },
    compatibilityCopy: {
      sourceId: draft.sourceId,
      sourceRevision: draft.sourceRevision,
      reviewed: true,
    },
  };
  await expect(
    saveAccessoryCatalog(s.context, {
      ...input,
      compatibilityCopy: { ...input.compatibilityCopy, reviewed: false },
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  const id = await saveAccessoryCatalog(s.context, input);
  const source = await selected(s.context, "variant", s.variantId);
  await saveAccessoryCatalog(s.context, {
    kind: "variant",
    id: source.id,
    expectedRevision: source.revision,
    fields: { ...source.fields, platforms: [] },
    references: [],
  });
  expect(
    (await getAccessoryDomain(s.context, { id })).compatibility,
  ).toHaveLength(2);
  expect(
    (await getAccessoryDomain(s.context, { id: source.id })).compatibility,
  ).toHaveLength(0);
  await expect(
    saveAccessoryCatalog(s.context, {
      ...input,
      fields: { ...input.fields, slug: "white" },
    }),
  ).rejects.toMatchObject({ code: "STALE" });
  const other = await saveAccessoryCatalog(s.context, {
    ...accessoryInput(),
    fields: { ...accessoryInput().fields, slug: "other-family" },
  });
  await expect(
    getAccessoryCompatibilityDraft(s.context, {
      accessoryId: other,
      sourceId: s.variantId,
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(await db.accessoryVariant.count()).toBe(2);
});
it("commits relation changes, references and manual history atomically and protects reference ownership", async () => {
  const s = await setup();
  const reference = {
    provider: "manual",
    providerObjectType: "product",
    externalId: "1",
    url: "https://example.com/product",
  };
  const f = await selected(s.context, "accessory", s.familyId);
  await saveAccessoryCatalog(s.context, {
    kind: "accessory",
    id: f.id,
    expectedRevision: f.revision,
    fields: f.fields,
    references: [reference],
  });
  const ref = await db.externalReference.findFirstOrThrow({
    where: { accessoryId: f.id },
  });
  const v = await selected(s.context, "variant", s.variantId);
  await expect(
    saveAccessoryCatalog(s.context, {
      kind: "variant",
      id: v.id,
      expectedRevision: v.revision,
      fields: { ...v.fields, platforms: [] },
      references: [{ ...reference, id: ref.id }],
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(
    (await getAccessoryDomain(s.context, { id: v.id })).compatibility,
  ).toHaveLength(2);
  vi.spyOn(shared, "appendCatalogHistory").mockRejectedValueOnce(
    new Error("Simulated history failure"),
  );
  await expect(
    saveAccessoryCatalog(s.context, {
      kind: "variant",
      id: v.id,
      expectedRevision: v.revision,
      fields: { ...v.fields, platforms: [] },
      references: [],
    }),
  ).rejects.toMatchObject({ code: "UNAVAILABLE" });
  expect((await selected(s.context, "variant", v.id)).revision).toBe(1);
  expect(
    (await getAccessoryDomain(s.context, { id: v.id })).compatibility,
  ).toHaveLength(2);
});
it.each(["EDITOR", "VIEWER"] as const)(
  "denies %s catalog reads, writes, lookups, copying and archives",
  async (role) => {
    const s = await setup(),
      reader = await actor(role);
    await expect(getAccessoryCatalog(reader.context, {})).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    );
    await expect(
      saveAccessoryCatalog(reader.context, accessoryInput()),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      lookupCatalog(reader.context, { kind: "accessory", query: "" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      getAccessoryCompatibilityDraft(reader.context, {
        accessoryId: s.familyId,
        sourceId: s.variantId,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      archiveAccessoryCatalog(reader.context, {
        kind: "variant",
        id: s.variantId,
        expectedRevision: 1,
        archived: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      (await getAccessoryDomain(reader.context, { id: s.variantId })).variant
        .id,
    ).toBe(s.variantId);
  },
);
it("rechecks revoked contexts and permissions after the catalog lock", async () => {
  const s = await setup();
  const lock = shared.lockCatalogWrites;
  vi.spyOn(shared, "lockCatalogWrites").mockImplementationOnce(async (tx) => {
    await lock(tx);
    await tx.accessGrant.update({
      where: { id: s.grant.id },
      data: { role: "VIEWER" },
    });
  });
  await expect(
    saveAccessoryCatalog(s.context, {
      ...accessoryInput(),
      fields: { ...accessoryInput().fields, slug: "denied" },
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await db.accessory.count()).toBe(1);
  await db.accessGrant.update({
    where: { id: s.grant.id },
    data: { enabled: false },
  });
  await expect(
    getAccessoryDomain(s.context, { id: s.variantId }),
  ).rejects.toMatchObject({ code: "DENIED" });
  await expect(getAccessoryCatalog(s.context, {})).rejects.toMatchObject({
    code: "DENIED",
  });
});
it("rejects concurrent stale saves without losing winning compatibility or duplicating history", async () => {
  const s = await setup();
  const v = await selected(s.context, "variant", s.variantId);
  const results = await Promise.allSettled(
    ["First", "Second"].map((name) =>
      saveAccessoryCatalog(s.context, {
        kind: "variant",
        id: v.id,
        expectedRevision: v.revision,
        fields: { ...v.fields, name },
        references: [],
      }),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { code: "STALE" },
  });
  expect((await selected(s.context, "variant", v.id)).revision).toBe(2);
  expect(
    await db.metadataChange.count({
      where: { accessoryVariantId: v.id, rootRevision: 2, fieldPath: "name" },
    }),
  ).toBe(1);
});
it("retains archived relations for existing variants, rejects new archived links and preserves compatibility until deliberately edited", async () => {
  const s = await setup();
  await db.consolePlatform.update({
    where: { id: s.platforms[0].id },
    data: { archivedAt: new Date() },
  });
  await db.region.update({
    where: { id: s.region.id },
    data: { archivedAt: new Date() },
  });
  await archiveAccessoryCatalog(s.context, {
    kind: "accessory",
    id: s.familyId,
    expectedRevision: 1,
    archived: true,
  });
  const v = await selected(s.context, "variant", s.variantId);
  await saveAccessoryCatalog(s.context, {
    kind: "variant",
    id: v.id,
    expectedRevision: v.revision,
    fields: { ...v.fields, color: "Black" },
    references: [],
  });
  await expect(
    saveAccessoryCatalog(s.context, {
      ...s.input,
      fields: { ...s.input.fields, slug: "new" },
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(
    (await getAccessoryDomain(s.context, { id: v.id })).compatibility,
  ).toHaveLength(2);
  await archiveAccessoryCatalog(s.context, {
    kind: "accessory",
    id: s.familyId,
    expectedRevision: 2,
    archived: false,
  });
  await expect(
    saveAccessoryCatalog(s.context, {
      ...s.input,
      fields: {
        ...s.input.fields,
        slug: "new",
        platforms: [{ platformId: s.platforms[0].id, compatibilityNote: "" }],
      },
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await archiveAccessoryCatalog(s.context, {
    kind: "variant",
    id: v.id,
    expectedRevision: 2,
    archived: true,
  });
  expect(
    (
      await getAccessoryCatalog(s.context, {
        kind: "accessory",
        id: s.familyId,
      })
    ).familyCompatibility,
  ).toHaveLength(0);
  expect(
    (await getAccessoryDomain(s.context, { id: v.id })).variant.archived,
  ).toBe(true);
  await expect(
    saveAccessoryCatalog(s.context, {
      kind: "variant",
      id: v.id,
      expectedRevision: 3,
      fields: v.fields,
      references: [],
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
it("keeps owned subtype identity independent and returns narrow authorized catalog resolution", async () => {
  const s = await setup();
  const copy = await db.collectionItem.create({
    data: {
      type: "ACCESSORY",
      serialNumber: "PRIVATE-SERIAL",
      notes: "PRIVATE-NOTES",
      ownedAccessory: { create: { accessoryVariantId: s.variantId } },
    },
  });
  const result = await getOwnedAccessoryDomain(s.context, { id: copy.id });
  expect(result.copy).toEqual({ id: copy.id, revision: 1 });
  expect(result.variant.id).toBe(s.variantId);
  expect(JSON.stringify(result)).not.toMatch(
    /PRIVATE-|metadataChanges|externalReferences|seedKey|sourceSnapshot/,
  );
  await expect(
    getOwnedAccessoryDomain(s.context, { id: s.variantId }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    db.accessoryVariant.delete({ where: { id: s.variantId } }),
  ).rejects.toThrow();
  await archiveAccessoryCatalog(s.context, {
    kind: "variant",
    id: s.variantId,
    expectedRevision: 1,
    archived: true,
  });
  expect(
    (await getOwnedAccessoryDomain(s.context, { id: copy.id })).variant
      .archived,
  ).toBe(true);
  await db.collectionItem.delete({ where: { id: copy.id } });
  expect(await db.accessoryVariant.count()).toBe(1);
  expect(await db.ownedAccessory.count()).toBe(0);
});
it("bounds catalog pages, union summaries and administrator lookup results", async () => {
  const s = await setup();
  await db.accessory.createMany({
    data: Array.from({ length: 26 }, (_, i) => ({
      name: `Family ${i}`,
      slug: `family-${i}`,
    })),
  });
  expect((await getAccessoryCatalog(s.context, {})).records).toHaveLength(25);
  expect((await getAccessoryCatalog(s.context, {})).hasNext).toBe(true);
  expect(
    (await getAccessoryCatalog(s.context, { page: 2 })).records,
  ).toHaveLength(2);
  expect(
    await lookupCatalog(s.context, { kind: "accessory", query: "Family" }),
  ).toHaveLength(25);
  expect(
    await lookupCatalog(s.context, {
      kind: "variant",
      query: "controller-black",
    }),
  ).toMatchObject([{ id: s.variantId, detail: "controller-black" }]);
  await db.accessory.createMany({
    data: [
      { name: "Literal%family", slug: "literal-one" },
      { name: "LiteralXfamily", slug: "literal-two" },
    ],
  });
  expect(
    await lookupCatalog(s.context, { kind: "accessory", query: "%" }),
  ).toMatchObject([{ name: "Literal%family" }]);
  const more = await db.consolePlatform.createManyAndReturn({
    data: Array.from({ length: 30 }, (_, i) => ({
      name: `Platform ${i}`,
      slug: `platform-${i}`,
    })),
  });
  await db.accessoryVariantPlatform.createMany({
    data: more.map((p) => ({
      accessoryVariantId: s.variantId,
      platformId: p.id,
    })),
  });
  const f = await getAccessoryCatalog(s.context, {
    kind: "accessory",
    id: s.familyId,
  });
  expect(f.familyCompatibility).toHaveLength(30);
  expect(f.moreFamilyCompatibility).toBe(true);
});
it("rejects Worldwide mixed with markets and stale archive revisions", async () => {
  const s = await setup();
  const world = await db.region.create({
    data: { name: "Worldwide", code: "WW", slug: "worldwide" },
  });
  await expect(
    saveAccessoryCatalog(s.context, {
      ...s.input,
      fields: {
        ...s.input.fields,
        slug: "bad-markets",
        regionIds: [world.id, s.region.id],
      },
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    archiveAccessoryCatalog(s.context, {
      kind: "variant",
      id: s.variantId,
      expectedRevision: 99,
      archived: true,
    }),
  ).rejects.toMatchObject({ code: "STALE" });
  expect((await selected(s.context, "variant", s.variantId)).archived).toBe(
    false,
  );
});
it("enforces structured video groups in PostgreSQL and resets approval only when the video changes", async () => {
  const s = await setup();
  await expect(
    db.$executeRaw`UPDATE accessory SET "trailerProvider" = NULL WHERE id = ${s.familyId}::uuid`,
  ).rejects.toThrow();
  await expect(
    db.$executeRaw`UPDATE accessory_variant SET "trailerPublicApproved" = true WHERE id = ${s.variantId}::uuid`,
  ).rejects.toThrow();
  await db.accessory.update({
    where: { id: s.familyId },
    data: { trailerPublicApproved: true },
  });
  const f = await selected(s.context, "accessory", s.familyId);
  await saveAccessoryCatalog(s.context, {
    kind: "accessory",
    id: f.id,
    expectedRevision: f.revision,
    fields: { ...f.fields, name: "Renamed family" },
    references: [],
  });
  expect(
    (await db.accessory.findUniqueOrThrow({ where: { id: f.id } }))
      .trailerPublicApproved,
  ).toBe(true);
  await saveAccessoryCatalog(s.context, {
    kind: "accessory",
    id: f.id,
    expectedRevision: 2,
    fields: { ...f.fields, trailer: null },
    references: [],
  });
  expect(
    await db.accessory.findUniqueOrThrow({ where: { id: f.id } }),
  ).toMatchObject({
    trailerProvider: null,
    trailerId: null,
    trailerUrl: null,
    trailerPublicApproved: false,
  });
});
