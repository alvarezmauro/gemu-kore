import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { requirePrivateAccess } from "@/server/auth/access";
import { getDatabase, disconnectDatabase } from "@/server/db/client";
import type { AccessRole } from "@/features/auth/contracts";
import { signedSessionCookie } from "../helpers/access-session";
import { emptyCopyPhysical } from "@/features/collection/copy-validation";
import {
  createAccessoryCopy,
  getAccessoryCreation,
  findAccessories,
  findAccessoryVariants,
  refreshAccessorySelection,
  getOwnedAccessoryCopy,
  mutateAccessoryCopy,
} from "@/server/services/collection/accessory-copies";
import * as repository from "@/server/repositories/collection/accessory-copies";
import * as catalog from "@/server/repositories/catalog/management";
const db = getDatabase();
const secret = "game-creation-test-secret-longer-than-thirty-two-characters";
async function actor(role: AccessRole = "EDITOR") {
  const email = `${randomUUID()}@example.com`;
  const user = await db.user.create({
    data: { name: "Accessory fixture", email, emailVerified: true },
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
  return { user, session, grant, context };
}
async function reset() {
  await db.$executeRaw`TRUNCATE TABLE asset, location, company, region, console_platform, game, collection_item, accessory CASCADE`;
  await db.accessGrant.deleteMany();
  await db.user.deleteMany();
}
beforeEach(async () => {
  vi.restoreAllMocks();
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3002");
  vi.stubEnv("BETTER_AUTH_SECRET", secret);
  vi.stubEnv("GOOGLE_CLIENT_ID", "fixture");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "fixture");
  vi.stubEnv("GITHUB_CLIENT_ID", "");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "");
  await reset();
});
afterAll(async () => {
  vi.restoreAllMocks();
  await reset();
  await disconnectDatabase();
  vi.unstubAllEnvs();
});
async function identity() {
  const producer = await db.company.create({
    data: { name: "Sony", slug: randomUUID() },
  });
  const platform = await db.consolePlatform.create({
    data: { name: "PlayStation 2", slug: randomUUID() },
  });
  const region = await db.region.create({
    data: { name: "North America", slug: randomUUID(), code: randomUUID() },
  });
  const family = await db.accessory.create({
    data: {
      name: "DualShock 2",
      slug: randomUUID(),
      producerId: producer.id,
      releaseYear: 2000,
    },
  });
  const variant = await db.accessoryVariant.create({
    data: {
      accessoryId: family.id,
      name: "Black",
      slug: randomUUID(),
      modelNumber: "SCPH-10010",
      color: "Black",
      platforms: {
        create: {
          platformId: platform.id,
          compatibilityNote: "Analog support varies by game",
        },
      },
      regions: { create: { regionId: region.id } },
    },
  });
  const input = {
    ...emptyCopyPhysical,
    id: randomUUID(),
    accessoryId: family.id,
    accessoryRevision: 1,
    variantId: variant.id,
    variantRevision: 1,
  };
  return { family, variant, platform, region, producer, input };
}
async function copy() {
  const user = await actor();
  const data = await identity();
  const input = {
    ...data.input,
    notes: "Original notes",
    defects: [
      {
        title: "Cable wear",
        description: "Near plug",
        severity: "MINOR" as const,
      },
    ],
  };
  const id = await createAccessoryCopy(user.context, input);
  const { defects, ...fields } = input;
  void defects;
  return {
    ...user,
    ...data,
    input,
    id,
    update: { ...fields, operation: "update", expectedRevision: 1 },
  };
}
async function model(id: string, primary = false) {
  const asset = await db.asset.create({
    data: {
      kind: "MODEL_3D",
      scope: "COLLECTION",
      state: "READY",
      storageNamespace: "test",
      objectKey: randomUUID(),
      originalFilename: "Synthetic.glb",
      mimeType: "model/gltf-binary",
      sizeBytes: 100,
      sha256: "a".repeat(64),
    },
  });
  return db.collectionItemMedia.create({
    data: {
      collectionItemId: id,
      type: "CUSTOM_MODEL",
      assetId: asset.id,
      isPrimary: primary,
    },
  });
}
it("loads an empty form and restricts choices to collection managers", async () => {
  const editor = await actor();
  expect(await getAccessoryCreation(editor.context)).toEqual({
    accessories: { items: [], hasMore: false, page: 0 },
    locations: [],
    canManageCatalog: false,
  });
  const viewer = await actor("VIEWER");
  await expect(findAccessories(viewer.context, {})).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
it("returns literal, stable bounded family and variant choices, including unknown compatibility and markets", async () => {
  const { context } = await actor();
  const d = await identity();
  await db.accessory.createMany({
    data: Array.from({ length: 29 }, (_, i) => ({
      name: `Controller ${String(i).padStart(2, "0")}`,
      slug: randomUUID(),
    })),
  });
  const first = await findAccessories(context, { query: "Controller" }),
    second = await findAccessories(context, { query: "Controller", page: 1 });
  expect(first.items).toHaveLength(25);
  expect(first.hasMore).toBe(true);
  expect(second.items).toHaveLength(4);
  expect(new Set([...first.items, ...second.items].map((x) => x.id)).size).toBe(
    29,
  );
  expect((await findAccessories(context, { query: "%" })).items).toEqual([]);
  await db.accessoryVariant.create({
    data: {
      accessoryId: d.family.id,
      name: "Unidentified",
      slug: randomUUID(),
    },
  });
  expect(
    await refreshAccessorySelection(context, {
      accessoryId: d.family.id,
      variantId: d.variant.id,
    }),
  ).toMatchObject({
    accessory: { id: d.family.id, revision: 1 },
    variant: { id: d.variant.id, revision: 1 },
  });
  const rows = await findAccessoryVariants(context, {
    accessoryId: d.family.id,
  });
  expect(rows.items).toHaveLength(2);
  expect(rows.items.find((r) => r.id === d.variant.id)).toMatchObject({
    producer: "Sony",
    year: 2000,
    markets: [{ name: "North America" }],
    platforms: [
      { name: "PlayStation 2", note: "Analog support varies by game" },
    ],
  });
  expect(rows.items.find((r) => r.name === "Unidentified")).toMatchObject({
    markets: [],
    platforms: [],
  });
  expect(
    (
      await findAccessoryVariants(context, {
        accessoryId: d.family.id,
        query: "%",
      })
    ).items,
  ).toEqual([]);
});
it("atomically creates one private copy with personal fields, normalized initial defects and actor identity", async () => {
  const c = await copy();
  const row = await db.collectionItem.findUniqueOrThrow({
    where: { id: c.id },
    include: { ownedAccessory: true, defects: true },
  });
  expect(row).toMatchObject({
    type: "ACCESSORY",
    publicationStatus: "PRIVATE",
    revision: 1,
    createdById: c.user.id,
    updatedById: c.user.id,
    notes: "Original notes",
    hasBox: null,
    ownedAccessory: { accessoryVariantId: c.variant.id },
    defects: [{ title: "Cable wear", status: "ACTIVE" }],
  });
  expect(await db.ownedGame.count()).toBe(0);
  expect(await db.ownedConsole.count()).toBe(0);
});
it("retries a lost response without duplicates, even after catalog revision/archive changes", async () => {
  const c = await copy();
  await db.accessoryVariant.update({
    where: { id: c.variant.id },
    data: { revision: { increment: 1 }, archivedAt: new Date() },
  });
  expect(await createAccessoryCopy(c.context, c.input)).toBe(c.id);
  expect(await db.collectionItem.count()).toBe(1);
  await expect(
    createAccessoryCopy(c.context, { ...c.input, notes: "Different" }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  const other = await actor();
  await expect(
    createAccessoryCopy(other.context, c.input),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});
it("serializes concurrent requests with the same reference", async () => {
  const { context } = await actor();
  const { input } = await identity();
  expect(
    await Promise.all([
      createAccessoryCopy(context, input),
      createAccessoryCopy(context, input),
    ]),
  ).toEqual([input.id, input.id]);
  expect(await db.collectionItem.count()).toBe(1);
});
it("rejects forged canonical fields, mismatched families, stale records, archives and missing locations without writes", async () => {
  const { context } = await actor();
  const d = await identity();
  for (const input of [
    { ...d.input, producerId: d.producer.id },
    { ...d.input, variantRevision: 2 },
    { ...d.input, accessoryId: randomUUID() },
    { ...d.input, locationId: randomUUID() },
  ])
    await expect(createAccessoryCopy(context, input)).rejects.toBeInstanceOf(
      Error,
    );
  await db.accessory.update({
    where: { id: d.family.id },
    data: { archivedAt: new Date() },
  });
  await expect(createAccessoryCopy(context, d.input)).rejects.toMatchObject({
    code: "STALE",
  });
  expect(await db.collectionItem.count()).toBe(0);
});
it("rolls back the entire create on an unexpected failure", async () => {
  const { context } = await actor();
  const { input } = await identity();
  const insert = repository.insertCopy;
  vi.spyOn(repository, "insertCopy").mockImplementation(async (...args) => {
    await insert(...args);
    throw new Error("synthetic failure");
  });
  await expect(createAccessoryCopy(context, input)).rejects.toMatchObject({
    code: "UNAVAILABLE",
  });
  expect(await db.collectionItem.count()).toBe(0);
  expect(await db.ownedAccessory.count()).toBe(0);
});
it("rechecks permission after waiting for the catalog lock", async () => {
  const { context, grant } = await actor();
  const { input } = await identity();
  const lock = catalog.lockCatalogWrites;
  vi.spyOn(catalog, "lockCatalogWrites").mockImplementation(async (tx) => {
    await lock(tx);
    await db.accessGrant.update({
      where: { id: grant.id },
      data: { enabled: false },
    });
  });
  await expect(createAccessoryCopy(context, input)).rejects.toMatchObject({
    code: "DENIED",
  });
  expect(await db.collectionItem.count()).toBe(0);
});
it("reads archived canonical identity and private fields for viewers without management choices", async () => {
  const c = await copy();
  await db.accessoryVariant.update({
    where: { id: c.variant.id },
    data: { archivedAt: new Date() },
  });
  const viewer = await actor("VIEWER"),
    result = await getOwnedAccessoryCopy(viewer.context, { id: c.id });
  expect(result).toMatchObject({
    canManage: false,
    locations: [],
    detail: {
      id: c.id,
      variant: { archived: true },
      fields: { notes: "Original notes" },
      defectCount: 1,
    },
  });
  expect(JSON.stringify(result)).not.toContain("storageNamespace");
  await expect(
    mutateAccessoryCopy(viewer.context, c.update),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    getOwnedAccessoryCopy(c.context, { id: randomUUID() }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("preserves publication/revision on no-op and unpublishes meaningful edits without changing catalog or defects", async () => {
  const c = await copy();
  await db.collectionItem.update({
    where: { id: c.id },
    data: {
      publicationStatus: "PUBLISHED",
      publishedAt: new Date(),
      publishedById: c.user.id,
    },
  });
  await mutateAccessoryCopy(c.context, c.update);
  expect(
    await db.collectionItem.findUnique({ where: { id: c.id } }),
  ).toMatchObject({ revision: 1, publicationStatus: "PUBLISHED" });
  await mutateAccessoryCopy(c.context, {
    ...c.update,
    serialNumber: "  0001  ",
    hasBox: "yes",
    notes: "Changed",
  });
  expect(
    await db.collectionItem.findUnique({
      where: { id: c.id },
      include: { defects: true },
    }),
  ).toMatchObject({
    revision: 2,
    publicationStatus: "PRIVATE",
    publishedAt: null,
    publishedById: null,
    serialNumber: "0001",
    hasBox: true,
    defects: [{ title: "Cable wear" }],
  });
  expect(
    await db.accessoryVariant.findUnique({ where: { id: c.variant.id } }),
  ).toMatchObject({ revision: 1 });
  await expect(mutateAccessoryCopy(c.context, c.update)).rejects.toMatchObject({
    code: "COPY_STALE",
  });
});
it("allows retained archived identity edits while requiring a fresh valid identity for corrections", async () => {
  const c = await copy();
  await db.accessoryVariant.update({
    where: { id: c.variant.id },
    data: { archivedAt: new Date(), revision: 2 },
  });
  await expect(
    mutateAccessoryCopy(c.context, { ...c.update, notes: "Archived" }),
  ).rejects.toMatchObject({ code: "STALE" });
  await mutateAccessoryCopy(c.context, {
    ...c.update,
    variantRevision: 2,
    notes: "Archived",
  });
  const other = await db.accessoryVariant.create({
    data: { name: "Silver", slug: randomUUID(), accessoryId: c.family.id },
  });
  await mutateAccessoryCopy(c.context, {
    ...c.update,
    expectedRevision: 2,
    variantId: other.id,
    notes: "Reidentified",
  });
  expect(
    await db.ownedAccessory.findUnique({ where: { collectionItemId: c.id } }),
  ).toMatchObject({ accessoryVariantId: other.id });
  expect(await db.defect.count()).toBe(1);
});
it("allows only one winner among concurrent editors", async () => {
  const c = await copy();
  const results = await Promise.allSettled([
    mutateAccessoryCopy(c.context, { ...c.update, notes: "A" }),
    mutateAccessoryCopy(c.context, { ...c.update, notes: "B" }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { code: "COPY_STALE" },
  });
});
it("scopes model selection/removal to ready models on this accessory, resets approval and preserves stored bytes", async () => {
  const c = await copy(),
    a = await model(c.id, true),
    b = await model(c.id);
  await db.asset.update({
    where: { id: a.assetId },
    data: {
      rightsStatus: "APPROVED",
      reviewedAt: new Date(),
      reviewedById: c.user.id,
    },
  });
  const poster = await db.asset.create({
    data: {
      kind: "IMAGE",
      scope: "COLLECTION",
      deliveryClass: "DISPLAY",
      state: "PENDING",
      storageNamespace: "test",
      objectKey: randomUUID(),
      mimeType: "image/png",
      sizeBytes: 100,
      sha256: "b".repeat(64),
      width: 32,
      height: 32,
      inputs: { create: { sourceAssetId: a.assetId, purpose: "RENDER_INPUT" } },
    },
  });
  await db.asset.update({
    where: { id: poster.id },
    data: {
      state: "READY",
      publicSafe: true,
      rightsStatus: "APPROVED",
      reviewedAt: new Date(),
      reviewedById: c.user.id,
    },
  });
  await db.collectionItemMedia.update({
    where: { id: a.id },
    data: { publicDisplayAssetId: poster.id },
  });
  await db.collectionItemMedia.update({
    where: { id: a.id },
    data: {
      publicApproved: true,
      approvedAt: new Date(),
      approvedById: c.user.id,
    },
  });
  await db.collectionItem.update({
    where: { id: c.id },
    data: {
      publicationStatus: "PUBLISHED",
      publishedAt: new Date(),
      publishedById: c.user.id,
    },
  });
  await mutateAccessoryCopy(c.context, {
    operation: "model",
    id: c.id,
    expectedRevision: 1,
    useId: b.id,
  });
  expect(
    await db.collectionItemMedia.findUnique({ where: { id: a.id } }),
  ).toMatchObject({
    isPrimary: false,
    publicApproved: false,
    publicDisplayAssetId: null,
    approvedById: null,
    approvedAt: null,
  });
  expect(
    await db.collectionItemMedia.findUnique({ where: { id: b.id } }),
  ).toMatchObject({ isPrimary: true, publicApproved: false });
  expect(
    await db.collectionItem.findUnique({ where: { id: c.id } }),
  ).toMatchObject({
    revision: 2,
    publicationStatus: "PRIVATE",
    publishedAt: null,
    publishedById: null,
  });
  const other = await db.collectionItem.create({
    data: {
      type: "ACCESSORY",
      ownedAccessory: { create: { accessoryVariantId: c.variant.id } },
    },
  });
  const foreign = await model(other.id);
  await expect(
    mutateAccessoryCopy(c.context, {
      operation: "model",
      id: c.id,
      expectedRevision: 2,
      useId: foreign.id,
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await mutateAccessoryCopy(c.context, {
    operation: "removeModel",
    id: c.id,
    expectedRevision: 2,
    useId: b.id,
  });
  expect(
    await db.collectionItemMedia.findUnique({ where: { id: b.id } }),
  ).toBeNull();
  expect(
    await db.asset.findUnique({ where: { id: b.assetId } }),
  ).not.toBeNull();
  expect(
    (await getOwnedAccessoryCopy(c.context, { id: c.id })).models.selected,
  ).toBeNull();
});
it("bounds model pages and includes the selected model separately", async () => {
  const c = await copy();
  const selected = await model(c.id, true);
  for (let i = 0; i < 26; i++) await model(c.id);
  const result = await getOwnedAccessoryCopy(c.context, { id: c.id });
  expect(result.models.items).toHaveLength(25);
  expect(result.models.hasMore).toBe(true);
  expect(result.models.selected?.id).toBe(selected.id);
  expect(
    (await getOwnedAccessoryCopy(c.context, { id: c.id, modelPage: 2 })).models
      .items,
  ).toHaveLength(2);
});
it("deletes only the confirmed accessory root and cascading links, preserving catalog, other copies and assets", async () => {
  const c = await copy(),
    m = await model(c.id);
  const other = await createAccessoryCopy(c.context, {
    ...c.input,
    id: randomUUID(),
  });
  await expect(
    mutateAccessoryCopy(c.context, {
      operation: "delete",
      id: c.id,
      expectedRevision: 2,
    }),
  ).rejects.toMatchObject({ code: "COPY_STALE" });
  await mutateAccessoryCopy(c.context, {
    operation: "delete",
    id: c.id,
    expectedRevision: 1,
  });
  expect(
    await db.collectionItem.findUnique({ where: { id: c.id } }),
  ).toBeNull();
  expect(await db.defect.count()).toBe(1);
  expect(await db.collectionItemMedia.count()).toBe(0);
  expect(
    await db.asset.findUnique({ where: { id: m.assetId } }),
  ).not.toBeNull();
  expect(
    await db.collectionItem.findUnique({ where: { id: other } }),
  ).not.toBeNull();
  expect(await db.accessoryVariant.count()).toBe(1);
});
it("rejects a valid root of another subtype before reading or mutating accessory details", async () => {
  const c = await copy();
  const game = await db.game.create({
    data: { name: "Other subtype", slug: randomUUID() },
  });
  const release = await db.gameRelease.create({
    data: { gameId: game.id, platformId: c.platform.id, slug: randomUUID() },
  });
  const root = await db.collectionItem.create({
    data: {
      type: "GAME",
      ownedGame: { create: { gameReleaseId: release.id } },
    },
  });
  await expect(
    getOwnedAccessoryCopy(c.context, { id: root.id }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    mutateAccessoryCopy(c.context, { ...c.update, id: root.id }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("rolls back a failed edit without changing the root or identity", async () => {
  const c = await copy();
  const update = repository.updateCopy;
  vi.spyOn(repository, "updateCopy").mockImplementation(async (...args) => {
    await update(...args);
    throw new Error("Synthetic write failure");
  });
  await expect(
    mutateAccessoryCopy(c.context, { ...c.update, notes: "Should roll back" }),
  ).rejects.toMatchObject({ code: "UNAVAILABLE" });
  expect(
    await db.collectionItem.findUnique({ where: { id: c.id } }),
  ).toMatchObject({ notes: "Original notes", revision: 1 });
});
it("rolls back a failed deletion including its cascades", async () => {
  const c = await copy();
  await model(c.id);
  const remove = repository.deleteCopy;
  vi.spyOn(repository, "deleteCopy").mockImplementation(async (...args) => {
    await remove(...args);
    throw new Error("Synthetic delete failure");
  });
  await expect(
    mutateAccessoryCopy(c.context, {
      operation: "delete",
      id: c.id,
      expectedRevision: 1,
    }),
  ).rejects.toMatchObject({ code: "UNAVAILABLE" });
  expect(await db.collectionItem.count()).toBe(1);
  expect(await db.ownedAccessory.count()).toBe(1);
  expect(await db.defect.count()).toBe(1);
  expect(await db.collectionItemMedia.count()).toBe(1);
});
it("rechecks revoked mutation permission under the catalog lock", async () => {
  const c = await copy();
  const lock = catalog.lockCatalogWrites;
  vi.spyOn(catalog, "lockCatalogWrites").mockImplementation(async (tx) => {
    await lock(tx);
    await db.accessGrant.update({
      where: { id: c.grant.id },
      data: { role: "VIEWER" },
    });
  });
  await expect(
    mutateAccessoryCopy(c.context, { ...c.update, notes: "Forbidden" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(
    await db.collectionItem.findUnique({ where: { id: c.id } }),
  ).toMatchObject({ notes: "Original notes", revision: 1 });
});
