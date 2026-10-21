import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { requirePrivateAccess } from "@/server/auth/access";
import { getDatabase, disconnectDatabase } from "@/server/db/client";
import { signedSessionCookie } from "../helpers/access-session";
import { getOwnedAccessoryCopy } from "@/server/services/collection/accessory-copies";
import { getAccessoryModelPresentation } from "@/server/services/collection/accessory-presentation";
const db = getDatabase();
const secret = "game-creation-test-secret-longer-than-thirty-two-characters";
async function actor(role: "ADMIN" | "EDITOR" | "VIEWER" = "VIEWER") {
  const email = `${randomUUID()}@example.com`;
  const user = await db.user.create({
    data: { name: "Detail fixture", email, emailVerified: true },
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
  return { context, grant, user };
}
async function reset() {
  await db.$executeRaw`TRUNCATE TABLE asset, location, company, region, console_platform, game, collection_item, accessory CASCADE`;
  await db.accessGrant.deleteMany();
  await db.user.deleteMany();
}
beforeEach(async () => {
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3002");
  vi.stubEnv("BETTER_AUTH_SECRET", secret);
  vi.stubEnv("GOOGLE_CLIENT_ID", "fixture");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "fixture");
  vi.stubEnv("GITHUB_CLIENT_ID", "");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "");
  await reset();
});
afterAll(async () => {
  await reset();
  await disconnectDatabase();
  vi.unstubAllEnvs();
});
async function fixture() {
  const user = await actor();
  const producer = await db.company.create({
    data: { name: "Family producer", slug: randomUUID() },
  });
  const family = await db.accessory.create({
    data: {
      name: "Controller",
      slug: randomUUID(),
      description: "Family description",
      producerId: producer.id,
      releaseYear: 2000,
      specifications: {
        schemaVersion: 1,
        data: {
          wireless: false,
          weightGrams: 0,
          connector: { type: "Proprietary" },
        },
      },
      trailerProvider: "YOUTUBE",
      trailerId: "AbCdEf123_-",
    },
  });
  const platform = await db.consolePlatform.create({
    data: { name: "Console A", slug: randomUUID() },
  });
  const variant = await db.accessoryVariant.create({
    data: {
      name: "Black",
      slug: randomUUID(),
      accessoryId: family.id,
      platforms: {
        create: {
          platformId: platform.id,
          compatibilityNote: "Requires adapter",
        },
      },
    },
  });
  const sibling = await db.accessoryVariant.create({
    data: { name: "Silver", slug: randomUUID(), accessoryId: family.id },
  });
  const copy = await db.collectionItem.create({
    data: {
      type: "ACCESSORY",
      serialNumber: "PRIVATE-001",
      notes: "Private copy note",
      ownedAccessory: { create: { accessoryVariantId: variant.id } },
    },
  });
  return { ...user, family, variant, sibling, copy, platform };
}
async function asset(
  kind: "IMAGE" | "MODEL_3D",
  scope: "COLLECTION" | "CATALOG" = "CATALOG",
  state: "READY" | "PENDING" = "READY",
) {
  return db.asset.create({
    data: {
      kind,
      scope,
      state,
      deliveryClass: kind === "IMAGE" ? "DISPLAY" : "ORIGINAL",
      storageNamespace: "test",
      objectKey: randomUUID(),
      mimeType: kind === "IMAGE" ? "image/webp" : "model/gltf-binary",
      sizeBytes: 100,
      sha256: "a".repeat(64),
      ...(kind === "IMAGE" ? { width: 100, height: 80 } : {}),
    },
  });
}
async function catalogModel(kind: "family" | "variant", id: string) {
  const file = await asset("MODEL_3D");
  const use = await db.catalogAsset.create({
    data: {
      ...(kind === "family" ? { accessoryId: id } : { accessoryVariantId: id }),
      role: "MODEL_3D",
      isPrimary: true,
      assetId: file.id,
    },
  });
  return { file, use };
}
async function request(d: Awaited<ReturnType<typeof fixture>>) {
  const result = await getOwnedAccessoryCopy(d.context, { id: d.copy.id });
  return {
    id: d.copy.id,
    expectedRevision: result.detail.revision,
    selectionKey: result.presentation.model!.selectionKey,
  };
}
it("reads private viewer detail with family defaults and explicit selected-variant compatibility", async () => {
  const d = await fixture();
  const result = await getOwnedAccessoryCopy(d.context, { id: d.copy.id });
  expect(result.canManage).toBe(false);
  expect(result.locations).toEqual([]);
  expect(result.detail.fields.notes).toBe("Private copy note");
  expect(result.detail.variant.platforms).toEqual([
    {
      id: d.platform.id,
      name: "Console A",
      archived: false,
      note: "Requires adapter",
    },
  ]);
  expect(result.presentation).toMatchObject({
    description: { scope: "family", value: "Family description" },
    yearScope: "family",
    producerScope: "family",
    video: {
      scope: "family",
      value: { provider: "YOUTUBE", id: "AbCdEf123_-" },
    },
    model: null,
    poster: null,
    photos: [],
    specifications: {
      scope: "family",
      facts: expect.arrayContaining([
        { label: "wireless", value: "No" },
        { label: "weight Grams", value: "0" },
        { label: "connector", value: "type: Proprietary" },
      ]),
    },
  });
  await db.collectionItem.update({
    where: { id: d.copy.id },
    data: { ownedAccessory: { update: { accessoryVariantId: d.sibling.id } } },
  });
  expect(
    (await getOwnedAccessoryCopy(d.context, { id: d.copy.id })).detail.variant
      .platforms,
  ).toEqual([]);
});
it("uses whole variant specification/video/description overrides and retains archived identities", async () => {
  const d = await fixture();
  await db.accessoryVariant.update({
    where: { id: d.variant.id },
    data: {
      descriptionOverride: "Variant description",
      releaseYear: 2002,
      specificationsOverride: { schemaVersion: 1, data: {} },
      trailerProvider: "DIRECT_URL",
      trailerUrl: "https://example.com/product.mp4",
      archivedAt: new Date(),
    },
  });
  await db.accessory.update({
    where: { id: d.family.id },
    data: { archivedAt: new Date() },
  });
  const result = await getOwnedAccessoryCopy(d.context, { id: d.copy.id });
  expect(result.detail.accessory.archived).toBe(true);
  expect(result.detail.variant.archived).toBe(true);
  expect(result.presentation).toMatchObject({
    description: { scope: "variant", value: "Variant description" },
    specifications: { scope: "variant", facts: [] },
    video: {
      scope: "variant",
      value: { provider: "DIRECT_URL", url: "https://example.com/product.mp4" },
    },
    yearScope: "variant",
  });
});
it("bounds and separates family/variant galleries, excludes unready/original/sibling media and keeps hero stable on page two", async () => {
  const d = await fixture();
  const image = await asset("IMAGE");
  const pending = await asset("IMAGE", "CATALOG", "PENDING");
  await db.catalogAsset.createMany({
    data: Array.from({ length: 14 }, (_, i) => ({
      accessoryId: d.family.id,
      role: "GALLERY" as const,
      assetId: image.id,
      sortOrder: i,
      altText: `Family ${i}`,
    })),
  });
  await db.catalogAsset.createMany({
    data: [
      {
        accessoryVariantId: d.variant.id,
        role: "PREVIEW",
        assetId: image.id,
        altText: "Selected variant",
      },
      {
        accessoryVariantId: d.sibling.id,
        role: "GALLERY",
        assetId: image.id,
        altText: "Sibling only",
      },
    ],
  });
  await expect(
    db.catalogAsset.create({
      data: {
        accessoryVariantId: d.variant.id,
        role: "GALLERY",
        assetId: pending.id,
        altText: "Pending only",
      },
    }),
  ).rejects.toThrow("Use requires ready asset");
  const privateImage = await asset("IMAGE", "COLLECTION");
  const original = await db.asset.create({
    data: {
      kind: "IMAGE",
      scope: "COLLECTION",
      state: "READY",
      deliveryClass: "ORIGINAL",
      width: 100,
      height: 80,
      storageNamespace: "test",
      objectKey: randomUUID(),
      mimeType: "image/png",
      sizeBytes: 100,
      sha256: "b".repeat(64),
    },
  });
  await db.collectionItemMedia.createMany({
    data: [
      {
        collectionItemId: d.copy.id,
        assetId: privateImage.id,
        type: "PHOTO",
        altText: "Personal",
      },
      {
        collectionItemId: d.copy.id,
        assetId: original.id,
        type: "PHOTO",
        altText: "Original only",
      },
    ],
  });
  const first = (await getOwnedAccessoryCopy(d.context, { id: d.copy.id }))
    .presentation;
  expect(first.catalog.family).toHaveLength(12);
  expect(first.catalog.variant).toHaveLength(1);
  expect(first.catalog.hasNext).toBe(true);
  expect(first.photos.map((p) => p.alt)).toEqual(["Personal"]);
  expect(first.poster?.alt).toBe("Selected variant");
  const second = (
    await getOwnedAccessoryCopy(d.context, { id: d.copy.id, galleryPage: 2 })
  ).presentation;
  expect(second.catalog.family).toHaveLength(2);
  expect(second.catalog.variant).toEqual([]);
  expect(second.catalog.hasNext).toBe(false);
  expect(second.poster).toEqual(first.poster);
  expect(JSON.stringify(first)).not.toMatch(
    /Pending only|Sibling only|Original only|objectKey|storageNamespace/,
  );
});
it("uses copy then variant then family model selection for both download and presentation", async () => {
  const d = await fixture();
  const family = await catalogModel("family", d.family.id);
  let input = await request(d);
  expect(
    (await getAccessoryModelPresentation(d.context, input)).resource.id,
  ).toBe(family.file.id);
  const variant = await catalogModel("variant", d.variant.id);
  input = await request(d);
  expect(
    (await getAccessoryModelPresentation(d.context, input)).resource.id,
  ).toBe(variant.file.id);
  const custom = await asset("MODEL_3D", "COLLECTION");
  await db.collectionItemMedia.create({
    data: {
      collectionItemId: d.copy.id,
      assetId: custom.id,
      type: "CUSTOM_MODEL",
      isPrimary: true,
    },
  });
  input = await request(d);
  const presentation = await getAccessoryModelPresentation(d.context, input);
  expect(presentation).toMatchObject({
    source: "Your copy's custom 3D file",
    resource: { id: custom.id, url: `/api/media/private/${custom.id}` },
    settings: { preset: "object" },
  });
  expect(JSON.stringify(presentation)).not.toMatch(
    /PRIVATE-001|Private copy note|objectKey|storageNamespace/,
  );
});
it("rejects stale copy revisions, catalog revisions and model choices before interactive loading", async () => {
  const d = await fixture();
  await catalogModel("family", d.family.id);
  const input = await request(d);
  await db.accessory.update({
    where: { id: d.family.id },
    data: { revision: { increment: 1 } },
  });
  await expect(
    getAccessoryModelPresentation(d.context, input),
  ).rejects.toMatchObject({ code: "STALE" });
  const current = await request(d);
  await catalogModel("variant", d.variant.id);
  await expect(
    getAccessoryModelPresentation(d.context, current),
  ).rejects.toMatchObject({ code: "STALE" });
  const next = await request(d);
  await db.collectionItem.update({
    where: { id: d.copy.id },
    data: { revision: { increment: 1 } },
  });
  await expect(
    getAccessoryModelPresentation(d.context, next),
  ).rejects.toMatchObject({ code: "COPY_STALE" });
});
it("rechecks grants for retained detail and model URLs and rejects malformed/wrong-kind identities", async () => {
  const d = await fixture();
  await catalogModel("family", d.family.id);
  const input = await request(d);
  await expect(
    getAccessoryModelPresentation(d.context, { ...input, extra: true }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  const consoleModel = await db.consoleModel.create({
    data: {
      name: "Console model",
      slug: randomUUID(),
      platformId: d.platform.id,
    },
  });
  const game = await db.collectionItem.create({
    data: {
      type: "CONSOLE",
      ownedConsole: { create: { consoleModelId: consoleModel.id } },
    },
  });
  await expect(
    getOwnedAccessoryCopy(d.context, { id: game.id }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    getAccessoryModelPresentation(d.context, { ...input, id: game.id }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    getOwnedAccessoryCopy(d.context, { id: d.copy.id, galleryPage: 0 }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await db.accessGrant.update({
    where: { id: d.grant.id },
    data: { enabled: false },
  });
  await expect(
    getOwnedAccessoryCopy(d.context, { id: d.copy.id }),
  ).rejects.toMatchObject({ code: "DENIED" });
  await expect(
    getAccessoryModelPresentation(d.context, input),
  ).rejects.toMatchObject({ code: "DENIED" });
});
it("does not borrow a sibling model and rejects a removed model selection", async () => {
  const d = await fixture();
  const sibling = await catalogModel("variant", d.sibling.id);
  expect(
    (await getOwnedAccessoryCopy(d.context, { id: d.copy.id })).presentation
      .model,
  ).toBeNull();
  const family = await catalogModel("family", d.family.id);
  const input = await request(d);
  await db.catalogAsset.delete({ where: { id: family.use.id } });
  await db.asset.update({
    where: { id: family.file.id },
    data: { state: "DELETING" },
  });
  expect(
    (await getOwnedAccessoryCopy(d.context, { id: d.copy.id })).presentation
      .model,
  ).toBeNull();
  await expect(
    getAccessoryModelPresentation(d.context, input),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(sibling.file.id).not.toBe(family.file.id);
});
