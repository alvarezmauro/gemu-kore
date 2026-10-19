import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { requirePrivateAccess } from "@/server/auth/access";
import { getDatabase, disconnectDatabase } from "@/server/db/client";
import type { AccessRole } from "@/features/auth/contracts";
import { signedSessionCookie } from "../helpers/access-session";
import { emptyCopyPhysical } from "@/features/collection/copy-validation";
import { createGameCopy } from "@/server/services/collection/games";
import * as repository from "@/server/repositories/catalog/screenshots";
import {
  getScreenshotGallery,
  mutateScreenshot,
} from "@/server/services/catalog/screenshots";
import * as catalog from "@/server/repositories/catalog/management";
import { getOwnedGame } from "@/server/services/collection/game-management";
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
async function shot(
  releaseId: string | null,
  gameId: string | null,
  sortOrder = 0,
) {
  const asset = await image("CATALOG");
  return db.catalogAsset.create({
    data: {
      gameReleaseId: releaseId,
      gameId,
      assetId: asset.id,
      role: "SCREENSHOT",
      sortOrder,
      caption: `Shot ${sortOrder}`,
    },
  });
}
it("uses a bounded release gallery instead of mixing game-level screenshots, with explicit inherited fallback", async () => {
  const c = await copy();
  const generic = await shot(null, c.game.id);
  const viewer = await actor("VIEWER");
  expect(
    (await getScreenshotGallery(viewer.context, { releaseId: c.release.id }))
      .gallery,
  ).toMatchObject({
    scope: "game",
    items: [{ id: generic.id }],
    canManage: false,
  });
  const items = [];
  for (let i = 0; i < 18; i++) items.push(await shot(c.release.id, null, i));
  const first = await getScreenshotGallery(viewer.context, {
    releaseId: c.release.id,
  });
  const second = await getScreenshotGallery(viewer.context, {
    releaseId: c.release.id,
    page: 2,
  });
  expect(first.gallery.scope).toBe("release");
  expect(first.gallery.items).toHaveLength(16);
  expect(first.gallery.hasNext).toBe(true);
  expect(second.gallery.items).toHaveLength(2);
  expect(
    new Set([...first.gallery.items, ...second.gallery.items].map((s) => s.id))
      .size,
  ).toBe(18);
  expect(JSON.stringify(first)).not.toMatch(
    /objectKey|storageNamespace|originalFilename|sha256|uploadedById/,
  );
  const page = await getOwnedGame(viewer.context, { id: c.id });
  expect(page.screenshots.items[0].id).toBe(first.gallery.items[0].id);
  expect(page.screenshots.items.some((s) => s.id === generic.id)).toBe(false);
  void items;
});
it("sanitizes legacy source links and displays attribution without exposing asset internals", async () => {
  const c = await copy();
  const use = await shot(c.release.id, null);
  await db.asset.update({
    where: { id: use.assetId },
    data: {
      sourceUrl: "javascript:alert(1)",
      licenseUrl: "https://user:secret@example.com",
      author: "Original author",
      provider: "Manual archive",
      attribution: "Credit",
      retrievedAt: new Date("2024-02-29T00:00:00Z"),
    },
  });
  const result = await getScreenshotGallery(c.context, {
    releaseId: c.release.id,
  });
  expect(result.gallery.items[0].source).toMatchObject({
    url: null,
    licenseUrl: null,
    author: "Original author",
    attribution: "Credit",
    retrievedAt: "2024-02-29T00:00:00.000Z",
  });
});
it("edits captions, resets use approval, reorders ties, and removes only one link with manual history", async () => {
  const c = await copy();
  const admin = await actor("ADMIN");
  const first = await shot(c.release.id, null),
    second = await shot(c.release.id, null);
  await db.asset.update({
    where: { id: first.assetId },
    data: {
      rightsStatus: "APPROVED",
      publicSafe: true,
      reviewedAt: new Date(),
      reviewedById: admin.user.id,
    },
  });
  await db.catalogAsset.update({
    where: { id: first.id },
    data: {
      publicApproved: true,
      publicDisplayAssetId: first.assetId,
      approvedAt: new Date(),
      approvedById: admin.user.id,
    },
  });
  await mutateScreenshot(admin.context, {
    operation: "update",
    releaseId: c.release.id,
    id: first.id,
    expectedRevision: 1,
    caption: "Forest",
    altText: "Trees",
  });
  expect(
    await db.catalogAsset.findUnique({ where: { id: first.id } }),
  ).toMatchObject({
    caption: "Forest",
    altText: "Trees",
    publicApproved: false,
  });
  expect(
    (
      await getScreenshotGallery(
        admin.context,
        { releaseId: c.release.id },
        true,
      )
    ).release.revision,
  ).toBe(2);
  const ordered = (
    await getScreenshotGallery(admin.context, { releaseId: c.release.id })
  ).gallery.items;
  await mutateScreenshot(admin.context, {
    operation: "move",
    releaseId: c.release.id,
    id: ordered[1].id,
    expectedRevision: 2,
    direction: "up",
  });
  expect(
    (
      await getScreenshotGallery(admin.context, { releaseId: c.release.id })
    ).gallery.items.map((s) => s.id),
  ).toEqual([ordered[1].id, ordered[0].id]);
  await mutateScreenshot(admin.context, {
    operation: "delete",
    releaseId: c.release.id,
    id: first.id,
    expectedRevision: 3,
  });
  expect(
    await db.asset.findUnique({ where: { id: first.assetId } }),
  ).not.toBeNull();
  expect(
    await db.catalogAsset.findUnique({ where: { id: second.id } }),
  ).not.toBeNull();
  expect(
    await db.metadataChange.count({
      where: { gameReleaseId: c.release.id, origin: "MANUAL" },
    }),
  ).toBe(3);
  expect(await db.ownedGame.count()).toBe(1);
  expect(await db.gameReleaseIncludedItem.count()).toBe(1);
});
it("rejects stale and concurrent writes, foreign uses, archived targets, and editor/viewer mutations", async () => {
  const c = await copy();
  const admin = await actor("ADMIN");
  const use = await shot(c.release.id, null);
  const other = await identity();
  const foreign = await shot(other.release.id, null);
  const request = {
    operation: "update",
    releaseId: c.release.id,
    id: use.id,
    expectedRevision: 1,
    caption: "One",
    altText: "",
  };
  for (const context of [c.context, (await actor("VIEWER")).context]) {
    await expect(mutateScreenshot(context, request)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      getScreenshotGallery(context, { releaseId: c.release.id }, true),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  }
  await expect(
    mutateScreenshot(admin.context, { ...request, id: foreign.id }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  const results = await Promise.allSettled([
    mutateScreenshot(admin.context, request),
    mutateScreenshot(admin.context, { ...request, caption: "Two" }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { code: "STALE" },
  });
  await db.gameRelease.update({
    where: { id: c.release.id },
    data: { archivedAt: new Date() },
  });
  await expect(
    mutateScreenshot(admin.context, { ...request, expectedRevision: 2 }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
it("rechecks role after the catalog lock and rolls back a failed persistence/history transaction", async () => {
  const c = await copy();
  const admin = await actor("ADMIN");
  const use = await shot(c.release.id, null);
  const request = {
    operation: "delete",
    releaseId: c.release.id,
    id: use.id,
    expectedRevision: 1,
  };
  const remove = repository.removeScreenshot;
  vi.spyOn(repository, "removeScreenshot").mockImplementation(
    async (...args) => {
      await remove(...args);
      throw new Error("failure after unlink");
    },
  );
  await expect(mutateScreenshot(admin.context, request)).rejects.toMatchObject({
    code: "UNAVAILABLE",
  });
  expect(
    await db.catalogAsset.findUnique({ where: { id: use.id } }),
  ).not.toBeNull();
  expect(await db.metadataChange.count()).toBe(0);
  vi.restoreAllMocks();
  const lock = catalog.lockCatalogWrites;
  vi.spyOn(catalog, "lockCatalogWrites").mockImplementation(async (tx) => {
    await lock(tx);
    await db.accessGrant.update({
      where: { id: admin.grant.id },
      data: { role: "EDITOR" },
    });
  });
  await expect(mutateScreenshot(admin.context, request)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
