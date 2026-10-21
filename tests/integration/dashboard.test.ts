import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { requirePrivateAccess } from "@/server/auth/access";
import { getDatabase, disconnectDatabase } from "@/server/db/client";
import { signedSessionCookie } from "../helpers/access-session";
import {
  getDashboard,
  DashboardError,
} from "@/server/services/collection/dashboard";
import * as repository from "@/server/repositories/collection/dashboard";
import { seedDashboardData } from "../helpers/dashboard-data";
const db = getDatabase(),
  secret = "game-creation-test-secret-longer-than-thirty-two-characters";
async function actor(role: "ADMIN" | "EDITOR" | "VIEWER" = "VIEWER") {
  const email = `${randomUUID()}@example.com`;
  const user = await db.user.create({
    data: { email, name: "Dashboard fixture", emailVerified: true },
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
it("returns real zeros for an empty private collection", async () => {
  const { context } = await actor();
  expect(await getDashboard(context)).toEqual({
    role: "VIEWER",
    canManage: false,
    counts: {
      total: 0,
      consoles: 0,
      games: 0,
      accessories: 0,
      boxed: 0,
      activeDefects: 0,
    },
    recent: [],
    moreRecent: false,
  });
});
it("counts physical copies, confirmed boxes and distinct items with ACTIVE defects only", async () => {
  const { context } = await actor("EDITOR");
  await seedDashboardData(db);
  await db.accessory.create({ data: { name: "Not owned", slug: "not-owned" } });
  const d = await getDashboard(context);
  expect(d).toMatchObject({
    role: "EDITOR",
    canManage: true,
    counts: {
      total: 12,
      consoles: 4,
      games: 4,
      accessories: 4,
      boxed: 4,
      activeDefects: 2,
    },
  });
});
it("returns eight recent copy identities in deterministic order and omits private fields", async () => {
  const { context } = await actor();
  const data = await seedDashboardData(db);
  const d = await getDashboard(context);
  expect(d.recent.map((r) => r.id)).toEqual(
    data.items
      .slice(4)
      .reverse()
      .map((r) => r.id),
  );
  expect(d.moreRecent).toBe(true);
  expect(d.recent[0]).toMatchObject({
    type: "ACCESSORY",
    title: "Controller",
    context: "Black",
    href: `/app/accessories/${data.items[11].id}`,
    addedAt: "2026-10-21T00:00:00.000Z",
    addedLabel: "Oct 21, 2026",
    photo: null,
  });
  expect(d.recent[1].href).toBe(`/app/games/${data.items[10].id}`);
  expect(d.recent[2].href).toBe(`/app/consoles/${data.items[9].id}`);
  expect(JSON.stringify(d)).not.toMatch(
    /PRIVATE-|serialNumber|notes|objectKey|storageNamespace|email|grantId|sessionId|defect title/i,
  );
  const timestamp = new Date("2026-10-21T00:00:00Z");
  await db.collectionItem.updateMany({ data: { createdAt: timestamp } });
  const tied = (await getDashboard(context)).recent.map((r) => r.id);
  expect(tied).toEqual(
    data.items
      .map((r) => r.id)
      .sort()
      .reverse()
      .slice(0, 8),
  );
});
it("uses permitted private display photos and excludes serial-only images", async () => {
  const { context } = await actor();
  const d = await seedDashboardData(db);
  const image = await db.asset.create({
    data: {
      kind: "IMAGE",
      scope: "COLLECTION",
      state: "READY",
      deliveryClass: "DISPLAY",
      storageNamespace: "test",
      objectKey: randomUUID(),
      mimeType: "image/webp",
      sizeBytes: 100,
      width: 100,
      height: 80,
      sha256: "a".repeat(64),
    },
  });
  await db.collectionItemMedia.createMany({
    data: [
      {
        collectionItemId: d.items[11].id,
        type: "PHOTO",
        assetId: image.id,
        altText: "Private copy thumbnail",
      },
      {
        collectionItemId: d.items[10].id,
        type: "SERIAL",
        assetId: image.id,
        altText: "Serial only",
      },
    ],
  });
  const result = await getDashboard(context);
  expect(result.recent[0].photo).toEqual({
    url: `/api/media/private/${image.id}`,
    alt: "Private copy thumbnail",
    width: 100,
    height: 80,
  });
  expect(result.recent[1].photo).toBeNull();
});
it("retains owned archived identities and refreshes counts after copy deletion", async () => {
  const { context } = await actor();
  const d = await seedDashboardData(db);
  await db.accessory.update({
    where: { id: d.accessory.id },
    data: { archivedAt: new Date() },
  });
  expect((await getDashboard(context)).recent[0].title).toBe("Controller");
  await db.collectionItem.delete({ where: { id: d.items[11].id } });
  const result = await getDashboard(context);
  expect(result.counts).toMatchObject({ total: 11, accessories: 3 });
  expect(result.recent.some((r) => r.id === d.items[11].id)).toBe(false);
});
it("keeps counts and recent copies in one snapshot when a copy is deleted between reads", async () => {
  const { context } = await actor();
  const d = await seedDashboardData(db);
  const count = repository.counts;
  vi.spyOn(repository, "counts").mockImplementationOnce(async (tx) => {
    const result = await count(tx);
    // A separate connection commits while the dashboard transaction is open.
    await db.collectionItem.delete({ where: { id: d.items[11].id } });
    return result;
  });
  const snapshot = await getDashboard(context);
  expect(snapshot.counts.total).toBe(12);
  expect(snapshot.recent[0].id).toBe(d.items[11].id);
  const refreshed = await getDashboard(context);
  expect(refreshed.counts.total).toBe(11);
  expect(refreshed.recent.some((r) => r.id === d.items[11].id)).toBe(false);
});
it("rechecks current roles, enabled grants and sessions before summary queries", async () => {
  const a = await actor("ADMIN");
  await seedDashboardData(db);
  await db.accessGrant.update({
    where: { id: a.grant.id },
    data: { role: "VIEWER" },
  });
  expect(await getDashboard(a.context)).toMatchObject({
    role: "VIEWER",
    canManage: false,
  });
  const spy = vi.spyOn(repository, "counts");
  await db.accessGrant.update({
    where: { id: a.grant.id },
    data: { enabled: false },
  });
  await expect(getDashboard(a.context)).rejects.toMatchObject({
    code: "DENIED",
  });
  expect(spy).not.toHaveBeenCalled();
  await db.accessGrant.update({
    where: { id: a.grant.id },
    data: { enabled: true },
  });
  await db.session.delete({ where: { id: a.session.id } });
  await expect(getDashboard(a.context)).rejects.toMatchObject({
    code: "UNAUTHENTICATED",
  });
});
it("reports failed reads without manufacturing an empty dashboard", async () => {
  const { context } = await actor();
  await seedDashboardData(db);
  vi.spyOn(repository, "counts").mockRejectedValueOnce(
    new Error("Private database diagnostic"),
  );
  await expect(getDashboard(context)).rejects.toBeInstanceOf(DashboardError);
  await expect(getDashboard(context)).resolves.toMatchObject({
    counts: { total: 12 },
  });
});
it("keeps aggregate and recent/photo reads bounded on a 6,012-copy corpus and records real plans", async () => {
  const { context } = await actor();
  const d = await seedDashboardData(db);
  const { seedDashboardScale, baselineCountsQueries, explain, nodes, metrics } =
    await import("../helpers/dashboard-plans");
  const { cardPhotosQuery } =
    await import("@/server/repositories/collection/cards");
  await seedDashboardScale(db, {
    modelId: d.model.id,
    releaseId: d.release.id,
    variantId: d.variant.id,
  });
  const dashboard = await getDashboard(context);
  expect(dashboard.counts).toEqual({
    total: 6012,
    consoles: 2004,
    games: 2004,
    accessories: 2004,
    boxed: 1504,
    activeDefects: 602,
  });
  expect(dashboard.recent).toHaveLength(8);
  expect(
    dashboard.recent.every(
      (item) => item.photo?.width === 80 && item.photo.height === 60,
    ),
  ).toBe(true);
  expect(dashboard.moreRecent).toBe(true);
  const report = await db.$transaction(async (tx) => {
    const baseline = [];
    for (const query of baselineCountsQueries)
      baseline.push(metrics(await explain(tx, query)));
    const aggregate = await explain(tx, repository.countsQuery());
    const recent = await explain(tx, repository.recentQuery());
    const photos = await explain(
      tx,
      cardPhotosQuery(dashboard.recent.map((r) => r.id)),
    );
    expect(aggregate.Plan["Actual Rows"]).toBe(1);
    const collection = nodes(aggregate.Plan).filter(
      (n) => n["Relation Name"] === "collection_item",
    );
    expect(collection).toHaveLength(1);
    expect(collection[0]["Actual Loops"]).toBe(1);
    expect(
      nodes(aggregate.Plan)
        .filter((n) => n["Relation Name"] === "defect")
        .every((n) => n["Actual Loops"] === 1),
    ).toBe(true);
    expect(recent.Plan["Actual Rows"]).toBe(9);
    const owned = nodes(recent.Plan).filter((n) =>
      ["owned_console", "owned_game", "owned_accessory"].includes(
        n["Relation Name"] ?? "",
      ),
    );
    expect(owned).toHaveLength(3);
    expect(
      owned.every(
        (n) =>
          n["Actual Rows"] <= 1 &&
          n["Actual Loops"] <= 9 &&
          Boolean(n["Index Name"]),
      ),
    ).toBe(true);
    expect(
      nodes(recent.Plan).some(
        (n) =>
          n["Index Name"] === "collection_item_createdAt_id_idx" &&
          n["Scan Direction"] === "Backward" &&
          n["Actual Rows"] === 9,
      ),
    ).toBe(true);
    expect(photos.Plan["Actual Rows"]).toBe(8);
    expect(
      nodes(photos.Plan).some((n) =>
        ["defect", "company", "accessory", "accessory_variant"].includes(
          n["Relation Name"] ?? "",
        ),
      ),
    ).toBe(false);
    return {
      corpus: {
        copies: 6012,
        defects: 2405,
        photoUses: await tx.collectionItemMedia.count(),
        assets: await tx.asset.count(),
      },
      aggregate: metrics(aggregate),
      recent: metrics(recent),
      photos: metrics(photos),
      baseline: {
        queryCount: baseline.length,
        executionMs: baseline.reduce((n, p) => n + p.executionMs, 0),
        sharedBlocks: baseline.reduce((n, p) => n + p.sharedBlocks, 0),
      },
      collectionScanLoops: collection[0]["Actual Loops"],
      recentOwnedLookups: owned.map((n) => ({
        relation: n["Relation Name"],
        rowsPerLookup: n["Actual Rows"],
        loops: n["Actual Loops"],
        index: n["Index Name"],
      })),
    };
  });
  console.info("Dashboard query evidence", JSON.stringify(report));
  if (process.env.DASHBOARD_QUERY_REPORT === "1") {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      "docs/performance/DASHBOARD_QUERY_EVIDENCE.json",
      JSON.stringify(
        {
          task: "17.2",
          recordedDate: "2026-10-21",
          environment:
            "Disposable PostgreSQL 16; one synthetic warm-cache sample, no forced planner settings. Baseline uses SQL equivalents of the six prior count calls. Timings exclude network and application overhead and are not a production latency guarantee.",
          ...report,
        },
        null,
        2,
      ) + "\n",
    );
  }
});
