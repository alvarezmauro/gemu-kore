import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { requirePrivateAccess } from "@/server/auth/access";
import { getDatabase, disconnectDatabase } from "@/server/db/client";
import type { AccessRole } from "@/features/auth/contracts";
import { signedSessionCookie } from "../helpers/access-session";
import { emptyCopyPhysical } from "@/features/collection/copy-validation";
import {
  refreshGameSelection,
  createGameCopy,
  findGames,
  findGameReleases,
  selectGameRelease,
  getGameCreation,
} from "@/server/services/collection/games";
import * as catalog from "@/server/repositories/catalog/management";
import * as repository from "@/server/repositories/collection/games";
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
it("loads an empty manual creation form with no provider or catalog writes", async () => {
  const { context } = await actor();
  expect(await getGameCreation(context)).toEqual({
    platforms: { items: [], hasMore: false, page: 0 },
    games: { items: [], hasMore: false, page: 0 },
    locations: [],
    canManageCatalog: false,
  });
  expect(await db.game.count()).toBe(0);
});
it("searches aliases and same-title slugs literally with stable bounded pages", async () => {
  const { context } = await actor();
  const { game } = await identity();
  expect((await findGames(context, { query: "クロノ" })).items[0].id).toBe(
    game.id,
  );
  expect((await findGames(context, { query: game.slug })).items[0].id).toBe(
    game.id,
  );
  expect((await findGames(context, { query: "%" })).items).toEqual([]);
  await db.game.createMany({
    data: Array.from({ length: 29 }, (_, i) => ({
      name: `Same title ${String(i).padStart(2, "0")}`,
      slug: randomUUID(),
    })),
  });
  const first = await findGames(context, { query: "Same title" });
  const second = await findGames(context, { query: "Same title", page: 1 });
  expect(first.items).toHaveLength(25);
  expect(first.hasMore).toBe(true);
  expect(second.items).toHaveLength(4);
  expect(second.hasMore).toBe(false);
  expect(new Set([...first.items, ...second.items].map((x) => x.id)).size).toBe(
    29,
  );
  expect(Object.keys(first.items[0]).sort()).toEqual([
    "description",
    "id",
    "name",
    "revision",
    "slug",
  ]);
});
it("filters releases by platform, title, optional market and edition without excluding unknown markets", async () => {
  const { context } = await actor();
  const { game, platform, release, region } = await identity();
  const unknown = await db.gameRelease.create({
    data: {
      gameId: game.id,
      platformId: platform.id,
      slug: "unknown-release",
      editionType: "DELUXE",
    },
  });
  const input = { gameId: game.id, platformId: platform.id };
  expect((await findGameReleases(context, input)).items).toHaveLength(2);
  const filtered = await findGameReleases(context, {
    ...input,
    marketId: region.id,
    editionType: "STANDARD",
  });
  expect(filtered.items).toMatchObject([
    {
      id: release.id,
      markets: [{ name: "North America", year: 1995, month: 8, day: null }],
      components: [{ name: "Manual", quantity: 1 }],
    },
  ]);
  expect(filtered.markets).toEqual([{ id: region.id, name: "North America" }]);
  expect(
    (await findGameReleases(context, { ...input, editionType: "DELUXE" }))
      .items,
  ).toMatchObject([{ id: unknown.id, markets: [] }]);
  expect(
    (await findGameReleases(context, { ...input, query: "%" })).items,
  ).toEqual([]);
  expect(
    (await findGameReleases(context, { ...input, platformId: randomUUID() }))
      .items,
  ).toEqual([]);
  await db.gameRelease.createMany({
    data: Array.from({ length: 26 }, (_, i) => ({
      gameId: game.id,
      platformId: platform.id,
      slug: `batch-${String(i).padStart(2, "0")}`,
    })),
  });
  const a = await findGameReleases(context, { ...input, query: "batch" });
  const b = await findGameReleases(context, {
    ...input,
    query: "batch",
    page: 1,
  });
  expect(a.hasMore).toBe(true);
  expect(b.items).toHaveLength(1);
  expect(new Set([...a.items, ...b.items].map((r) => r.id)).size).toBe(26);
  await db.game.update({
    where: { id: game.id },
    data: { archivedAt: new Date() },
  });
  expect((await findGameReleases(context, input)).items).toEqual([]);
});
it("creates a private copy with structured defects and location, without changing canonical data", async () => {
  const { context, user } = await actor();
  const { input, release } = await identity();
  const location = await db.location.create({
    data: { name: "Shelf", normalizedName: "shelf" },
  });
  const id = await createGameCopy(context, {
    ...input,
    serialNumber: " CTR-01 ",
    observedMarkings: "Label faded",
    locationId: location.id,
    hasBox: "yes",
    notes: "My copy",
    defects: [
      { title: "Torn manual", description: "Corner", severity: "MINOR" },
    ],
  });
  const row = await db.collectionItem.findUniqueOrThrow({
    where: { id },
    include: { ownedGame: true, defects: true },
  });
  expect(row).toMatchObject({
    type: "GAME",
    publicationStatus: "PRIVATE",
    createdById: user.id,
    updatedById: user.id,
    serialNumber: "CTR-01",
    locationId: location.id,
    hasBox: true,
    ownedGame: { gameReleaseId: release.id },
    defects: [{ title: "Torn manual", status: "ACTIVE" }],
  });
  expect(
    await db.gameRelease.findUnique({ where: { id: release.id } }),
  ).toEqual(release);
  expect(await db.gameReleaseIncludedItem.count()).toBe(1);
});
it("deduplicates concurrent and repeated saves while allowing distinct physical copies", async () => {
  const { context } = await actor();
  const { input } = await identity();
  expect(
    await Promise.all([
      createGameCopy(context, input),
      createGameCopy(context, input),
    ]),
  ).toEqual([input.id, input.id]);
  await expect(
    createGameCopy(context, { ...input, notes: "different" }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  const other = await actor();
  await expect(createGameCopy(other.context, input)).rejects.toMatchObject({
    code: "CONFLICT",
  });
  await db.gameRelease.update({
    where: { id: input.releaseId },
    data: { revision: { increment: 1 }, archivedAt: new Date() },
  });
  expect(await createGameCopy(context, input)).toBe(input.id);
  await db.gameRelease.update({
    where: { id: input.releaseId },
    data: { archivedAt: null },
  });
  expect(
    await createGameCopy(context, {
      ...input,
      id: randomUUID(),
      releaseRevision: 2,
    }),
  ).not.toBe(input.id);
  expect(await db.collectionItem.count()).toBe(2);
});
it.each(["platform", "game", "release"] as const)(
  "rejects archived or revised %s before creating a copy",
  async (kind) => {
    const { context } = await actor();
    const { input } = await identity();
    const id =
      kind === "platform"
        ? input.platformId
        : kind === "game"
          ? input.gameId
          : input.releaseId;
    if (kind === "platform")
      await db.consolePlatform.update({ where: { id }, data: { revision: 2 } });
    else if (kind === "game")
      await db.game.update({ where: { id }, data: { revision: 2 } });
    else await db.gameRelease.update({ where: { id }, data: { revision: 2 } });
    await expect(createGameCopy(context, input)).rejects.toMatchObject({
      code: "STALE",
    });
    const current = { ...input, [`${kind}Revision`]: 2 };
    if (kind === "platform")
      await db.consolePlatform.update({
        where: { id },
        data: { archivedAt: new Date() },
      });
    else if (kind === "game")
      await db.game.update({ where: { id }, data: { archivedAt: new Date() } });
    else
      await db.gameRelease.update({
        where: { id },
        data: { archivedAt: new Date() },
      });
    await expect(createGameCopy(context, current)).rejects.toMatchObject({
      code: "STALE",
    });
    expect(await db.collectionItem.count()).toBe(0);
  },
);
it("rejects foreign release identities, invalid locations, and injected canonical/public values", async () => {
  const { context } = await actor();
  const { input } = await identity();
  const other = await identity();
  for (const patch of [
    { gameId: other.game.id },
    { platformId: other.platform.id },
  ]) {
    await expect(
      createGameCopy(context, { ...input, ...patch }),
    ).rejects.toMatchObject({ code: "STALE" });
    await expect(
      selectGameRelease(context, {
        id: input.releaseId,
        platformId: input.platformId,
        gameId: input.gameId,
        ...patch,
      }),
    ).rejects.toMatchObject({ code: "STALE" });
  }
  await expect(
    createGameCopy(context, { ...input, locationId: randomUUID() }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  for (const patch of [
    { publicationStatus: "PUBLISHED" },
    { editionType: "DELUXE" },
    { marketId: randomUUID() },
  ])
    await expect(
      createGameCopy(context, { ...input, ...patch }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(await db.collectionItem.count()).toBe(0);
});
it("denies viewers and revoked sessions, rechecking roles after waiting on the catalog lock", async () => {
  const viewer = await actor("VIEWER");
  const { input } = await identity();
  for (const action of [
    () => getGameCreation(viewer.context),
    () => findGames(viewer.context, {}),
    () =>
      findGameReleases(viewer.context, {
        platformId: input.platformId,
        gameId: input.gameId,
      }),
    () => createGameCopy(viewer.context, input),
  ])
    await expect(action()).rejects.toMatchObject({ code: "FORBIDDEN" });
  const admin = await actor("ADMIN");
  expect((await getGameCreation(admin.context)).canManageCatalog).toBe(true);
  const { context, grant, session } = await actor();
  await db.session.delete({ where: { id: session.id } });
  await expect(createGameCopy(context, input)).rejects.toMatchObject({
    code: "UNAUTHENTICATED",
  });
  const fresh = await actor();
  const lock = catalog.lockCatalogWrites;
  vi.spyOn(catalog, "lockCatalogWrites").mockImplementation(async (tx) => {
    await lock(tx);
    await db.accessGrant.update({
      where: { id: fresh.grant.id },
      data: { role: "VIEWER" },
    });
  });
  await expect(createGameCopy(fresh.context, input)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  expect(await db.collectionItem.count()).toBe(0);
  void grant;
});
it("rolls back the copy and defects when persistence fails", async () => {
  const { context } = await actor();
  const { input } = await identity();
  const insert = repository.insertGame;
  vi.spyOn(repository, "insertGame").mockImplementation(async (data, tx) => {
    await insert(data, tx);
    throw new Error("simulated persistence error");
  });
  await expect(
    createGameCopy(context, {
      ...input,
      defects: [{ title: "Scratch", description: "", severity: "MINOR" }],
    }),
  ).rejects.toMatchObject({ code: "UNAVAILABLE" });
  expect(await db.collectionItem.count()).toBe(0);
  expect(await db.defect.count()).toBe(0);
});

it("refreshes the same canonical choices without writing a copy or accepting a changed identity", async () => {
  const user = await actor();
  const records = await identity();
  await db.game.update({
    where: { id: records.game.id },
    data: {
      description: "Reviewed provider description",
      revision: { increment: 1 },
    },
  });
  const input = {
    id: records.release.id,
    gameId: records.game.id,
    platformId: records.platform.id,
  };
  const refreshed = await refreshGameSelection(user.context, input);
  expect(refreshed.game).toMatchObject({
    id: records.game.id,
    revision: 2,
    description: "Reviewed provider description",
  });
  expect(refreshed.platform.id).toBe(records.platform.id);
  expect(refreshed.release.id).toBe(records.release.id);
  expect(await db.collectionItem.count()).toBe(0);
  const other = await db.game.create({
    data: { name: "Other", slug: randomUUID() },
  });
  await expect(
    refreshGameSelection(user.context, { ...input, gameId: other.id }),
  ).rejects.toMatchObject({ code: "STALE" });
  const viewer = await actor("VIEWER");
  await expect(refreshGameSelection(viewer.context, input)).rejects.toThrow();
});
