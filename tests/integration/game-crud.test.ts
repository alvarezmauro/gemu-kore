import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { requirePrivateAccess } from "@/server/auth/access";
import { getDatabase, disconnectDatabase } from "@/server/db/client";
import type { AccessRole } from "@/features/auth/contracts";
import { signedSessionCookie } from "../helpers/access-session";
import { emptyCopyPhysical } from "@/features/collection/copy-validation";
import { createGameCopy } from "@/server/services/collection/games";
import * as repository from "@/server/repositories/collection/game-management";
import {
  getOwnedGame,
  mutateOwnedGame,
} from "@/server/services/collection/game-management";
import * as roots from "@/server/repositories/collection/items";
const db = getDatabase();
const secret = "game-creation-test-secret-longer-than-thirty-two-characters";
async function actor(role: AccessRole = "EDITOR") {
  const email = `${randomUUID()}@example.com`;
  const user = await db.user.create({
    data: { name: "Game fixture", email, emailVerified: true },
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
  const platform = await db.consolePlatform.create({
    data: { name: "SNES", slug: randomUUID() },
  });
  const game = await db.game.create({
    data: { name: "Chrono Trigger", slug: randomUUID(), aliases: ["クロノ"] },
  });
  const region = await db.region.create({
    data: { name: "North America", slug: randomUUID(), code: randomUUID() },
  });
  const release = await db.gameRelease.create({
    data: {
      gameId: game.id,
      platformId: platform.id,
      slug: randomUUID(),
      editionName: "Standard Edition",
      regions: {
        create: { regionId: region.id, releaseYear: 1995, releaseMonth: 8 },
      },
      includedItems: {
        create: { name: "Manual", kind: "MANUAL", quantity: 1 },
      },
    },
  });
  const input = {
    ...emptyCopyPhysical,
    id: randomUUID(),
    platformId: platform.id,
    platformRevision: 1,
    gameId: game.id,
    gameRevision: 1,
    releaseId: release.id,
    releaseRevision: 1,
  };
  return { platform, game, release, region, input };
}
async function copy() {
  const user = await actor();
  const catalog = await identity();
  const id = await createGameCopy(user.context, {
    ...catalog.input,
    serialNumber: "00001",
    notes: "Private notes",
    defects: [
      { title: "Torn manual", description: "Corner", severity: "MINOR" },
    ],
  });
  const { defects, ...fields } = catalog.input;
  void defects;
  return {
    ...user,
    ...catalog,
    id,
    update: { ...fields, operation: "update", expectedRevision: 1 },
  };
}
async function image(scope: "CATALOG" | "COLLECTION" = "COLLECTION") {
  return db.asset.create({
    data: {
      kind: "IMAGE",
      scope,
      state: "READY",
      deliveryClass: "DISPLAY",
      storageNamespace: "test",
      objectKey: randomUUID(),
      mimeType: "image/png",
      sha256: "a".repeat(64),
      width: 20,
      height: 20,
      sizeBytes: 1,
    },
  });
}
it("returns safe, bounded private details with scoped credits, cover precedence and archived canonical data", async () => {
  const c = await copy();
  const viewer = await actor("VIEWER");
  const company = await db.company.create({
    data: { name: "Square", slug: randomUUID() },
  });
  await db.gameCompany.create({
    data: { gameId: c.game.id, companyId: company.id, role: "DEVELOPER" },
  });
  await db.gameReleaseCompany.create({
    data: {
      gameReleaseId: c.release.id,
      companyId: company.id,
      role: "PUBLISHER",
      regionId: c.region.id,
    },
  });
  await db.productIdentifier.createMany({
    data: Array.from({ length: 21 }, (_, i) => ({
      gameReleaseId: c.release.id,
      scheme: "PRODUCT_CODE" as const,
      value: `TEST-${String(i).padStart(2, "0")}`,
      normalizedValue: `test-${i}`,
      issuer: "Synthetic issuer",
      marketNote: "North America",
    })),
  });
  await db.game.update({
    where: { id: c.game.id },
    data: { description: "Game description", archivedAt: new Date() },
  });
  await db.gameRelease.update({
    where: { id: c.release.id },
    data: {
      descriptionOverride: "Release description",
      archivedAt: new Date(),
    },
  });
  const room = await db.location.create({
    data: { name: "Room", normalizedName: "room" },
  });
  const shelf = await db.location.create({
    data: { name: "Shelf", normalizedName: "shelf", parentId: room.id },
  });
  await db.collectionItem.update({
    where: { id: c.id },
    data: { locationId: shelf.id },
  });
  const gameCover = await image("CATALOG"),
    releaseCover = await image("CATALOG");
  await db.catalogAsset.createMany({
    data: [
      {
        assetId: gameCover.id,
        gameId: c.game.id,
        role: "COVER",
        isPrimary: true,
      },
      {
        assetId: releaseCover.id,
        gameReleaseId: c.release.id,
        role: "COVER",
        isPrimary: true,
      },
    ],
  });
  const photo = await image();
  await db.collectionItemMedia.createMany({
    data: Array.from({ length: 13 }, (_, i) => ({
      assetId: photo.id,
      collectionItemId: c.id,
      type: "PHOTO" as const,
      sortOrder: i,
    })),
  });
  await db.defect.createMany({
    data: Array.from({ length: 21 }, (_, i) => ({
      collectionItemId: c.id,
      title: `Defect ${i}`,
      severity: "MINOR" as const,
    })),
  });
  const result = await getOwnedGame(viewer.context, { id: c.id });
  expect(result.detail.productIdentifiers).toHaveLength(20);
  expect(result.detail.productIdentifiers[0]).toEqual({
    scheme: "PRODUCT_CODE",
    value: "TEST-00",
    issuer: "Synthetic issuer",
    marketNote: "North America",
  });
  expect(result.detail.moreProductIdentifiers).toBe(true);
  expect(result).toMatchObject({
    canManage: false,
    locations: [],
    detail: {
      fields: { serialNumber: "00001", notes: "Private notes" },
      location: "Room / Shelf",
      game: { archived: true },
      release: { archived: true, description: "Release description" },
      developers: ["Square"],
      credits: [
        { company: "Square", role: "PUBLISHER", market: "North America" },
      ],
      cover: { url: `/api/media/private/${releaseCover.id}` },
      defectCount: 22,
    },
  });
  expect(result.detail.photos).toHaveLength(12);
  expect(result.detail.defects).toHaveLength(20);
  expect(JSON.stringify(result)).not.toMatch(
    /storageNamespace|objectKey|sha256|createdById|seedKey/,
  );
  await db.catalogAsset.deleteMany({
    where: { gameReleaseId: c.release.id, role: "COVER" },
  });
  expect((await getOwnedGame(c.context, { id: c.id })).detail.cover?.url).toBe(
    `/api/media/private/${gameCover.id}`,
  );
});
it("edits another creator's copy as an editor, preserves canonical data, and normalizes empty fields", async () => {
  const c = await copy(),
    editor = await actor();
  await mutateOwnedGame(editor.context, {
    ...c.update,
    serialNumber: " 00002 ",
    hasBox: "no",
    notes: " Revised ",
  });
  const row = await db.collectionItem.findUniqueOrThrow({
    where: { id: c.id },
    include: { ownedGame: true, defects: true },
  });
  expect(row).toMatchObject({
    serialNumber: "00002",
    hasBox: false,
    notes: "Revised",
    observedMarkings: null,
    revision: 2,
    createdById: c.user.id,
    updatedById: editor.user.id,
    ownedGame: { gameReleaseId: c.release.id },
    defects: [{ title: "Torn manual" }],
  });
  expect(
    await db.gameRelease.findUnique({ where: { id: c.release.id } }),
  ).toEqual(c.release);
  expect(await db.gameReleaseIncludedItem.count()).toBe(1);
});
it("preserves publication on no-op, returns meaningful edits to private, and retains archived current identities", async () => {
  const c = await copy();
  await db.collectionItem.update({
    where: { id: c.id },
    data: {
      publicationStatus: "PUBLISHED",
      publishedAt: new Date(),
      publishedById: c.user.id,
    },
  });
  await db.game.update({
    where: { id: c.game.id },
    data: { archivedAt: new Date() },
  });
  await db.consolePlatform.update({
    where: { id: c.platform.id },
    data: { archivedAt: new Date() },
  });
  await db.gameRelease.update({
    where: { id: c.release.id },
    data: { archivedAt: new Date() },
  });
  const input = { ...c.update, serialNumber: "00001", notes: "Private notes" };
  await mutateOwnedGame(c.context, input);
  expect(
    await db.collectionItem.findUnique({ where: { id: c.id } }),
  ).toMatchObject({ revision: 1, publicationStatus: "PUBLISHED" });
  await mutateOwnedGame(c.context, { ...input, notes: "Changed" });
  expect(
    await db.collectionItem.findUnique({ where: { id: c.id } }),
  ).toMatchObject({
    revision: 2,
    publicationStatus: "PRIVATE",
    publishedAt: null,
    publishedById: null,
  });
});
it("corrects only the selected copy's release and rejects a newly selected archived identity", async () => {
  const c = await copy(),
    other = await identity();
  const secondId = await createGameCopy(c.context, {
    ...c.input,
    id: randomUUID(),
  });
  const photo = await image();
  await db.collectionItemMedia.create({
    data: { assetId: photo.id, collectionItemId: c.id, type: "PHOTO" },
  });
  await mutateOwnedGame(c.context, {
    ...c.update,
    serialNumber: "00001",
    notes: "Private notes",
    platformId: other.platform.id,
    gameId: other.game.id,
    releaseId: other.release.id,
  });
  expect((await getOwnedGame(c.context, { id: c.id })).detail).toMatchObject({
    revision: 2,
    release: { id: other.release.id },
    fields: { notes: "Private notes" },
    photos: [{ url: `/api/media/private/${photo.id}` }],
    defects: [{ title: "Torn manual" }],
  });
  expect(
    await db.ownedGame.findUnique({ where: { collectionItemId: secondId } }),
  ).toMatchObject({ gameReleaseId: c.release.id });
  await db.gameRelease.update({
    where: { id: c.release.id },
    data: { archivedAt: new Date() },
  });
  await expect(
    mutateOwnedGame(c.context, { ...c.update, expectedRevision: 2 }),
  ).rejects.toMatchObject({ code: "STALE" });
});
it("rejects concurrent and stale edits rather than overwriting fields or deleting the winning copy", async () => {
  const c = await copy();
  const results = await Promise.allSettled([
    mutateOwnedGame(c.context, { ...c.update, notes: "First" }),
    mutateOwnedGame(c.context, { ...c.update, notes: "Second" }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { code: "COPY_STALE" },
  });
  await expect(
    mutateOwnedGame(c.context, {
      operation: "delete",
      id: c.id,
      expectedRevision: 1,
    }),
  ).rejects.toMatchObject({ code: "COPY_STALE" });
  expect(await db.collectionItem.count()).toBe(1);
});
it.each(["game", "platform", "release"] as const)(
  "rejects a changed %s catalog revision before copy edits",
  async (kind) => {
    const c = await copy();
    if (kind === "game")
      await db.game.update({ where: { id: c.game.id }, data: { revision: 2 } });
    else if (kind === "platform")
      await db.consolePlatform.update({
        where: { id: c.platform.id },
        data: { revision: 2 },
      });
    else
      await db.gameRelease.update({
        where: { id: c.release.id },
        data: { revision: 2 },
      });
    await expect(mutateOwnedGame(c.context, c.update)).rejects.toMatchObject({
      code: "STALE",
    });
    expect(
      await db.collectionItem.findUnique({ where: { id: c.id } }),
    ).toMatchObject({ revision: 1, notes: "Private notes" });
  },
);
it("rejects malformed, missing, non-game, injected and mismatched records or unavailable locations", async () => {
  const c = await copy(),
    other = await identity();
  const model = await db.consoleModel.create({
    data: { platformId: c.platform.id, name: "SNES model", slug: randomUUID() },
  });
  const nonGame = await db.collectionItem.create({
    data: {
      type: "CONSOLE",
      ownedConsole: { create: { consoleModelId: model.id } },
    },
  });
  for (const id of [randomUUID(), nonGame.id, "invalid"])
    await expect(getOwnedGame(c.context, { id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  for (const id of [randomUUID(), nonGame.id])
    await expect(
      mutateOwnedGame(c.context, {
        operation: "delete",
        id,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  for (const data of [
    { ...c.update, editionType: "DELUXE" },
    { ...c.update, publicationStatus: "PUBLISHED" },
    { ...c.update, defects: [] },
  ])
    await expect(mutateOwnedGame(c.context, data)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  for (const data of [
    { ...c.update, gameId: other.game.id },
    { ...c.update, platformId: other.platform.id },
  ])
    await expect(mutateOwnedGame(c.context, data)).rejects.toMatchObject({
      code: "STALE",
    });
  await expect(
    mutateOwnedGame(c.context, { ...c.update, locationId: randomUUID() }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
it("enforces viewer read-only access, revoked sessions and permission changes after waiting for the copy lock", async () => {
  const c = await copy(),
    viewer = await actor("VIEWER");
  expect((await getOwnedGame(viewer.context, { id: c.id })).canManage).toBe(
    false,
  );
  for (const data of [
    c.update,
    { operation: "delete", id: c.id, expectedRevision: 1 },
  ])
    await expect(mutateOwnedGame(viewer.context, data)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  await db.session.delete({ where: { id: viewer.session.id } });
  await expect(
    getOwnedGame(viewer.context, { id: c.id }),
  ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  const lock = roots.lockCollectionItem;
  vi.spyOn(roots, "lockCollectionItem").mockImplementation(async (id, tx) => {
    await lock(id, tx);
    await db.accessGrant.update({
      where: { id: c.grant.id },
      data: { role: "VIEWER" },
    });
  });
  await expect(mutateOwnedGame(c.context, c.update)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
it("deletes only the selected copy and its dependents, preserving catalog data, other copies and asset provenance", async () => {
  const c = await copy();
  const second = await createGameCopy(c.context, {
    ...c.input,
    id: randomUUID(),
  });
  const photo = await image();
  await db.collectionItemMedia.createMany({
    data: [
      { assetId: photo.id, collectionItemId: c.id, type: "PHOTO" },
      { assetId: photo.id, collectionItemId: second, type: "PHOTO" },
    ],
  });
  await mutateOwnedGame(c.context, {
    operation: "delete",
    id: c.id,
    expectedRevision: 1,
  });
  expect(
    await db.collectionItem.findUnique({ where: { id: c.id } }),
  ).toBeNull();
  expect(await db.defect.count({ where: { collectionItemId: c.id } })).toBe(0);
  expect(
    await db.collectionItemMedia.count({ where: { collectionItemId: c.id } }),
  ).toBe(0);
  expect(
    await db.ownedGame.findUnique({ where: { collectionItemId: second } }),
  ).toMatchObject({ gameReleaseId: c.release.id });
  expect(await db.asset.findUnique({ where: { id: photo.id } })).not.toBeNull();
  expect(
    await db.gameRelease.findUnique({ where: { id: c.release.id } }),
  ).toEqual(c.release);
  expect(await db.gameReleaseIncludedItem.count()).toBe(1);
});
it("rolls back both edits and deletes if persistence fails", async () => {
  const c = await copy();
  const update = repository.updateGame;
  vi.spyOn(repository, "updateGame").mockImplementation(async (...args) => {
    await update(...args);
    throw new Error("after update");
  });
  await expect(
    mutateOwnedGame(c.context, { ...c.update, notes: "Must roll back" }),
  ).rejects.toMatchObject({ code: "UNAVAILABLE" });
  expect(
    await db.collectionItem.findUnique({ where: { id: c.id } }),
  ).toMatchObject({ notes: "Private notes", revision: 1 });
  const remove = repository.deleteGame;
  vi.spyOn(repository, "deleteGame").mockImplementation(async (...args) => {
    await remove(...args);
    throw new Error("after delete");
  });
  await expect(
    mutateOwnedGame(c.context, {
      operation: "delete",
      id: c.id,
      expectedRevision: 1,
    }),
  ).rejects.toMatchObject({ code: "UNAVAILABLE" });
  expect(await db.ownedGame.count()).toBe(1);
  expect(await db.defect.count()).toBe(1);
});
