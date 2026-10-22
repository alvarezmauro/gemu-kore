import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import {
  requirePrivateAccess,
  type PrivateAccessContext,
} from "@/server/auth/access";
import { getDatabase, disconnectDatabase } from "@/server/db/client";
import { withTransaction } from "@/server/db/transaction";
import {
  getPublicHome,
  getPublicCollection,
  getPublicConsole,
  getPublicGame,
  getPublicAccessory,
  PublicCollectionError,
} from "@/server/services/public-collection";
import {
  getPublicationSettings,
  reviewPublicSettings,
  updatePublicSettings,
  getItemPublicationReview,
  setItemPublication,
} from "@/server/services/public-collection/publication";
import * as policyRepository from "@/server/repositories/public-collection/policy";
import * as queryRepository from "@/server/repositories/public-collection/query";
import { getLocations, mutateLocation } from "@/server/services/locations";
import { seedDashboardData } from "../helpers/dashboard-data";
import { publicSearchRequest } from "@/server/http/public-search";
import { signedSessionCookie } from "../helpers/access-session";
const db = getDatabase(),
  secret = "public-query-integration-secret-longer-than-thirty-two-characters";
const defaults = {
  publicCollectionEnabled: false,
  allowSearchEngineIndexing: false,
  showSerialNumbers: false,
  showLocations: false,
  showNotes: false,
  showDefects: false,
  showPersonalPhotos: false,
};
async function actor(role: "ADMIN" | "EDITOR" | "VIEWER" = "ADMIN") {
  const email = `${randomUUID()}@example.com`;
  const user = await db.user.create({
    data: { email, name: "Private account name", emailVerified: true },
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
async function settings(
  context: PrivateAccessContext,
  changes: Partial<typeof defaults>,
) {
  const { revision, ...current } = await getPublicationSettings(context);
  const request = {
    expectedRevision: revision,
    settings: { ...current, ...changes },
  };
  const preview = await reviewPublicSettings(context, request);
  return updatePublicSettings(context, {
    ...request,
    reviewToken: preview.reviewToken,
    reviewed: true,
  });
}
async function publish(
  context: PrivateAccessContext,
  id: string,
  published = true,
) {
  const preview = await getItemPublicationReview(context, { id, published });
  return setItemPublication(context, {
    id,
    published,
    expectedRevision: preview.revision,
    expectedSettingsRevision: preview.settingsRevision,
    reviewToken: preview.reviewToken,
    reviewed: true,
  });
}
async function seedPublished() {
  const a = await actor(),
    data = await seedDashboardData(db);
  await settings(a.context, { publicCollectionEnabled: true });
  for (const item of data.items.slice(0, 3)) await publish(a.context, item.id);
  return { ...a, data };
}
async function reset() {
  await db.$executeRaw`TRUNCATE TABLE asset, location, company, region, console_platform, game, collection_item, accessory CASCADE`;
  await db.accessGrant.deleteMany();
  await db.user.deleteMany();
  await db.publicSettings.update({
    where: { id: 1 },
    data: { ...defaults, revision: 1 },
  });
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

it("denies disabled/missing policy without leaking configured identity or reading collection data", async () => {
  await seedDashboardData(db);
  const page = vi.spyOn(queryRepository, "collectionPage");
  expect(await getPublicHome()).toEqual({
    state: "private",
    message: "This collection is currently private.",
  });
  await expect(getPublicCollection()).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(getPublicGame({ id: randomUUID() })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  vi.spyOn(policyRepository, "readPolicy").mockResolvedValueOnce(null);
  expect((await getPublicHome()).state).toBe("private");
  expect(page).not.toHaveBeenCalled();
});
it("returns published physical copies, safe identities, scoped counts/facets and owned UUID links", async () => {
  const { context, data } = await seedPublished();
  await publish(context, data.items[4].id);
  const hidden = await db.consolePlatform.create({
    data: { name: "Hidden private platform", slug: "private-platform" },
  });
  const hiddenModel = await db.consoleModel.create({
    data: {
      name: "Hidden model",
      slug: "private-model",
      platformId: hidden.id,
    },
  });
  await db.ownedConsole.update({
    where: { collectionItemId: data.items[3].id },
    data: { consoleModelId: hiddenModel.id },
  });
  const result = await getPublicCollection();
  expect(result.counts).toEqual({
    total: 4,
    consoles: 1,
    games: 2,
    accessories: 1,
    boxed: 1,
  });
  expect(result.items).toHaveLength(4);
  expect(
    result.items
      .filter((r) => r.type === "GAME")
      .map((r) => r.href)
      .sort(),
  ).toEqual(
    [data.items[1], data.items[4]]
      .map((i) => `/collection/games/${i.id}`)
      .sort(),
  );
  expect(result.items.every((r) => r.photo === null)).toBe(true);
  expect(result.facets.some((f) => f.value === hidden.id)).toBe(false);
  expect(JSON.stringify(result)).not.toMatch(
    /PRIVATE-|serialNumber|notes|repair|location|updatedAt|revision|actor|email|private-platform|Hidden private|objectKey|\/app\//i,
  );
  expect((await getPublicHome()).state).toBe("public");
});
it("returns canonical detail facts for all categories without private aggregate fields", async () => {
  const { data } = await seedPublished();
  await db.collectionItem.updateMany({
    data: { observedMarkings: "SECRET-MARKINGS" },
  });
  for (const [read, item, title] of [
    [getPublicConsole, data.items[0], "Super Nintendo"],
    [getPublicGame, data.items[1], "Chrono Trigger"],
    [getPublicAccessory, data.items[2], "Controller"],
  ] as const) {
    const result = await read({ id: item.id });
    expect(result.title).toBe(title);
    expect(result).not.toHaveProperty("serialNumber");
    expect(result).not.toHaveProperty("notes");
    expect(result).not.toHaveProperty("location");
    expect(result).not.toHaveProperty("defects");
    expect(JSON.stringify(result)).not.toMatch(
      /SECRET|PRIVATE-|publishedAt|publishedBy|observedMarkings|metadata|objectKey|createdAt|revision|repairNote/i,
    );
  }
  await expect(getPublicGame({ id: data.items[0].id })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(getPublicGame({ id: data.release.id })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(
    getPublicConsole({ id: data.items[3].id }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(getPublicConsole({ id: "bad-id" })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});
it("invalidates widened projections once per affected published copy and exposes only allowed fields after fresh approval", async () => {
  const { context, data } = await seedPublished();
  const room = await db.location.create({
    data: {
      name: "Exact private room",
      normalizedName: "exact private room",
      type: "ROOM",
      description: "HIDDEN-LOCATION-DESCRIPTION",
    },
  });
  const shelf = await db.location.create({
    data: {
      name: "Shelf 2",
      normalizedName: "shelf 2",
      type: "SHELF",
      parentId: room.id,
    },
  });
  await db.collectionItem.update({
    where: { id: data.items[0].id },
    data: { locationId: shelf.id },
  });
  const before = await db.collectionItem.findUniqueOrThrow({
    where: { id: data.items[0].id },
  });
  const changed = await settings(context, {
    showSerialNumbers: true,
    showNotes: true,
    showLocations: true,
    showDefects: true,
    showPersonalPhotos: true,
  });
  expect(changed.unpublished).toBe(3);
  expect(
    (await db.collectionItem.findUniqueOrThrow({ where: { id: before.id } }))
      .revision,
  ).toBe(before.revision + 1);
  expect((await getPublicCollection()).counts.total).toBe(0);
  await publish(context, before.id);
  const result = await getPublicConsole({ id: before.id });
  expect(result.serialNumber).toBe("PRIVATE-SERIAL-0");
  expect(result.notes).toBe("PRIVATE-NOTE-0");
  expect(result.location).toEqual({
    name: "Shelf 2",
    type: "SHELF",
    breadcrumb: ["Exact private room", "Shelf 2"],
  });
  expect(result.defects?.items).toHaveLength(2);
  expect(JSON.stringify(result)).not.toMatch(
    /HIDDEN-LOCATION|repairNote|resolvedAt|publishedById|approvedBy|observedMarkings/,
  );
  expect(
    (await getPublicCollection()).facets.some(
      (f) => f.field === "location" && f.value === shelf.id,
    ),
  ).toBe(true);
});
it("keeps hidden notes/defects from matching or ranking and serials/repairs out of search even when visible", async () => {
  const { context, data } = await seedPublished();
  const before = await getPublicCollection({ q: "Chrono" });
  await db.collectionItem.update({
    where: { id: data.items[1].id },
    data: { notes: "Chrono Chrono SecretNote", serialNumber: "Chrono" },
  });
  await db.defect.updateMany({ data: { repairNote: "PrivateRepairSearch" } });
  expect(await getPublicCollection({ q: "Chrono" })).toEqual(before);
  expect((await getPublicCollection({ q: "SecretNote" })).items).toEqual([]);
  expect((await getPublicCollection({ q: "accepted" })).items).toEqual([]);
  await settings(context, {
    showNotes: true,
    showDefects: true,
    showSerialNumbers: true,
  });
  await publish(context, data.items[1].id);
  expect(
    (await getPublicCollection({ q: "SecretNote" })).items.map((i) => i.id),
  ).toEqual([data.items[1].id]);
  expect(
    (await getPublicCollection({ q: "accepted" })).items.map((i) => i.id),
  ).toEqual([data.items[1].id]);
  expect((await getPublicCollection({ q: "PRIVATE-SERIAL-0" })).items).toEqual(
    [],
  );
  expect(
    (await getPublicCollection({ q: "PrivateRepairSearch" })).items,
  ).toEqual([]);
});
it("filters complete public sets before bounded paging and keeps ties/final pages truthful", async () => {
  const { context, data } = await seedPublished();
  for (const item of data.items.slice(3)) await publish(context, item.id);
  const ids: string[] = [];
  for (let offset = 0; offset < 12; offset += 2) {
    const result = await getPublicCollection({
      limit: 2,
      offset,
      sort: "name-asc",
    });
    expect(result.counts.total).toBe(12);
    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(offset < 10);
    ids.push(...result.items.map((r) => r.id));
  }
  expect(new Set(ids).size).toBe(12);
  expect(
    (
      await getPublicCollection({
        type: "GAME",
        platform: data.platform.id,
        hasBox: "false",
      })
    ).counts.total,
  ).toBe(4);
  expect((await getPublicCollection({ hasBox: "unknown" })).counts.total).toBe(
    4,
  );
  expect((await getPublicCollection({ offset: 12 })).items).toEqual([]);
  await expect(
    getPublicCollection({ hasDefects: false }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    getPublicCollection({ location: randomUUID() }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});

it("advertises only current public filter capabilities and revokes them with policy", async () => {
  const { context } = await seedPublished();
  expect((await getPublicCollection()).filters).toEqual({});
  await settings(context, { showDefects: true });
  expect((await getPublicCollection()).filters).toEqual({ hasDefects: true });
  await settings(context, { showLocations: true });
  expect((await getPublicCollection()).filters).toEqual({
    location: true,
    hasDefects: true,
  });
  await settings(context, { showDefects: false, showLocations: false });
  expect((await getPublicCollection()).filters).toEqual({});
  await expect(
    getPublicCollection({ hasDefects: false }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
it("serves public URL queries with policy-first denial, fixed paging and no private identity", async () => {
  const url = "https://example.test/api/search/public";
  expect(
    (await publicSearchRequest(new Request(`${url}?role=ADMIN`))).status,
  ).toBe(404);
  const { data } = await seedPublished();
  const response = await publicSearchRequest(
    new Request(`${url}?type=game&q=Chrono&page=1`, {
      headers: { "x-role": "ADMIN", cookie: "role=ADMIN" },
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const result = await response.json();
  expect(result.items.map((item: { id: string }) => item.id)).toEqual([
    data.items[1].id,
  ]);
  expect(result).toMatchObject({
    filters: {},
    limit: 20,
    offset: 0,
    counts: { total: 1, games: 1 },
  });
  expect(JSON.stringify(result)).not.toMatch(
    /PRIVATE-|serialNumber|notes|repair|location|email|objectKey|\/app\//i,
  );
  for (const query of [
    "role=ADMIN",
    "q=Chrono&q=Controller",
    "type=GAME",
    "page=252",
    "hasDefects=false",
    "limit=5000",
  ])
    expect(
      (await publicSearchRequest(new Request(`${url}?${query}`))).status,
    ).toBe(400);
});
it.each(["VIEWER", "EDITOR"] as const)(
  "denies %s publication and settings commands with current server policy",
  async (role) => {
    const { context } = await actor(role);
    const data = await seedDashboardData(db);
    await expect(getPublicationSettings(context)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      getItemPublicationReview(context, { id: data.items[0].id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updatePublicSettings(context, {})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(setItemPublication(context, {})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  },
);
it("rejects stale copy, policy and shared-catalog reviews and rechecks revoked administrator roles", async () => {
  const { context, grant } = await actor(),
    data = await seedDashboardData(db);
  const review = await getItemPublicationReview(context, {
    id: data.items[0].id,
  });
  const request = {
    id: data.items[0].id,
    published: true,
    expectedRevision: review.revision,
    expectedSettingsRevision: review.settingsRevision,
    reviewToken: review.reviewToken,
    reviewed: true,
  };
  await db.game.update({
    where: { id: data.game.id },
    data: { name: "Changed shared fact", revision: { increment: 1 } },
  });
  await expect(setItemPublication(context, request)).rejects.toMatchObject({
    code: "STALE",
  });
  await db.accessGrant.update({
    where: { id: grant.id },
    data: { role: "VIEWER" },
  });
  await expect(setItemPublication(context, request)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  expect(
    (await db.collectionItem.findUniqueOrThrow({ where: { id: request.id } }))
      .publicationStatus,
  ).toBe("PRIVATE");
});
it("preserves no-op approval and pause choices, while narrowing immediately hides optional fields", async () => {
  const { context, data } = await seedPublished();
  const before = await db.collectionItem.findUniqueOrThrow({
    where: { id: data.items[0].id },
  });
  expect(await publish(context, before.id)).toEqual({
    revision: before.revision,
  });
  const current = await getPublicationSettings(context);
  expect((await settings(context, {})).revision).toBe(current.revision);
  await settings(context, { publicCollectionEnabled: false });
  await expect(getPublicConsole({ id: before.id })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expect(
    (await db.collectionItem.findUniqueOrThrow({ where: { id: before.id } }))
      .publicationStatus,
  ).toBe("PUBLISHED");
  await settings(context, {
    publicCollectionEnabled: true,
    showSerialNumbers: true,
  });
  await publish(context, before.id);
  expect(await getPublicConsole({ id: before.id })).toHaveProperty(
    "serialNumber",
  );
  await settings(context, { showSerialNumbers: false });
  expect(await getPublicConsole({ id: before.id })).not.toHaveProperty(
    "serialNumber",
  );
});
it("invalidates published copies when a disclosed location ancestor is renamed or moved", async () => {
  const { context, data } = await seedPublished();
  await mutateLocation(context, {
    operation: "create",
    name: "Room",
    parentId: null,
    type: "ROOM",
    description: "",
  });
  const room = (await getLocations(context)).locations[0];
  await mutateLocation(context, {
    operation: "create",
    name: "Shelf",
    parentId: room.id,
    type: "SHELF",
    description: "",
  });
  const shelf = (await getLocations(context)).locations.find(
    (l) => l.name === "Shelf",
  )!;
  await db.collectionItem.update({
    where: { id: data.items[0].id },
    data: { locationId: shelf.id },
  });
  await settings(context, { showLocations: true });
  await publish(context, data.items[0].id);
  await mutateLocation(context, {
    operation: "update",
    id: room.id,
    updatedAt: room.updatedAt,
    name: "Changed room",
    type: "ROOM",
    parentId: null,
    description: "",
  });
  await expect(
    getPublicConsole({ id: data.items[0].id }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(
    (
      await db.collectionItem.findUniqueOrThrow({
        where: { id: data.items[1].id },
      })
    ).publicationStatus,
  ).toBe("PUBLISHED");
});
it("keeps counts and page data in one snapshot during deletion and refreshes on the next read", async () => {
  const { data } = await seedPublished();
  const original = queryRepository.collectionPage;
  vi.spyOn(queryRepository, "collectionPage").mockImplementationOnce(
    async (...args) => {
      const rows = await original(...args);
      await db.collectionItem.delete({ where: { id: data.items[0].id } });
      return rows;
    },
  );
  const result = await getPublicCollection();
  expect(result.counts.total).toBe(3);
  expect(result.items).toHaveLength(3);
  expect((await getPublicCollection()).counts.total).toBe(2);
});
it("serializes settings against application writers and rejects a review made before a queued edit", async () => {
  const { context, data } = await seedPublished();
  const current = await getPublicationSettings(context),
    { revision, ...values } = current;
  const request = {
    expectedRevision: revision,
    settings: { ...values, showNotes: true },
  };
  const preview = await reviewPublicSettings(context, request);
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const writer = withTransaction(async (tx) => {
    await tx.collectionItem.update({
      where: { id: data.items[0].id },
      data: { notes: "Concurrent private change", revision: { increment: 1 } },
    });
    entered();
    await gate;
  });
  await ready;
  const command = updatePublicSettings(context, {
    ...request,
    reviewToken: preview.reviewToken,
    reviewed: true,
  }).then(
    () => "committed",
    (e: PublicCollectionError) => e.code,
  );
  try {
    await vi.waitFor(
      async () => {
        const [row] = await db.$queryRaw<
          { waiting: boolean }[]
        >`SELECT EXISTS(SELECT FROM pg_locks WHERE locktype='advisory' AND classid=1195724117 AND objid=1347764802 AND mode='ExclusiveLock' AND NOT granted) waiting`;
        expect(row.waiting).toBe(true);
      },
      { timeout: 3000, interval: 25 },
    );
    expect((await getPublicCollection()).counts.total).toBe(3);
  } finally {
    release();
  }
  await writer;
  expect(await command).toBe("STALE");
  expect((await getPublicationSettings(context)).showNotes).toBe(false);
});
it("redacts unexpected failures and treats missing/invalid/private detail IDs alike", async () => {
  await seedPublished();
  const reads = [
    () => getPublicConsole({ id: randomUUID() }),
    () => getPublicConsole({ id: "bad" }),
  ];
  for (const read of reads)
    await expect(read()).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "This page is unavailable.",
    });
  vi.spyOn(policyRepository, "readPolicy").mockRejectedValueOnce(
    new Error("PRIVATE DATABASE PASSWORD"),
  );
  await expect(getPublicCollection()).rejects.toMatchObject({
    code: "UNAVAILABLE",
    message: "The collection is unavailable right now.",
  });
});
it("enforces read-only public transactions at the database boundary", async () => {
  await seedPublished();
  await expect(
    withTransaction((tx) => tx.collectionItem.deleteMany(), {
      publicationPolicy: "read",
    }),
  ).rejects.toThrow();
  expect(await db.collectionItem.count()).toBe(12);
  expect((await getPublicCollection()).counts.total).toBe(3);
});
it("filters public company/region/year facts and preserves scoped credits, compatibility and archived owned identities", async () => {
  const { data } = await seedPublished();
  const region = await db.region.create({
    data: { name: "Japan", slug: "japan", code: "JP" },
  });
  const company = await db.company.create({
    data: { name: "Publisher", slug: "publisher" },
  });
  await db.gameReleaseRegion.create({
    data: {
      gameReleaseId: data.release.id,
      regionId: region.id,
      releaseYear: 1995,
    },
  });
  await db.gameReleaseCompany.create({
    data: {
      gameReleaseId: data.release.id,
      companyId: company.id,
      regionId: region.id,
      role: "PUBLISHER",
    },
  });
  await db.gameCompany.create({
    data: { gameId: data.game.id, companyId: company.id, role: "DEVELOPER" },
  });
  await db.accessoryVariantPlatform.create({
    data: {
      accessoryVariantId: data.variant.id,
      platformId: data.platform.id,
      compatibilityNote: "Explicit variant compatibility",
    },
  });
  await db.gameRelease.update({
    where: { id: data.release.id },
    data: { archivedAt: new Date() },
  });
  const filtered = await getPublicCollection({
    q: "Publisher",
    type: "GAME",
    region: region.id,
    company: company.id,
    year: 1995,
  });
  expect(filtered.items.map((r) => r.id)).toEqual([data.items[1].id]);
  expect(filtered.facets).toContainEqual({
    field: "company",
    value: company.id,
    label: "Publisher",
    count: 1,
  });
  const game = await getPublicGame({ id: data.items[1].id });
  expect(game.markets).toEqual(["Japan"]);
  expect(game.facts).toContainEqual({
    label: "Release publisher · Japan",
    value: "Publisher",
  });
  expect(game.facts).toContainEqual({
    label: "Game developer",
    value: "Publisher",
  });
  const accessory = await getPublicAccessory({ id: data.items[2].id });
  expect(accessory.facts).toContainEqual({
    label: "Compatible platform",
    value: "Super Nintendo · Explicit variant compatibility",
  });
});
it("keeps whole release playtime overrides, zero estimates and unknown values truthful without source internals", async () => {
  const { data } = await seedPublished();
  await db.gamePlaytime.create({
    data: {
      gameId: data.game.id,
      mainMinutes: 0,
      sourceName: "Private provider annotation",
      sourceType: "MANUAL",
      sourceUrl: "https://provider.test/?private=token",
      observedAt: new Date(),
    },
  });
  expect((await getPublicGame({ id: data.items[1].id })).facts).toContainEqual({
    label: "Game main estimate (minutes)",
    value: "0",
  });
  await db.gamePlaytime.create({
    data: {
      gameReleaseId: data.release.id,
      sourceName: "Private override source",
      sourceType: "MANUAL",
      observedAt: new Date(),
    },
  });
  const result = await getPublicGame({ id: data.items[1].id });
  expect(result.facts.some((f) => f.label.includes("estimate"))).toBe(false);
  expect(JSON.stringify(result)).not.toMatch(
    /provider|sourceUrl|observedAt|private=token/i,
  );
});
it("serves exact contextual approved photos only after personal-media enablement and copy re-review", async () => {
  const { context, data } = await seedPublished();
  const image = await db.asset.create({
    data: {
      kind: "IMAGE",
      scope: "COLLECTION",
      state: "READY",
      deliveryClass: "DISPLAY",
      storageNamespace: "private-fixture",
      objectKey: randomUUID(),
      mimeType: "image/webp",
      width: 80,
      height: 60,
      sizeBytes: 100,
      sha256: "a".repeat(64),
      rightsStatus: "APPROVED",
      publicSafe: true,
      reviewedAt: new Date(),
    },
  });
  await db.collectionItemMedia.create({
    data: {
      collectionItemId: data.items[0].id,
      type: "PHOTO",
      assetId: image.id,
      publicDisplayAssetId: image.id,
      publicApproved: true,
      approvedAt: new Date(),
    },
  });
  expect((await getPublicConsole({ id: data.items[0].id })).photo).toBeNull();
  await settings(context, { showPersonalPhotos: true });
  await publish(context, data.items[0].id);
  const detail = await getPublicConsole({ id: data.items[0].id });
  expect(detail.photo?.url).toMatch(
    new RegExp(`^/api/media/public/items/${data.items[0].id}/personal/`),
  );
  expect(JSON.stringify(detail)).not.toMatch(
    /private-fixture|objectKey|publicDisplayAssetId|api\/media\/private/,
  );
  expect(JSON.stringify(await getPublicCollection())).not.toContain(image.id);
});
it("rechecks an administrator revoked while waiting for the publication guard", async () => {
  const { context, grant } = await actor();
  const current = await getPublicationSettings(context),
    { revision, ...values } = current;
  const request = {
    expectedRevision: revision,
    settings: { ...values, publicCollectionEnabled: true },
  };
  const preview = await reviewPublicSettings(context, request);
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const writer = withTransaction(async () => {
    entered();
    await gate;
  });
  await ready;
  const command = updatePublicSettings(context, {
    ...request,
    reviewed: true,
    reviewToken: preview.reviewToken,
  }).then(
    () => "committed",
    (e: { code: string }) => e.code,
  );
  try {
    await vi.waitFor(
      async () => {
        const [row] = await db.$queryRaw<
          { waiting: boolean }[]
        >`SELECT EXISTS(SELECT FROM pg_locks WHERE locktype='advisory' AND classid=1195724117 AND objid=1347764802 AND mode='ExclusiveLock' AND NOT granted) waiting`;
        expect(row.waiting).toBe(true);
      },
      { timeout: 3000, interval: 25 },
    );
    await db.accessGrant.update({
      where: { id: grant.id },
      data: { enabled: false },
    });
  } finally {
    release();
  }
  await writer;
  expect(await command).toBe("DENIED");
  expect(
    (await db.publicSettings.findUniqueOrThrow({ where: { id: 1 } }))
      .publicCollectionEnabled,
  ).toBe(false);
});
it("keeps aggregate reads in PostgreSQL and public result pages bounded on 6,012 copies", async () => {
  const a = await actor(),
    data = await seedDashboardData(db);
  const { seedDashboardScale, explain, nodes } =
    await import("../helpers/dashboard-plans");
  await seedDashboardScale(db, {
    modelId: data.model.id,
    releaseId: data.release.id,
    variantId: data.variant.id,
  });
  await db.publicSettings.update({
    where: { id: 1 },
    data: { publicCollectionEnabled: true },
  });
  await db.collectionItem.updateMany({
    data: {
      publicationStatus: "PUBLISHED",
      publishedAt: new Date(),
      publishedById: a.user.id,
    },
  });
  const result = await getPublicCollection({
    q: "Chrono",
    type: "GAME",
    limit: 8,
  });
  expect(result.counts.total).toBe(2004);
  expect(result.items).toHaveLength(8);
  expect(result.hasMore).toBe(true);
  expect(result.items.every((i) => i.type === "GAME")).toBe(true);
  const plan = await withTransaction(
    async (tx) => {
      const { configureSearch, parseSearchTerms } =
        await import("@/server/repositories/search");
      await configureSearch(tx);
      const terms = await parseSearchTerms("Chrono", tx);
      const policy = await policyRepository.readPolicy(tx);
      return explain(
        tx,
        queryRepository.collectionPageQuery(
          { q: "Chrono", type: "GAME", sort: "name-asc", offset: 0, limit: 8 },
          terms,
          policy!,
        ),
      );
    },
    { publicationPolicy: "read" },
  );
  expect(plan.Plan["Actual Rows"]).toBe(9);
  expect(
    nodes(plan.Plan).find((n) => n["Subplan Name"] === "CTE facts")?.[
      "Actual Loops"
    ],
  ).toBe(1);
});

import { mediaDelivery } from "@/server/services/public-collection/media";
import {
  reviewMediaUse,
  saveMediaUse,
  reviewComponentUse,
  saveComponentUse,
} from "@/server/services/public-collection/media-reviews";
import { getPublicPresentation } from "@/server/services/public-collection/viewer";
import { PermissionError, requirePermission } from "@/server/auth/permissions";
import { fullArtwork, boxFaces } from "@/lib/three/packaging-contracts";
async function approvedImage(
  scope: "COLLECTION" | "CATALOG" = "CATALOG",
  kind: "IMAGE" | "MODEL_3D" = "IMAGE",
) {
  const source = await db.asset.create({
    data: {
      kind,
      scope,
      state: "READY",
      deliveryClass: "ORIGINAL",
      storageNamespace: "private-source",
      objectKey: randomUUID(),
      mimeType: kind === "IMAGE" ? "image/png" : "model/gltf-binary",
      width: 80,
      height: 60,
      sizeBytes: 100,
      sha256: "a".repeat(64),
      rightsStatus: "APPROVED",
    },
  });
  const output = await db.asset.create({
    data: {
      kind,
      scope,
      deliveryClass: "DISPLAY",
      storageNamespace: "public-display",
      objectKey: randomUUID(),
      mimeType: source.mimeType,
      width: 80,
      height: 60,
      sizeBytes: 100,
      sha256: "b".repeat(64),
      rightsStatus: "APPROVED",
      publicSafe: true,
      reviewedAt: new Date(),
      inputs: { create: { sourceAssetId: source.id, purpose: "SANITIZE" } },
    },
  });
  await db.asset.update({ where: { id: output.id }, data: { state: "READY" } });
  return { source, output };
}
it("contextual delivery rechecks exact use, policy, publication, category association and recursive source rights", async () => {
  const { context, data } = await seedPublished(),
    { source, output } = await approvedImage();
  const use = await db.catalogAsset.create({
    data: {
      consoleModelId: data.model.id,
      role: "GALLERY",
      assetId: source.id,
      publicDisplayAssetId: output.id,
      publicApproved: true,
      approvedAt: new Date(),
    },
  });
  const input = {
    context: "item",
    itemId: data.items[0].id,
    kind: "catalog",
    useId: use.id,
  };
  expect((await mediaDelivery(input)).locator.objectKey).toBe(output.objectKey);
  for (const override of [
    { itemId: data.items[1].id },
    { itemId: data.items[3].id },
    { kind: "personal" },
    { useId: output.id },
  ])
    await expect(
      mediaDelivery({ ...input, ...override }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    mediaDelivery({ ...input, assetId: source.id }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await db.asset.update({
    where: { id: source.id },
    data: { rightsStatus: "RESTRICTED" },
  });
  await expect(mediaDelivery(input)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expect(
    (await getPublicConsole({ id: input.itemId })).gallery?.images,
  ).toEqual([]);
  await db.asset.update({
    where: { id: source.id },
    data: { rightsStatus: "APPROVED" },
  });
  await db.catalogAsset.update({
    where: { id: use.id },
    data: { caption: "Changed public caption" },
  });
  await expect(mediaDelivery(input)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await settings(context, { publicCollectionEnabled: false });
  await expect(mediaDelivery(input)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});
it("keeps serial uses and unapproved derivatives private and falls back to independently approved catalog photos", async () => {
  const { context, data } = await seedPublished(),
    personal = await approvedImage("COLLECTION"),
    catalog = await approvedImage();
  await settings(context, { showPersonalPhotos: true });
  await publish(context, data.items[0].id);
  const serial = await db.collectionItemMedia.create({
    data: {
      collectionItemId: data.items[0].id,
      type: "SERIAL",
      assetId: personal.source.id,
      publicDisplayAssetId: personal.output.id,
      publicApproved: true,
      approvedAt: new Date(),
      isPrimary: true,
    },
  });
  const use = await db.catalogAsset.create({
    data: {
      consoleModelId: data.model.id,
      role: "COVER",
      assetId: catalog.source.id,
      publicDisplayAssetId: catalog.output.id,
      publicApproved: true,
      approvedAt: new Date(),
    },
  });
  const result = await getPublicConsole({ id: data.items[0].id });
  expect(result.gallery?.images).toHaveLength(1);
  expect(result.photo?.url).toContain(`/catalog/${use.id}`);
  await expect(
    mediaDelivery({
      context: "item",
      itemId: result.id,
      kind: "personal",
      useId: serial.id,
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    mediaDelivery({
      context: "item",
      itemId: result.id,
      kind: "catalog",
      useId: catalog.source.id,
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  const sibling = await approvedImage();
  await expect(
    mediaDelivery({
      context: "item",
      itemId: result.id,
      kind: "catalog",
      useId: sibling.output.id,
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(JSON.stringify(result)).not.toContain(personal.source.id);
});
it("requires current ADMIN and a fresh exact media review, pins the display output and invalidates personal copies", async () => {
  const { context, data } = await seedPublished(),
    { source, output } = await approvedImage("COLLECTION");
  const use = await db.collectionItemMedia.create({
    data: {
      collectionItemId: data.items[0].id,
      assetId: source.id,
      type: "PHOTO",
      altText: "A safe console",
    },
  });
  const input = {
    kind: "personal",
    useId: use.id,
    displayAssetId: output.id,
    approved: true,
  };
  for (const role of ["EDITOR", "VIEWER"] as const)
    await expect(
      reviewMediaUse((await actor(role)).context, input),
    ).rejects.toBeInstanceOf(PermissionError);
  const preview = await reviewMediaUse(context, input);
  await db.collectionItemMedia.update({
    where: { id: use.id },
    data: { caption: "Updated caption" },
  });
  await expect(
    saveMediaUse(context, {
      ...input,
      reviewToken: preview.reviewToken,
      reviewed: true,
    }),
  ).rejects.toMatchObject({ code: "STALE" });
  const fresh = await reviewMediaUse(context, input);
  await expect(
    saveMediaUse(context, {
      ...input,
      reviewToken: fresh.reviewToken,
      reviewed: true,
      approvedById: randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await saveMediaUse(context, {
    ...input,
    reviewToken: fresh.reviewToken,
    reviewed: true,
  });
  expect(
    await db.collectionItemMedia.findUnique({ where: { id: use.id } }),
  ).toMatchObject({ publicApproved: true, publicDisplayAssetId: output.id });
  expect(
    await db.collectionItem.findUnique({ where: { id: data.items[0].id } }),
  ).toMatchObject({ publicationStatus: "PRIVATE" });
  expect(await db.asset.findUnique({ where: { id: source.id } })).toMatchObject(
    { publicSafe: false },
  );
  await publish(context, data.items[0].id);
  const unchanged = await reviewMediaUse(context, input);
  await saveMediaUse(context, {
    ...input,
    reviewToken: unchanged.reviewToken,
    reviewed: true,
  });
  expect(
    (await db.collectionItem.findUnique({ where: { id: data.items[0].id } }))
      ?.publicationStatus,
  ).toBe("PUBLISHED");
  await db.asset.update({
    where: { id: output.id },
    data: { rightsStatus: "RESTRICTED" },
  });
  const withdraw = { ...input, approved: false },
    withdrawReview = await reviewMediaUse(context, withdraw);
  await saveMediaUse(context, {
    ...withdraw,
    reviewToken: withdrawReview.reviewToken,
    reviewed: true,
  });
  expect(
    await db.collectionItemMedia.findUnique({ where: { id: use.id } }),
  ).toMatchObject({ publicApproved: false, publicDisplayAssetId: null });
});
it("delivers whole public models on demand with contextual descriptors and no private resource fallback", async () => {
  const { data } = await seedPublished(),
    { source, output } = await approvedImage("CATALOG", "MODEL_3D");
  const use = await db.catalogAsset.create({
    data: {
      consoleModelId: data.model.id,
      role: "MODEL_3D",
      assetId: source.id,
      publicDisplayAssetId: output.id,
      publicApproved: true,
      approvedAt: new Date(),
    },
  });
  expect((await getPublicConsole({ id: data.items[0].id })).model).toBe(true);
  const presentation = await getPublicPresentation({
    itemId: data.items[0].id,
  });
  expect(presentation.schemaVersion).toBe(1);
  expect(JSON.stringify(presentation)).toContain(`/catalog/${use.id}`);
  expect(JSON.stringify(presentation)).not.toContain("/api/media/private");
  await db.asset.update({
    where: { id: output.id },
    data: { publicSafe: false },
  });
  await expect(
    getPublicPresentation({ itemId: data.items[0].id }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect((await getPublicConsole({ id: data.items[0].id })).model).toBe(false);
});
it("requires reviewed component/template revision, exact slot bindings and eligible required artwork for public 3D", async () => {
  const { context, data } = await seedPublished(),
    { output } = await approvedImage();
  const t = await db.packagingTemplate.create({
    data: {
      name: "Public synthetic box",
      slug: randomUUID(),
      revisionNumber: 1,
      familyKey: "snes-cardboard",
      geometryType: "PROCEDURAL_BOX",
      dimensions: {
        schemaVersion: 1,
        widthMm: 180,
        heightMm: 125,
        depthMm: 30,
      },
      materialSettings: { schemaVersion: 1 },
      cameraSettings: { preset: "package" },
      metadata: {
        schemaVersion: 1,
        synthetic: true,
        measurementNote: "Synthetic measurements",
      },
      slots: {
        create: boxFaces.map((f) => ({
          name: f.name,
          required: f.required,
          materialName: `box:${f.name}`,
          target: { schemaVersion: 1, kind: "PROCEDURAL_FACE", face: f.face },
        })),
      },
    },
    include: { slots: true },
  });
  await db.packagingTemplate.update({
    where: { id: t.id },
    data: { status: "READY" },
  });
  const c = await db.gameReleaseIncludedItem.create({
    data: {
      gameReleaseId: data.release.id,
      name: "Expected box",
      kind: "PACKAGING",
      packagingTemplateId: t.id,
    },
  });
  for (const slot of t.slots)
    await db.packagingTextureBinding.create({
      data: {
        includedItemId: c.id,
        packagingTemplateId: t.id,
        packagingTextureSlotId: slot.id,
        assetId: output.id,
        transform: fullArtwork,
      },
    });
  const input = { componentId: c.id, approved: true };
  const review = await reviewComponentUse(context, input);
  await saveComponentUse(context, {
    ...input,
    reviewToken: review.reviewToken,
    reviewed: true,
  });
  const state = await db.gameReleaseIncludedItem.findUnique({
    where: { id: c.id },
  });
  expect(state?.presentationReviewedById).toBe(
    (await requirePermission(context, "publication.manage")).userId,
  );
  expect(state?.presentationReviewedAt).not.toBeNull();
  const itemId = data.items[1].id;
  const view = await getPublicPresentation({ itemId, componentId: c.id });
  expect(view.schemaVersion).toBe(2);
  expect(JSON.stringify(view)).not.toContain("/api/media/private");
  await expect(
    mediaDelivery({
      context: "component",
      itemId: data.items[0].id,
      componentId: c.id,
      slotKey: "FRONT",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(
    (
      await mediaDelivery({
        context: "component",
        itemId,
        componentId: c.id,
        slotKey: "FRONT",
      })
    ).sizeBytes,
  ).toBe(100);
  await db.asset.update({
    where: { id: output.id },
    data: { rightsStatus: "RESTRICTED" },
  });
  await expect(
    getPublicPresentation({ itemId, componentId: c.id }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await db.asset.update({
    where: { id: output.id },
    data: { rightsStatus: "APPROVED" },
  });
  await db.packagingTextureBinding.deleteMany({
    where: { includedItemId: c.id, packagingTextureSlotId: t.slots[0].id },
  });
  expect(
    (await db.gameReleaseIncludedItem.findUnique({ where: { id: c.id } }))
      ?.presentationApproved,
  ).toBe(false);
  await expect(
    getPublicPresentation({ itemId, componentId: c.id }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
