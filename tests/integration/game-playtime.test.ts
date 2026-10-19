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
  changeCatalogPlaytime,
  getPlaytimeEditor,
} from "@/server/services/catalog/playtime";
const manual = {
  mainMinutes: 1800,
  mainExtrasMinutes: 2400,
  completionistMinutes: null,
  sourceType: "MANUAL" as const,
  sourceName: "My estimate",
  sourceUrl: null,
  observedAt: "2024-02-29T16:20:30.000Z",
};
const sourced = {
  mainMinutes: 0,
  mainExtrasMinutes: null,
  completionistMinutes: 3000,
  sourceType: "PROVIDER" as const,
  sourceName: "Archive",
  sourceUrl: "https://example.com/estimates",
  observedAt: "2025-01-01T00:00:00.000Z",
};
it("uses whole-set release overrides, preserves unknown and zero, then restores the game default", async () => {
  const f = await copy();
  const admin = await actor("ADMIN");
  const mutate = (
    kind: "game" | "release",
    expectedRevision: number,
    estimates: unknown,
  ) =>
    changeCatalogPlaytime(admin.context, {
      kind,
      id: kind === "game" ? f.game.id : f.release.id,
      expectedRevision,
      estimates,
      reviewed: true,
    });
  await mutate("game", 1, manual);
  expect((await getOwnedGame(f.context, { id: f.id })).playtime).toMatchObject({
    scope: "game",
    estimates: manual,
    canManage: false,
  });
  await mutate("release", 1, sourced);
  expect((await getOwnedGame(f.context, { id: f.id })).playtime).toMatchObject({
    scope: "release",
    estimates: sourced,
  });
  const unknown = { ...sourced, mainMinutes: null, completionistMinutes: null };
  await mutate("release", 2, unknown);
  expect((await getOwnedGame(f.context, { id: f.id })).playtime).toMatchObject({
    scope: "release",
    estimates: unknown,
  });
  await mutate("release", 3, null);
  expect((await getOwnedGame(f.context, { id: f.id })).playtime).toMatchObject({
    scope: "game",
    estimates: manual,
  });
  expect(
    await db.collectionItem.findUniqueOrThrow({ where: { id: f.id } }),
  ).toMatchObject({
    revision: 1,
    notes: "Private notes",
    serialNumber: "00001",
    publicationStatus: "PRIVATE",
  });
  expect(await db.gamePlaytime.count()).toBe(1);
  expect(
    await db.metadataChange.count({
      where: {
        fieldPath: "playtime",
        origin: "MANUAL",
        actorId: admin.user.id,
      },
    }),
  ).toBe(4);
});
it("keeps one set and source, retains no-op timestamps and audits explicit replacement/removal", async () => {
  const f = await identity();
  const admin = await actor("ADMIN");
  const input = {
    kind: "game",
    id: f.game.id,
    expectedRevision: 1,
    reviewed: true,
    estimates: manual,
  };
  await changeCatalogPlaytime(admin.context, input);
  const first = await db.gamePlaytime.findUniqueOrThrow({
    where: { gameId: f.game.id },
  });
  await changeCatalogPlaytime(admin.context, { ...input, expectedRevision: 2 });
  expect(
    await db.gamePlaytime.findUniqueOrThrow({ where: { gameId: f.game.id } }),
  ).toEqual(first);
  expect(
    await getPlaytimeEditor(admin.context, { kind: "game", id: f.game.id }),
  ).toMatchObject({
    revision: 2,
    estimates: { ...manual, updatedAt: first.updatedAt.toISOString() },
  });
  await expect(
    changeCatalogPlaytime(admin.context, {
      ...input,
      expectedRevision: 2,
      estimates: sourced,
      reviewed: false,
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await changeCatalogPlaytime(admin.context, {
    ...input,
    expectedRevision: 2,
    estimates: sourced,
  });
  expect(await db.gamePlaytime.count({ where: { gameId: f.game.id } })).toBe(1);
  expect(
    await db.gamePlaytime.findUniqueOrThrow({ where: { gameId: f.game.id } }),
  ).toMatchObject({
    id: first.id,
    mainMinutes: 0,
    mainExtrasMinutes: null,
    sourceType: "PROVIDER",
    sourceName: "Archive",
  });
  expect(
    await db.metadataChange.findFirstOrThrow({
      where: { gameId: f.game.id, rootRevision: 3 },
    }),
  ).toMatchObject({
    fieldPath: "playtime",
    before: { ...manual, updatedAt: first.updatedAt.toISOString() },
    after: sourced,
  });
  await changeCatalogPlaytime(admin.context, {
    ...input,
    expectedRevision: 3,
    estimates: null,
  });
  expect(await db.gamePlaytime.count()).toBe(0);
  await changeCatalogPlaytime(admin.context, {
    ...input,
    expectedRevision: 4,
    estimates: null,
  });
  expect(await db.metadataChange.count()).toBe(3);
});
it("does not inherit estimates from another release", async () => {
  const f = await copy();
  const admin = await actor("ADMIN");
  const other = await db.gameRelease.create({
    data: { slug: randomUUID(), gameId: f.game.id, platformId: f.platform.id },
  });
  await changeCatalogPlaytime(admin.context, {
    kind: "release",
    id: other.id,
    expectedRevision: 1,
    estimates: sourced,
    reviewed: true,
  });
  expect(
    (await getOwnedGame(f.context, { id: f.id })).playtime.estimates,
  ).toBeNull();
});
it.each(["EDITOR", "VIEWER"] as const)(
  "denies %s direct catalog edits and editor reads",
  async (role) => {
    const f = await identity();
    const user = await actor(role);
    await expect(
      getPlaytimeEditor(user.context, { kind: "game", id: f.game.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      changeCatalogPlaytime(user.context, {
        kind: "release",
        id: f.release.id,
        expectedRevision: 1,
        estimates: manual,
        reviewed: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await db.gamePlaytime.count()).toBe(0);
  },
);
it("rejects unreviewed/unsafe payloads, missing targets, stale revisions, archives and revoked grants", async () => {
  const f = await identity();
  const admin = await actor("ADMIN");
  const input = {
    kind: "release",
    id: f.release.id,
    expectedRevision: 1,
    estimates: sourced,
    reviewed: true,
  };
  for (const estimates of [
    { ...sourced, mainMinutes: -1 },
    { ...sourced, sourceUrl: "javascript:alert(1)" },
    { ...sourced, sourceName: "" },
    { ...sourced, observedAt: "2023-02-29" },
    { ...sourced, extra: true },
  ])
    await expect(
      changeCatalogPlaytime(admin.context, { ...input, estimates }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    changeCatalogPlaytime(admin.context, { ...input, reviewed: false }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    changeCatalogPlaytime(admin.context, { ...input, id: f.game.id }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    changeCatalogPlaytime(admin.context, { ...input, expectedRevision: 2 }),
  ).rejects.toMatchObject({ code: "STALE" });
  await db.gameRelease.update({
    where: { id: f.release.id },
    data: { archivedAt: new Date() },
  });
  await expect(
    changeCatalogPlaytime(admin.context, input),
  ).rejects.toMatchObject({ code: "ARCHIVED" });
  await db.accessGrant.update({
    where: { id: admin.grant.id },
    data: { enabled: false },
  });
  await expect(
    changeCatalogPlaytime(admin.context, input),
  ).rejects.toMatchObject({ code: "DENIED" });
  expect(await db.gamePlaytime.count()).toBe(0);
});
it("rechecks authority after the catalog lock and rolls back when audit recording fails", async () => {
  const f = await identity();
  const admin = await actor("ADMIN");
  const input = {
    kind: "game",
    id: f.game.id,
    expectedRevision: 1,
    estimates: manual,
    reviewed: true,
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
    changeCatalogPlaytime(admin.context, input),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await db.accessGrant.update({
    where: { id: admin.grant.id },
    data: { role: "ADMIN" },
  });
  vi.spyOn(catalogWrites, "appendCatalogHistory").mockRejectedValueOnce(
    new Error("fixture audit failure"),
  );
  await expect(
    changeCatalogPlaytime(admin.context, input),
  ).rejects.toMatchObject({ code: "UNAVAILABLE" });
  expect(await db.gamePlaytime.count()).toBe(0);
  expect(
    await db.game.findUniqueOrThrow({ where: { id: f.game.id } }),
  ).toMatchObject({ revision: 1 });
  expect(await db.metadataChange.count()).toBe(0);
});
it("serializes concurrent replacements so one stale request cannot overwrite the winner", async () => {
  const f = await identity();
  const admin = await actor("ADMIN");
  const results = await Promise.allSettled(
    [manual, sourced].map((estimates) =>
      changeCatalogPlaytime(admin.context, {
        kind: "game",
        id: f.game.id,
        expectedRevision: 1,
        estimates,
        reviewed: true,
      }),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { code: "STALE" },
  });
  expect(await db.gamePlaytime.count()).toBe(1);
  expect(await db.metadataChange.count()).toBe(1);
});
it("enforces exactly one target, unique sets, nonnegative durations and genuine foreign keys", async () => {
  const f = await identity();
  const data = { ...manual, observedAt: new Date(manual.observedAt) };
  await expect(db.gamePlaytime.create({ data })).rejects.toThrow();
  await expect(
    db.gamePlaytime.create({
      data: { ...data, gameId: f.game.id, gameReleaseId: f.release.id },
    }),
  ).rejects.toThrow();
  await expect(
    db.gamePlaytime.create({ data: { ...data, gameId: randomUUID() } }),
  ).rejects.toThrow();
  for (const mainMinutes of [-1, 2147483648])
    await expect(
      db.gamePlaytime.create({
        data: { ...data, gameId: f.game.id, mainMinutes },
      }),
    ).rejects.toThrow();
  await db.gamePlaytime.create({ data: { ...data, gameId: f.game.id } });
  await expect(
    db.gamePlaytime.create({ data: { ...data, gameId: f.game.id } }),
  ).rejects.toThrow();
  await db.gamePlaytime.create({
    data: { ...data, gameReleaseId: f.release.id },
  });
  await expect(
    db.gamePlaytime.create({ data: { ...data, gameReleaseId: f.release.id } }),
  ).rejects.toThrow();
  // Existing catalog deletion rules retain releases while expected contents exist.
  await db.gameReleaseIncludedItem.deleteMany({
    where: { gameReleaseId: f.release.id },
  });
  await db.gameRelease.delete({ where: { id: f.release.id } });
  expect(await db.gamePlaytime.count()).toBe(1);
  await db.game.delete({ where: { id: f.game.id } });
  expect(await db.gamePlaytime.count()).toBe(0);
});
