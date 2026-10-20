import { randomUUID } from "node:crypto";
import { beforeEach, afterAll, expect, it, vi } from "vitest";
import { requirePrivateAccess } from "@/server/auth/access";
import { getDatabase, disconnectDatabase } from "@/server/db/client";
import { signedSessionCookie } from "../helpers/access-session";
import { gameInput } from "../helpers/game-catalog-input";
import { emptyCopyPhysical } from "@/features/collection/copy-validation";
import { createGameCopy } from "@/server/services/collection/games";
import { getOwnedGame } from "@/server/services/collection/game-management";
import {
  getGameCatalog,
  saveGameCatalog,
} from "@/server/services/catalog/games";
import { changeCatalogTrailer } from "@/server/services/catalog/trailers";
import { changeCatalogPlaytime } from "@/server/services/catalog/playtime";
import {
  createEnrichmentRunner,
  prepareEnrichmentReview,
  applyEnrichmentSuggestions,
} from "@/server/services/enrichment";
import {
  mapGame,
  mapSearch,
} from "@/server/providers/game-metadata/igdb-mapping";
import raw from "../fixtures/game-metadata/igdb-game.json";
const db = getDatabase();
const secret = "provenance-test-secret-longer-than-thirty-two-characters";
async function actor(role: "ADMIN" | "EDITOR" | "VIEWER" = "ADMIN") {
  const email = `${randomUUID()}@example.com`;
  const user = await db.user.create({
    data: { name: "Source fixture", email, emailVerified: true },
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
  return { user, grant, context };
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
async function setup() {
  const admin = await actor();
  const viewer = await actor("VIEWER");
  const company = await db.company.create({
    data: { name: "Manual Studio", slug: randomUUID() },
  });
  const mapped = await db.company.create({
    data: { name: "Imported Studio", slug: randomUUID() },
  });
  const gameId = await saveGameCatalog(admin.context, {
    ...gameInput("Manual title", randomUUID()),
    fields: {
      ...gameInput().fields,
      name: "Manual title",
      slug: randomUUID(),
      description: "Manual description",
      aliases: "Manual alias",
      developers: [{ companyId: company.id, creditLabel: "My credit" }],
    },
    references: [
      {
        provider: "archive",
        providerObjectType: "GAME",
        externalId: "manual-reference",
        url: "https://example.com/manual",
      },
    ],
  });
  const platform = await db.consolePlatform.create({
    data: { name: "Platform", slug: randomUUID() },
  });
  const release = await db.gameRelease.create({
    data: {
      gameId,
      platformId: platform.id,
      slug: randomUUID(),
      editionName: "Standard",
    },
  });
  const copyId = await createGameCopy(admin.context, {
    ...emptyCopyPhysical,
    id: randomUUID(),
    gameId,
    gameRevision: 1,
    platformId: platform.id,
    platformRevision: 1,
    releaseId: release.id,
    releaseRevision: 1,
    notes: "PRIVATE_COPY_MARKER",
  });
  return { admin, viewer, gameId, platform, release, copyId, company, mapped };
}
async function imported() {
  const f = await setup();
  const at = "2026-10-19T12:00:00.000Z";
  const metadata = mapGame(
    raw,
    [
      {
        id: 99,
        game_id: 42,
        count: 12,
        hastily: 1800,
        normally: 3600,
        completely: 7200,
        updated_at: 1760000000,
      },
    ],
    at,
  );
  const runner = createEnrichmentRunner(() => ({
    id: "IGDB",
    search: async () => ({ ok: true, data: mapSearch([raw], at, null) }),
    fetch: async () => ({ ok: true, data: metadata }),
  }));
  const found = await runner.start(f.admin.context, {
    target: { kind: "game", id: f.gameId },
    expectedRevision: 1,
    requestKey: randomUUID(),
    query: "PRIVATE_QUERY_MARKER",
  });
  const fetched = await runner.selectCandidate(f.admin.context, {
    runId: found.id,
    expectedRunVersion: found.runVersion,
    externalId: "42",
  });
  const review = await prepareEnrichmentReview(f.admin.context, {
    runId: fetched.id,
    expectedRunVersion: fetched.runVersion,
    fields: [
      "name",
      "description",
      "aliases",
      "developers",
      "references",
      "trailer",
      "playtime",
    ],
    trailerExternalId: "18",
    companyBindings: [{ externalId: "7", companyId: f.mapped.id }],
  });
  const receipt = await applyEnrichmentSuggestions(f.admin.context, {
    runId: review.id,
    reviewToken: review.reviewToken,
    suggestionIds: review.suggestions.map((s) => s.id),
    manualReplacementIds: review.suggestions
      .filter((s) => s.manualReplacementRequired)
      .map((s) => s.id),
  });
  return { ...f, receipt, runId: review.id, runner };
}
it("projects every accepted field for a viewer without exposing private review/audit payloads", async () => {
  const f = await imported();
  const result = await getOwnedGame(f.viewer.context, { id: f.copyId });
  expect(result.provenance.game).toHaveLength(7);
  expect(
    result.provenance.game.every(
      (field) => field.origin === "PROVIDER" && field.source?.name === "IGDB",
    ),
  ).toBe(true);
  expect(
    result.provenance.release.every((field) => field.origin === "UNKNOWN"),
  ).toBe(true);
  const text = JSON.stringify(result.provenance);
  expect(text).not.toMatch(
    /PRIVATE_QUERY_MARKER|PRIVATE_COPY_MARKER|sourceSnapshot|actorId|requestedById|reviewToken|operationToken/,
  );
  expect(text).not.toContain(f.runId);
  const importedHistory = await db.metadataChange.findMany({
    where: { enrichmentSuggestionId: { not: null } },
  });
  expect(importedHistory).toHaveLength(7);
  const playtime = importedHistory.find((h) => h.fieldPath === "playtime")!;
  expect(JSON.stringify(playtime.sourceSnapshot)).toContain(
    "SECONDS_TO_MINUTES",
  );
  expect(JSON.stringify(playtime.sourceSnapshot)).toContain("originalValue");
  const catalog = await getGameCatalog(f.admin.context, {
    kind: "game",
    id: f.gameId,
  });
  expect(
    catalog.history.filter((h) => h.attribution.origin === "PROVIDER"),
  ).toHaveLength(7);
  await expect(
    getGameCatalog(f.viewer.context, { kind: "game", id: f.gameId }),
  ).rejects.toThrow();
  expect(result.detail.developers).toEqual(
    expect.arrayContaining(["Manual Studio", "Imported Studio"]),
  );
  expect(
    result.provenance.game.find((s) => s.field === "developers")?.source
      ?.transformations,
  ).toContain("Sourced entries added while retaining existing values.");
});
it("marks a manual replacement correctly while retaining the earlier imported source snapshot", async () => {
  const f = await imported();
  const catalog = await getGameCatalog(f.admin.context, {
    kind: "game",
    id: f.gameId,
  });
  const selected = catalog.selected!;
  const before = await db.metadataChange.findMany({
    where: { gameId: f.gameId, origin: "PROVIDER" },
    orderBy: { fieldPath: "asc" },
  });
  await saveGameCatalog(f.admin.context, {
    kind: "game",
    id: f.gameId,
    expectedRevision: selected.revision,
    fields: { ...selected.fields, description: "Later manual correction" },
    references: selected.references,
  });
  const result = await getOwnedGame(f.viewer.context, { id: f.copyId });
  expect(
    result.provenance.game.find((s) => s.field === "description"),
  ).toMatchObject({ origin: "MANUAL", source: null });
  expect(result.provenance.game.find((s) => s.field === "name")?.origin).toBe(
    "PROVIDER",
  );
  expect(
    await db.metadataChange.findMany({
      where: { gameId: f.gameId, origin: "PROVIDER" },
      orderBy: { fieldPath: "asc" },
    }),
  ).toEqual(before);
});
it("does not attribute an untracked edit to a matching provider reference", async () => {
  const f = await imported();
  await db.game.update({
    where: { id: f.gameId },
    data: { name: "Untracked legacy correction", revision: { increment: 1 } },
  });
  const result = await getOwnedGame(f.viewer.context, { id: f.copyId });
  expect(result.provenance.game.find((s) => s.field === "name")).toMatchObject({
    origin: "UNKNOWN",
    source: null,
    note: "The current value has no matching source record.",
  });
  expect(
    result.provenance.game.find((s) => s.field === "references")?.origin,
  ).toBe("PROVIDER");
});
it("finds unchanged field sources beyond the catalog's latest 50 history entries", async () => {
  const f = await imported();
  await db.metadataChange.createMany({
    data: Array.from({ length: 60 }, (_, i) => ({
      gameId: f.gameId,
      fieldPath: `screenshots.${randomUUID()}`,
      rootRevision: i + 3,
      origin: "MANUAL" as const,
      before: {},
      after: { operation: "fixture" },
    })),
  });
  await db.game.update({ where: { id: f.gameId }, data: { revision: 62 } });
  const catalog = await getGameCatalog(f.admin.context, {
    kind: "game",
    id: f.gameId,
  });
  expect(catalog.history).toHaveLength(50);
  expect(catalog.history.every((h) => h.attribution.origin === "MANUAL")).toBe(
    true,
  );
  expect(
    (
      await getOwnedGame(f.viewer.context, { id: f.copyId })
    ).provenance.game.every((s) => s.origin === "PROVIDER"),
  ).toBe(true);
});
it("retains source attribution and accepted history after the accepting user is deleted", async () => {
  const f = await imported();
  const before = (await getOwnedGame(f.viewer.context, { id: f.copyId }))
    .provenance;
  await db.user.delete({ where: { id: f.admin.user.id } });
  expect(
    (await getOwnedGame(f.viewer.context, { id: f.copyId })).provenance,
  ).toEqual(before);
  expect(
    (
      await db.metadataChange.findMany({
        where: { enrichmentSuggestionId: { not: null } },
      })
    ).every((h) => h.actorId === null && h.sourceSnapshot),
  ).toBe(true);
});
it("handles manual trailer approval history, sourced manual playtime and cleared fields honestly", async () => {
  const f = await setup();
  await changeCatalogTrailer(f.admin.context, {
    kind: "release",
    id: f.release.id,
    expectedRevision: 1,
    trailer: { provider: "YOUTUBE", id: "video123_45" },
  });
  await changeCatalogPlaytime(f.admin.context, {
    kind: "release",
    id: f.release.id,
    expectedRevision: 2,
    reviewed: true,
    estimates: {
      mainMinutes: 0,
      mainExtrasMinutes: null,
      completionistMinutes: null,
      sourceType: "PROVIDER",
      sourceName: "Manually entered external estimate",
      sourceUrl: "https://example.com/time",
      observedAt: "2026-10-19T12:00:00.000Z",
    },
  });
  let result = await getOwnedGame(f.viewer.context, { id: f.copyId });
  expect(
    result.provenance.release.find((s) => s.field === "trailer")?.origin,
  ).toBe("MANUAL");
  expect(
    result.provenance.release.find((s) => s.field === "playtime"),
  ).toMatchObject({ origin: "MANUAL", hasValue: true });
  await changeCatalogTrailer(f.admin.context, {
    kind: "release",
    id: f.release.id,
    expectedRevision: 3,
    trailer: null,
  });
  result = await getOwnedGame(f.viewer.context, { id: f.copyId });
  expect(
    result.provenance.release.find((s) => s.field === "trailer"),
  ).toMatchObject({ origin: "MANUAL", hasValue: false });
});
it("shows current media attribution without storage keys or implicit public approval", async () => {
  const f = await setup();
  const a = await db.asset.create({
    data: {
      kind: "IMAGE",
      scope: "CATALOG",
      state: "READY",
      deliveryClass: "DISPLAY",
      storageNamespace: "fixture",
      objectKey: "PRIVATE_STORAGE_MARKER",
      mimeType: "image/png",
      width: 120,
      height: 80,
      sizeBytes: 1,
      sha256: "a".repeat(64),
      sourceType: "CURATED",
      provider: "Archive",
      sourceUrl: "https://example.com/source",
      author: "Artist",
      licenseName: "Private reference",
      licenseUrl: "https://example.com/license",
      attribution: "Archive credit",
      usageRestrictions: "Do not publish",
      uploadedById: f.admin.user.id,
    },
  });
  const use = await db.catalogAsset.create({
    data: { gameId: f.gameId, assetId: a.id, role: "COVER", isPrimary: true },
  });
  const personal = await db.asset.create({
    data: {
      kind: "IMAGE",
      scope: "COLLECTION",
      state: "READY",
      deliveryClass: "DISPLAY",
      storageNamespace: "fixture",
      objectKey: "PRIVATE_PERSONAL_OBJECT",
      mimeType: "image/png",
      width: 120,
      height: 80,
      sizeBytes: 1,
      sha256: "b".repeat(64),
      uploadedById: f.admin.user.id,
    },
  });
  await db.collectionItemMedia.create({
    data: { collectionItemId: f.copyId, assetId: personal.id, type: "PHOTO" },
  });
  const result = await getOwnedGame(f.viewer.context, { id: f.copyId });
  expect(result.detail.cover).toMatchObject({
    scope: "game",
    source: {
      provider: "Archive",
      author: "Artist",
      attribution: "Archive credit",
      restrictions: "Do not publish",
    },
  });
  expect(result.detail.photos[0].source).toMatchObject({
    type: "USER_UPLOAD",
    provider: null,
    attribution: null,
    licenseName: null,
  });
  expect(JSON.stringify(result.detail.cover)).not.toMatch(
    /PRIVATE_STORAGE_MARKER|uploadedById|reviewedById/,
  );
  expect(
    await db.catalogAsset.findUnique({ where: { id: use.id } }),
  ).toMatchObject({ publicApproved: false });
  expect(await db.asset.findUnique({ where: { id: a.id } })).toMatchObject({
    rightsStatus: "UNKNOWN",
    publicSafe: false,
  });
  await db.user.delete({ where: { id: f.admin.user.id } });
  expect(
    (await getOwnedGame(f.viewer.context, { id: f.copyId })).detail.cover
      ?.source,
  ).toEqual(result.detail.cover?.source);
});
it("rechecks private access for attribution reads", async () => {
  const f = await imported();
  await db.accessGrant.update({
    where: { id: f.viewer.grant.id },
    data: { enabled: false },
  });
  await expect(
    getOwnedGame(f.viewer.context, { id: f.copyId }),
  ).rejects.toThrow();
});

it("requires acknowledgement before replacing a legacy correction despite an older provider history entry", async () => {
  const f = await imported();
  await db.game.update({
    where: { id: f.gameId },
    data: {
      description: "Untracked manual correction",
      revision: { increment: 1 },
    },
  });
  const fetched = await f.runner.start(f.admin.context, {
    target: { kind: "game", id: f.gameId },
    expectedRevision: 3,
    requestKey: randomUUID(),
    query: "Orbit Quest",
  });
  const review = await prepareEnrichmentReview(f.admin.context, {
    runId: fetched.id,
    expectedRunVersion: fetched.runVersion,
    fields: ["description"],
  });
  expect(review.suggestions).toHaveLength(1);
  expect(review.suggestions[0].manualReplacementRequired).toBe(true);
  await expect(
    applyEnrichmentSuggestions(f.admin.context, {
      runId: review.id,
      reviewToken: review.reviewToken,
      suggestionIds: [review.suggestions[0].id],
      manualReplacementIds: [],
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(
    (await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).description,
  ).toBe("Untracked manual correction");
});
