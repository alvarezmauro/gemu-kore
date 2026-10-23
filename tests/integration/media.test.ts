import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { requirePrivateAccess } from "@/server/auth/access";
import { disconnectDatabase, getDatabase } from "@/server/db/client";
import {
  getMediaManagement,
  mutateMedia,
} from "@/server/services/collection/media";
import { withTransaction } from "@/server/db/transaction";
import type { AccessRole } from "@/features/auth/contracts";
import { photoTypes, type PhotoType } from "@/features/media/contracts";
import * as items from "@/server/repositories/collection/items";
import { signedSessionCookie } from "../helpers/access-session";
const db = getDatabase();
const secret = "media-integration-secret-longer-than-thirty-two-characters";
async function actor(role: AccessRole = "EDITOR") {
  const email = `${randomUUID()}@example.com`;
  const user = await db.user.create({
    data: { name: "Media fixture", email, emailVerified: true },
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
  return { context, grant, user, session };
}
async function copies() {
  const platform = await db.consolePlatform.create({
    data: { name: "PlayStation", slug: randomUUID() },
  });
  const model = await db.consoleModel.create({
    data: { name: "SCPH-1001", slug: randomUUID(), platformId: platform.id },
  });
  const game = await db.game.create({
    data: { name: "Chrono Cross", slug: randomUUID() },
  });
  const release = await db.gameRelease.create({
    data: {
      gameId: game.id,
      platformId: platform.id,
      slug: randomUUID(),
      editionName: "Original",
    },
  });
  const accessory = await db.accessory.create({
    data: { name: "Controller", slug: randomUUID() },
  });
  const variant = await db.accessoryVariant.create({
    data: { name: "Gray", accessoryId: accessory.id, slug: randomUUID() },
  });
  const first = await db.collectionItem.create({
    data: {
      type: "GAME",
      notes: "Do not expose",
      serialNumber: "Private serial",
      ownedGame: { create: { gameReleaseId: release.id } },
    },
  });
  const second = await db.collectionItem.create({
    data: {
      type: "GAME",
      ownedGame: { create: { gameReleaseId: release.id } },
    },
  });
  const consoleCopy = await db.collectionItem.create({
    data: {
      type: "CONSOLE",
      ownedConsole: { create: { consoleModelId: model.id } },
    },
  });
  const accessoryCopy = await db.collectionItem.create({
    data: {
      type: "ACCESSORY",
      ownedAccessory: { create: { accessoryVariantId: variant.id } },
    },
  });
  return { first, second, consoleCopy, accessoryCopy, release };
}

async function photo(itemId: string, type: PhotoType = "PHOTO", sortOrder = 0) {
  const asset = await db.asset.create({
    data: {
      kind: "IMAGE",
      scope: "COLLECTION",
      state: "READY",
      deliveryClass: "DISPLAY",
      mimeType: "image/webp",
      sizeBytes: 1,
      sha256: "a".repeat(64),
      width: 40,
      height: 80,
      storageNamespace: "fixture",
      objectKey: randomUUID(),
      originalFilename: "private filename",
    },
  });
  return db.collectionItemMedia.create({
    data: { collectionItemId: itemId, assetId: asset.id, type, sortOrder },
  });
}
const update = (
  collectionItemId: string,
  id: string,
  expectedRevision = 1,
) => ({
  operation: "update",
  collectionItemId,
  expectedRevision,
  id,
  type: "FRONT",
  caption: " Front of my copy ",
  altText: " White case ",
});
async function reset() {
  await db.$executeRaw`TRUNCATE TABLE asset, collection_item, console_platform, game, accessory CASCADE`;
  await db.publicSettings.update({
    where: { id: 1 },
    data: { showPersonalPhotos: false, publicCollectionEnabled: false },
  });
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
  await reset();
});
afterAll(async () => {
  await reset();
  await disconnectDatabase();
  vi.unstubAllEnvs();
});
it("returns a real empty collection", async () => {
  const { context } = await actor();
  expect(await getMediaManagement(context)).toEqual({
    items: [],
    hasMoreCopies: false,
    copyPage: 0,
    selected: null,
    photos: [],
    canManage: true,
  });
});
it.each(["ADMIN", "EDITOR"] as const)(
  "lets %s edit and remove a copy's use without deleting stored assets",
  async (role) => {
    const { context, user } = await actor(role);
    const { first, second } = await copies();
    const own = await photo(first.id);
    const other = await db.collectionItemMedia.create({
      data: { collectionItemId: second.id, assetId: own.assetId },
    });
    await mutateMedia(context, update(first.id, own.id));
    expect(
      (await getMediaManagement(context, first.id)).photos[0],
    ).toMatchObject({
      type: "FRONT",
      caption: "Front of my copy",
      altText: "White case",
    });
    expect(
      await db.collectionItem.findUnique({ where: { id: first.id } }),
    ).toMatchObject({ revision: 2, updatedById: user.id });
    await mutateMedia(context, {
      operation: "delete",
      collectionItemId: first.id,
      id: own.id,
      expectedRevision: 2,
    });
    expect(await db.asset.count()).toBe(1);
    expect(
      await db.collectionItemMedia.findUnique({ where: { id: other.id } }),
    ).not.toBeNull();
    expect((await getMediaManagement(context, first.id)).photos).toEqual([]);
  },
);
it("keeps all owned category labels distinct and excludes private item and asset metadata", async () => {
  const { context } = await actor();
  const { first, second, consoleCopy, accessoryCopy } = await copies();
  const own = await photo(first.id);
  const dto = await getMediaManagement(context, first.id);
  expect(dto.items).toHaveLength(4);
  expect(dto.items.find((x) => x.id === consoleCopy.id)?.label).toContain(
    "SCPH-1001",
  );
  expect(dto.items.find((x) => x.id === accessoryCopy.id)?.label).toContain(
    "Controller",
  );
  expect(dto.items.find((x) => x.id === first.id)?.label).not.toEqual(
    dto.items.find((x) => x.id === second.id)?.label,
  );
  expect(dto.photos[0]).toMatchObject({
    id: own.id,
    displayUrl: `/api/media/private/${own.assetId}`,
    width: 40,
    height: 80,
  });
  for (const secret of [
    "Do not expose",
    "Private serial",
    "private filename",
    "objectKey",
    "storageNamespace",
    "uploadedById",
    "sha256",
  ])
    expect(JSON.stringify(dto)).not.toContain(secret);
});
it.each(photoTypes)("persists %s classification", async (type) => {
  const { context } = await actor();
  const { first } = await copies();
  const own = await photo(first.id);
  await mutateMedia(context, { ...update(first.id, own.id), type });
  expect((await getMediaManagement(context, first.id)).photos[0].type).toBe(
    type,
  );
});
it("lets viewers read but rejects forged mutations", async () => {
  const { context } = await actor("VIEWER");
  const { first } = await copies();
  const own = await photo(first.id);
  expect((await getMediaManagement(context, first.id)).canManage).toBe(false);
  await expect(
    mutateMedia(context, update(first.id, own.id)),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it.each(["update", "delete"])("rejects cross-copy %s", async (operation) => {
  const { context } = await actor();
  const { first, second } = await copies();
  const own = await photo(second.id);
  const input =
    operation === "update"
      ? update(first.id, own.id)
      : {
          operation,
          collectionItemId: first.id,
          id: own.id,
          expectedRevision: 1,
        };
  await expect(mutateMedia(context, input)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expect(await db.collectionItemMedia.count()).toBe(1);
});
it("orders the exact photo set, preserves custom roles and rejects missing/foreign IDs", async () => {
  const { context } = await actor();
  const { first, second, consoleCopy } = await copies();
  const a = await photo(consoleCopy.id, "PHOTO", 3);
  const b = await photo(consoleCopy.id, "BOX", 3);
  const custom = await db.collectionItemMedia.create({
    data: {
      collectionItemId: consoleCopy.id,
      assetId: a.assetId,
      type: "CUSTOM_LOGO",
      sortOrder: 7,
    },
  });
  const foreign = await photo(second.id);
  await photo(first.id);
  const payload = {
    operation: "reorder",
    collectionItemId: consoleCopy.id,
    expectedRevision: 1,
    ids: [b.id, a.id].sort().reverse(),
  };
  await mutateMedia(context, payload);
  expect(
    (await getMediaManagement(context, consoleCopy.id)).photos.map((x) => x.id),
  ).toEqual(payload.ids);
  expect(
    await db.collectionItemMedia.findUnique({ where: { id: custom.id } }),
  ).toMatchObject({ sortOrder: 7, type: "CUSTOM_LOGO" });
  for (const ids of [[a.id], [a.id, foreign.id], [a.id, custom.id]])
    await expect(
      mutateMedia(context, { ...payload, expectedRevision: 2, ids }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    mutateMedia(context, update(consoleCopy.id, custom.id, 2)),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("rejects stale changes and serializes concurrent edits on one copy", async () => {
  const { context } = await actor();
  const { first } = await copies();
  const own = await photo(first.id);
  const results = await Promise.allSettled([
    mutateMedia(context, update(first.id, own.id)),
    mutateMedia(context, { ...update(first.id, own.id), caption: "Other" }),
  ]);
  expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  expect(results.find((x) => x.status === "rejected")).toMatchObject({
    reason: { code: "STALE" },
  });
  expect((await getMediaManagement(context, first.id)).selected?.revision).toBe(
    2,
  );
});
it("does not advance a revision for unchanged photo content or order", async () => {
  const { context } = await actor();
  const { first } = await copies();
  const own = await photo(first.id);
  await mutateMedia(context, {
    ...update(first.id, own.id),
    type: "PHOTO",
    caption: null,
    altText: null,
  });
  await mutateMedia(context, {
    operation: "reorder",
    collectionItemId: first.id,
    expectedRevision: 1,
    ids: [own.id],
  });
  expect((await getMediaManagement(context, first.id)).selected?.revision).toBe(
    1,
  );
});
it.each([true, false])(
  "resets use approval and only unpublishes when personal photos contribute (%s)",
  async (showPersonalPhotos) => {
    const { context, user } = await actor("ADMIN");
    const { first } = await copies();
    const own = await photo(first.id);
    await db.asset.update({
      where: { id: own.assetId },
      data: {
        publicSafe: true,
        rightsStatus: "APPROVED",
        reviewedAt: new Date(),
        reviewedById: user.id,
      },
    });
    await db.collectionItemMedia.update({
      where: { id: own.id },
      data: { publicDisplayAssetId: own.assetId },
    });
    await db.collectionItemMedia.update({
      where: { id: own.id },
      data: {
        publicApproved: true,
        approvedAt: new Date(),
        approvedById: user.id,
      },
    });
    await db.publicSettings.update({
      where: { id: 1 },
      data: { showPersonalPhotos },
    });
    await db.collectionItem.update({
      where: { id: first.id },
      data: {
        publicationStatus: "PUBLISHED",
        publishedAt: new Date(),
        publishedById: user.id,
      },
    });
    await mutateMedia(context, { ...update(first.id, own.id), type: "SERIAL" });
    expect(
      await db.collectionItemMedia.findUnique({ where: { id: own.id } }),
    ).toMatchObject({
      publicApproved: false,
      approvedAt: null,
      approvedById: null,
    });
    expect(
      await db.collectionItem.findUnique({ where: { id: first.id } }),
    ).toMatchObject({
      publicationStatus: showPersonalPhotos ? "PRIVATE" : "PUBLISHED",
    });
  },
);
it.each(["delete", "reorder"])(
  "unpublishes when %s removes or rearranges an approved photo",
  async (operation) => {
    const { context, user } = await actor("ADMIN");
    const { first } = await copies();
    const a = await photo(first.id, "PHOTO", 0);
    const b = await photo(first.id, "BOX", 1);
    await db.asset.update({
      where: { id: a.assetId },
      data: {
        publicSafe: true,
        rightsStatus: "APPROVED",
        reviewedAt: new Date(),
        reviewedById: user.id,
      },
    });
    await db.collectionItemMedia.update({
      where: { id: a.id },
      data: { publicDisplayAssetId: a.assetId },
    });
    await db.collectionItemMedia.update({
      where: { id: a.id },
      data: {
        publicApproved: true,
        approvedAt: new Date(),
        approvedById: user.id,
      },
    });
    await db.publicSettings.update({
      where: { id: 1 },
      data: { showPersonalPhotos: true },
    });
    await db.collectionItem.update({
      where: { id: first.id },
      data: {
        publicationStatus: "PUBLISHED",
        publishedAt: new Date(),
        publishedById: user.id,
      },
    });
    await mutateMedia(
      context,
      operation === "delete"
        ? {
            operation,
            collectionItemId: first.id,
            id: a.id,
            expectedRevision: 1,
          }
        : {
            operation,
            collectionItemId: first.id,
            ids: [b.id, a.id],
            expectedRevision: 1,
          },
    );
    expect(
      await db.collectionItem.findUnique({ where: { id: first.id } }),
    ).toMatchObject({
      publicationStatus: "PRIVATE",
      publishedAt: null,
      publishedById: null,
    });
  },
);
it("rechecks a downgraded actor after waiting for the collection row lock", async () => {
  const { context, grant } = await actor();
  const { first } = await copies();
  const own = await photo(first.id);
  let release!: () => void;
  let acquired!: () => void;
  let attempted!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const held = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    attempted = resolve;
  });
  const holder = withTransaction(async (tx) => {
    await items.lockCollectionItem(first.id, tx);
    acquired();
    await gate;
  });
  await held;
  const original = items.lockCollectionItem;
  const spy = vi
    .spyOn(items, "lockCollectionItem")
    .mockImplementation(async (...args) => {
      attempted();
      return original(...args);
    });
  const mutation = mutateMedia(context, update(first.id, own.id));
  const result = expect(mutation).rejects.toMatchObject({ code: "FORBIDDEN" });
  try {
    await waiting;
    await db.accessGrant.update({
      where: { id: grant.id },
      data: { role: "VIEWER" },
    });
    release();
    await holder;
    await result;
    expect(
      (await getMediaManagement(context, first.id)).selected?.revision,
    ).toBe(1);
  } finally {
    release();
    await holder;
    spy.mockRestore();
  }
});
it.each(["bad", [randomUUID()], randomUUID()])(
  "fails closed for missing or malformed copy %j",
  async (id) => {
    const { context } = await actor();
    await expect(getMediaManagement(context, id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  },
);
it("revalidates a revoked session for reads and writes", async () => {
  const { context, session } = await actor();
  const { first } = await copies();
  const own = await photo(first.id);
  await db.session.delete({ where: { id: session.id } });
  await expect(getMediaManagement(context, first.id)).rejects.toBeDefined();
  await expect(
    mutateMedia(context, update(first.id, own.id)),
  ).rejects.toBeDefined();
});

it("can edit private photo details after a formerly approved display's rights are revoked", async () => {
  const { context, user } = await actor("ADMIN");
  const { first } = await copies();
  const own = await photo(first.id);
  await db.asset.update({
    where: { id: own.assetId },
    data: {
      publicSafe: true,
      rightsStatus: "APPROVED",
      reviewedAt: new Date(),
      reviewedById: user.id,
    },
  });
  await db.collectionItemMedia.update({
    where: { id: own.id },
    data: { publicDisplayAssetId: own.assetId },
  });
  await db.collectionItemMedia.update({
    where: { id: own.id },
    data: {
      publicApproved: true,
      approvedAt: new Date(),
      approvedById: user.id,
    },
  });
  await db.asset.update({
    where: { id: own.assetId },
    data: { rightsStatus: "RESTRICTED" },
  });
  await mutateMedia(context, update(first.id, own.id));
  expect(
    await db.collectionItemMedia.findUnique({ where: { id: own.id } }),
  ).toMatchObject({
    caption: "Front of my copy",
    publicApproved: false,
    publicDisplayAssetId: null,
  });
});

it("bounds management choices, searches displayed identities literally and pages every physical copy", async () => {
  const { context, grant } = await actor("VIEWER");
  const data = await copies();
  const { findCollectionCopies } =
    await import("@/server/services/collection/items");
  const { getDefectManagement } =
    await import("@/server/services/collection/defects");
  const createdAt = new Date("2020-01-01T00:00:00Z");
  await db.$transaction(async (tx) => {
    for (let n = 0; n < 61; n++)
      await tx.collectionItem.create({
        data: {
          type: "GAME",
          createdAt,
          ownedGame: { create: { gameReleaseId: data.release.id } },
        },
      });
  });
  const expected = await db.collectionItem.findMany({
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const found: string[] = [];
  for (let page = 0; page < 3; page++) {
    const result = await findCollectionCopies(context, { query: "", page });
    expect(result.items.length).toBeLessThanOrEqual(25);
    expect(result.hasMore).toBe(page < 2);
    found.push(...result.items.map((item) => item.id));
  }
  expect(found).toEqual(expected.map((item) => item.id));
  for (const read of [getMediaManagement, getDefectManagement]) {
    const result = await read(context, data.accessoryCopy.id);
    expect(result.items).toHaveLength(25);
    expect(result.hasMoreCopies).toBe(true);
    expect(result.selected?.id).toBe(data.accessoryCopy.id);
    expect(result.items.some((item) => item.id === data.accessoryCopy.id)).toBe(
      false,
    );
    expect(result.canManage).toBe(false);
    const later = await read(context, data.accessoryCopy.id, "1");
    expect(later.copyPage).toBe(1);
    expect(later.items.map((item) => item.id)).toEqual(
      expected.slice(25, 50).map((item) => item.id),
    );
    expect(later.selected?.id).toBe(data.accessoryCopy.id);
    await expect(
      read(context, data.accessoryCopy.id, ["1"]),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
  for (const [query, id] of [
    ["SCPH-1001", data.consoleCopy.id],
    ["Gray", data.accessoryCopy.id],
    [data.accessoryCopy.id.slice(0, 8), data.accessoryCopy.id],
  ]) {
    expect(
      (await findCollectionCopies(context, { query })).items.map(
        (item) => item.id,
      ),
    ).toContain(id);
  }
  for (const query of [
    "Do not expose",
    "Private serial",
    "%_\\",
    "no such copy",
  ])
    expect((await findCollectionCopies(context, { query })).items).toEqual([]);
  await db.game.update({
    where: { id: data.release.gameId },
    data: { name: "Literal %_\\ name", archivedAt: new Date() },
  });
  expect(
    (await findCollectionCopies(context, { query: "%_\\" })).items,
  ).toHaveLength(25);
  await expect(
    findCollectionCopies(context, { query: "x".repeat(201) }),
  ).rejects.toThrow();
  await expect(findCollectionCopies(context, { page: -1 })).rejects.toThrow();
  await expect(
    findCollectionCopies(context, { role: "ADMIN" }),
  ).rejects.toThrow();
  await db.accessGrant.update({
    where: { id: grant.id },
    data: { enabled: false },
  });
  await expect(findCollectionCopies(context, {})).rejects.toMatchObject({
    code: "DENIED",
  });
});
