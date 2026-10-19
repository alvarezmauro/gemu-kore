import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { requirePrivateAccess } from "@/server/auth/access";
import { getDatabase, disconnectDatabase } from "@/server/db/client";
import type { AccessRole } from "@/features/auth/contracts";
import { signedSessionCookie } from "../helpers/access-session";
import { emptyCopyPhysical } from "@/features/collection/copy-validation";
import { createGameCopy } from "@/server/services/collection/games";
import { getOwnedGame } from "@/server/services/collection/game-management";
import * as catalogWrites from "@/server/repositories/catalog/management";
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

import {
  changeCatalogTrailer,
  getTrailerEditor,
} from "@/server/services/catalog/trailers";
const youtube = { provider: "YOUTUBE" as const, id: "AbCdEf123_-" };
const direct = {
  provider: "DIRECT_URL" as const,
  url: "https://example.com/trailer.webm",
};
it("uses the game default, a whole release override, then restores fallback without editing owned copies", async () => {
  const f = await copy();
  const admin = await actor("ADMIN");
  const mutate = (
    kind: "game" | "release",
    revision: number,
    trailer: unknown,
  ) =>
    changeCatalogTrailer(admin.context, {
      kind,
      id: kind === "game" ? f.game.id : f.release.id,
      expectedRevision: revision,
      trailer,
    });
  await mutate("game", 1, youtube);
  expect((await getOwnedGame(f.context, { id: f.id })).trailer).toEqual({
    reference: youtube,
    scope: "game",
  });
  await mutate("release", 1, direct);
  expect((await getOwnedGame(f.context, { id: f.id })).trailer).toEqual({
    reference: direct,
    scope: "release",
  });
  await mutate("release", 2, null);
  expect((await getOwnedGame(f.context, { id: f.id })).trailer).toEqual({
    reference: youtube,
    scope: "game",
  });
  const item = await db.collectionItem.findUniqueOrThrow({
    where: { id: f.id },
  });
  expect(item).toMatchObject({
    revision: 1,
    notes: "Private notes",
    serialNumber: "00001",
  });
  expect(
    await getTrailerEditor(admin.context, { kind: "game", id: f.game.id }),
  ).toMatchObject({ trailer: youtube, revision: 2 });
  expect(
    await db.metadataChange.count({
      where: { fieldPath: "trailer", origin: "MANUAL", actorId: admin.user.id },
    }),
  ).toBe(3);
});
it("resets public approval only on replacement/removal and records the whole prior group", async () => {
  const f = await identity();
  const admin = await actor("ADMIN");
  await db.game.update({
    where: { id: f.game.id },
    data: {
      trailerProvider: "YOUTUBE",
      trailerId: youtube.id,
      trailerPublicApproved: true,
    },
  });
  const base = { kind: "game", id: f.game.id, expectedRevision: 1 };
  await changeCatalogTrailer(admin.context, { ...base, trailer: youtube });
  expect(
    await db.game.findUniqueOrThrow({ where: { id: f.game.id } }),
  ).toMatchObject({ revision: 1, trailerPublicApproved: true });
  await changeCatalogTrailer(admin.context, { ...base, trailer: direct });
  expect(
    await db.game.findUniqueOrThrow({ where: { id: f.game.id } }),
  ).toMatchObject({
    revision: 2,
    trailerPublicApproved: false,
    trailerId: null,
    trailerUrl: direct.url,
  });
  expect(
    await db.metadataChange.findFirstOrThrow({
      where: { gameId: f.game.id, fieldPath: "trailer" },
    }),
  ).toMatchObject({
    before: { ...youtube, publicApproved: true },
    after: { ...direct, publicApproved: false },
    rootRevision: 2,
  });
  await db.game.update({
    where: { id: f.game.id },
    data: { trailerPublicApproved: true },
  });
  await changeCatalogTrailer(admin.context, {
    ...base,
    expectedRevision: 2,
    trailer: null,
  });
  expect(
    await db.game.findUniqueOrThrow({ where: { id: f.game.id } }),
  ).toMatchObject({
    revision: 3,
    trailerPublicApproved: false,
    trailerProvider: null,
    trailerUrl: null,
  });
});
it.each(["EDITOR", "VIEWER"] as const)(
  "denies %s reads of the editor and direct catalog mutations",
  async (role) => {
    const f = await identity();
    const user = await actor(role);
    await expect(
      getTrailerEditor(user.context, { kind: "game", id: f.game.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      changeCatalogTrailer(user.context, {
        kind: "release",
        id: f.release.id,
        expectedRevision: 1,
        trailer: youtube,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await db.metadataChange.count()).toBe(0);
  },
);
it("rejects invalid payloads, missing or wrong-kind IDs, stale revisions, archives and revoked grants", async () => {
  const f = await identity();
  const admin = await actor("ADMIN");
  const base = {
    kind: "release",
    id: f.release.id,
    expectedRevision: 1,
    trailer: youtube,
  };
  for (const trailer of [
    { provider: "YOUTUBE", id: '<iframe src="x">' },
    { provider: "DIRECT_URL", url: "javascript:alert(1)" },
    { provider: "DIRECT_URL", url: "http://example.com/video.mp4" },
    { ...youtube, publicApproved: true },
  ]) {
    await expect(
      changeCatalogTrailer(admin.context, { ...base, trailer }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  }
  await expect(
    changeCatalogTrailer(admin.context, { ...base, id: f.game.id }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    changeCatalogTrailer(admin.context, { ...base, expectedRevision: 2 }),
  ).rejects.toMatchObject({ code: "STALE" });
  await db.gameRelease.update({
    where: { id: f.release.id },
    data: { archivedAt: new Date() },
  });
  await expect(changeCatalogTrailer(admin.context, base)).rejects.toMatchObject(
    { code: "ARCHIVED" },
  );
  await db.accessGrant.update({
    where: { id: admin.grant.id },
    data: { enabled: false },
  });
  await expect(changeCatalogTrailer(admin.context, base)).rejects.toMatchObject(
    { code: "DENIED" },
  );
  expect(await db.metadataChange.count()).toBe(0);
});
it("serializes competing edits and retains only one winner and one audit", async () => {
  const f = await identity();
  const admin = await actor("ADMIN");
  const results = await Promise.allSettled(
    [youtube, direct].map((trailer) =>
      changeCatalogTrailer(admin.context, {
        kind: "release",
        id: f.release.id,
        expectedRevision: 1,
        trailer,
      }),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { code: "STALE" },
  });
  expect(await db.metadataChange.count()).toBe(1);
});
it("rechecks current authority after locking and rolls back a failed audit", async () => {
  const f = await identity();
  const admin = await actor("ADMIN");
  const input = {
    kind: "game",
    id: f.game.id,
    expectedRevision: 1,
    trailer: youtube,
  };
  const lock = catalogWrites.lockCatalogWrites;
  vi.spyOn(catalogWrites, "lockCatalogWrites").mockImplementationOnce(
    async (tx) => {
      await lock(tx);
      await db.accessGrant.update({
        where: { id: admin.grant.id },
        data: { role: "VIEWER" },
      });
    },
  );
  await expect(
    changeCatalogTrailer(admin.context, input),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await db.accessGrant.update({
    where: { id: admin.grant.id },
    data: { role: "ADMIN" },
  });
  vi.spyOn(catalogWrites, "appendCatalogHistory").mockRejectedValueOnce(
    new Error("fixture history failure"),
  );
  await expect(
    changeCatalogTrailer(admin.context, input),
  ).rejects.toMatchObject({ code: "UNAVAILABLE" });
  expect(
    await db.game.findUniqueOrThrow({ where: { id: f.game.id } }),
  ).toMatchObject({ revision: 1, trailerProvider: null });
  expect(await db.metadataChange.count()).toBe(0);
});
it("database constraints reject incomplete, mixed and arbitrary provider groups on both roots", async () => {
  const f = await identity();
  for (const table of ["game", "game_release"]) {
    const id = table === "game" ? f.game.id : f.release.id;
    for (const set of [
      "\"trailerId\" = 'AbCdEf123_-'",
      "\"trailerProvider\" = 'YOUTUBE'",
      "\"trailerProvider\" = 'YOUTUBE', \"trailerId\" = '<iframe>'",
      "\"trailerProvider\" = 'YOUTUBE', \"trailerId\" = 'AbCdEf123_-', \"trailerUrl\" = 'https://example.com/video.mp4'",
      "\"trailerProvider\" = 'DIRECT_URL', \"trailerUrl\" = 'javascript:alert(1)'",
      '\"trailerPublicApproved\" = true',
    ]) {
      // Fixed test-only SQL fragments; production uses parameterized Prisma writes.
      await expect(
        db.$executeRawUnsafe(
          `UPDATE "${table}" SET ${set} WHERE id = $1::uuid`,
          id,
        ),
      ).rejects.toThrow();
    }
  }
});
