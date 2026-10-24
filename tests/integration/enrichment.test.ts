import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { requirePrivateAccess } from "@/server/auth/access";
import { getDatabase, disconnectDatabase } from "@/server/db/client";
import type { AccessRole } from "@/features/auth/contracts";
import { signedSessionCookie } from "../helpers/access-session";
import base from "../fixtures/game-metadata/igdb-game.json";
import {
  mapGame,
  mapSearch,
} from "@/server/providers/game-metadata/igdb-mapping";
import type {
  GameMetadataProvider,
  GameMetadataResult,
  GameSearchPage,
  ProviderResult,
} from "@/server/providers/game-metadata/contracts";
import {
  findEnrichmentCompanies,
  getEnrichmentTarget,
  createEnrichmentRunner,
  getEnrichmentReview,
  prepareEnrichmentReview,
  rejectEnrichmentSuggestions,
  applyEnrichmentSuggestions,
} from "@/server/services/enrichment";
import * as catalogRepository from "@/server/repositories/catalog/enrichment";
import type { EnrichmentReview } from "@/features/enrichment/contracts";
const db = getDatabase();
afterEach(() => vi.restoreAllMocks());
const secret = "game-creation-test-secret-longer-than-thirty-two-characters";
const time = "2026-10-19T12:00:00.000Z";
const metadata = mapGame(
  base,
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
  time,
);
const page = mapSearch([base], time, null);
function provider() {
  return {
    id: "IGDB" as const,
    search: vi
      .fn<GameMetadataProvider["search"]>()
      .mockResolvedValue({ ok: true, data: page }),
    fetch: vi
      .fn<GameMetadataProvider["fetch"]>()
      .mockResolvedValue({ ok: true, data: metadata }),
  };
}
async function actor(role: AccessRole = "EDITOR") {
  const email = `${randomUUID()}@example.com`;
  const user = await db.user.create({
    data: { name: "Enrichment fixture", email, emailVerified: true },
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
  await reset();
  await disconnectDatabase();
  vi.unstubAllEnvs();
});
async function setup(role: AccessRole = "EDITOR") {
  const owner = await actor(role);
  const game = await db.game.create({
    data: {
      name: "Manual title",
      slug: randomUUID(),
      description: "Manual description",
    },
  });
  const adapter = provider();
  const runner = createEnrichmentRunner(() => adapter);
  const input = {
    target: { kind: "game", id: game.id },
    expectedRevision: 1,
    requestKey: randomUUID(),
    query: "Orbit Quest",
  };
  return { owner, game, adapter, runner, input };
}
async function prepared(
  role: AccessRole = "EDITOR",
  fields = ["name", "description", "references", "playtime", "trailer"],
) {
  const fixture = await setup(role);
  const searched = await fixture.runner.start(
    fixture.owner.context,
    fixture.input,
  );
  const fetched = await fixture.runner.selectCandidate(fixture.owner.context, {
    runId: searched.id,
    expectedRunVersion: searched.runVersion,
    externalId: "42",
  });
  const choice = {
    runId: fetched.id,
    expectedRunVersion: fetched.runVersion,
    fields,
    trailerExternalId: fields.includes("trailer") ? "18" : undefined,
  };
  const review = await prepareEnrichmentReview(fixture.owner.context, choice);
  return { ...fixture, searched, fetched, choice, review };
}

it("records committed enrichment failure and success without logging queries or provider payloads", async () => {
  const fixture = await setup();
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  fixture.adapter.search.mockResolvedValueOnce({
    ok: false,
    error: { code: "UNAVAILABLE", retryable: true },
  });
  const review = await fixture.runner.start(fixture.owner.context, {
    ...fixture.input,
    query: "PRIVATE-QUERY-SENTINEL",
  });
  expect(review.fetchStatus).toBe("FAILED");
  const failed = errors.mock.calls.map(([line]) => JSON.parse(String(line)));
  expect(failed).toMatchObject([
    {
      operation: "enrichment.execute",
      outcome: "failed",
      code: "UNAVAILABLE",
      runId: review.id,
    },
  ]);
  expect(failed[0].correlationId).toBe(
    JSON.parse(String(info.mock.calls[0][0])).correlationId,
  );
  await fixture.runner.retry(fixture.owner.context, {
    runId: review.id,
    expectedRunVersion: review.runVersion,
  });
  expect(
    info.mock.calls.map(([line]) => JSON.parse(String(line))),
  ).toContainEqual(
    expect.objectContaining({
      operation: "enrichment.execute",
      outcome: "succeeded",
      runId: review.id,
    }),
  );
  expect([...info.mock.calls, ...errors.mock.calls].flat().join()).not.toMatch(
    /PRIVATE-QUERY-SENTINEL|Manual title|Orbit Quest|summary|candidates|client_secret/,
  );
});
function acceptance(
  review: EnrichmentReview,
  ids = review.suggestions.map((s) => s.id),
) {
  return {
    runId: review.id,
    reviewToken: review.reviewToken,
    suggestionIds: ids,
    manualReplacementIds: review.suggestions
      .filter((s) => s.manualReplacementRequired && ids.includes(s.id))
      .map((s) => s.id),
  };
}
it("retains candidate evidence and freezes proposals without changing the catalog", async () => {
  const f = await prepared();
  expect(f.review.fetchStatus).toBe("COMPLETED");
  expect(f.review.attemptCount).toBe(1);
  expect(f.review.suggestions).toHaveLength(5);
  expect(f.review.canApply).toBe(false);
  expect(
    f.review.stages.filter((s) => s.status === "SKIPPED").map((s) => s.name),
  ).toEqual(["web", "ai"]);
  expect(await db.game.findUnique({ where: { id: f.game.id } })).toMatchObject({
    name: "Manual title",
    description: "Manual description",
    revision: 1,
  });
  expect(await db.metadataChange.count()).toBe(0);
  expect(await prepareEnrichmentReview(f.owner.context, f.choice)).toEqual(
    f.review,
  );
  await expect(
    prepareEnrichmentReview(f.owner.context, { ...f.choice, fields: ["name"] }),
  ).rejects.toMatchObject({ code: "STALE" });
});
it("accepts an admin batch atomically with one revision and linked provider history", async () => {
  const f = await prepared();
  const admin = await actor("ADMIN");
  const command = acceptance(f.review);
  await expect(
    applyEnrichmentSuggestions(f.owner.context, command),
  ).rejects.toThrow();
  await expect(
    applyEnrichmentSuggestions(admin.context, {
      ...command,
      manualReplacementIds: [],
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  const receipt = await applyEnrichmentSuggestions(admin.context, command);
  expect(receipt.revision).toBe(2);
  expect(receipt.changeIds).toHaveLength(5);
  expect(await db.game.findUnique({ where: { id: f.game.id } })).toMatchObject({
    name: "Orbit Quest",
    revision: 2,
    trailerPublicApproved: false,
  });
  expect(
    await db.gamePlaytime.findUnique({ where: { gameId: f.game.id } }),
  ).toMatchObject({ sourceType: "PROVIDER", mainMinutes: 30 });
  const history = await db.metadataChange.findMany();
  expect(history).toHaveLength(5);
  expect(
    history.every(
      (h) =>
        h.origin === "PROVIDER" &&
        h.rootRevision === 2 &&
        h.actorId === admin.user.id &&
        h.enrichmentSuggestionId,
    ),
  ).toBe(true);
  expect(
    history.find((h) => h.fieldPath === "description")?.sourceSnapshot,
  ).toMatchObject({
    schemaVersion: 1,
    data: { provider: "IGDB", scope: "GAME" },
  });
  await db.game.update({
    where: { id: f.game.id },
    data: { name: "Later manual edit", revision: { increment: 1 } },
  });
  expect(await applyEnrichmentSuggestions(admin.context, command)).toEqual(
    receipt,
  );
  expect((await db.game.findUnique({ where: { id: f.game.id } }))?.name).toBe(
    "Later manual edit",
  );
  expect(await db.metadataChange.count()).toBe(5);
});
it("binds request keys to original actor and intent, and hides another editor's run", async () => {
  const f = await setup();
  const review = await f.runner.start(f.owner.context, f.input);
  expect((await f.runner.start(f.owner.context, f.input)).id).toBe(review.id);
  expect(f.adapter.search).toHaveBeenCalledTimes(1);
  await expect(
    f.runner.start(f.owner.context, { ...f.input, query: "Different" }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  const other = await actor();
  const admin = await actor("ADMIN");
  await expect(
    getEnrichmentReview(other.context, { runId: review.id }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(f.runner.start(admin.context, f.input)).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  const viewer = await actor("VIEWER");
  await expect(
    f.runner.start(viewer.context, { ...f.input, requestKey: randomUUID() }),
  ).rejects.toThrow();
});
it("commits conflicts without overwriting stale canonical values", async () => {
  const f = await prepared("ADMIN");
  await db.game.update({
    where: { id: f.game.id },
    data: { description: "New manual text", revision: { increment: 1 } },
  });
  await expect(
    applyEnrichmentSuggestions(f.owner.context, acceptance(f.review)),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(
    (await db.enrichmentSuggestion.findMany()).every(
      (s) => s.reviewStatus === "CONFLICT",
    ),
  ).toBe(true);
  expect(await db.metadataChange.count()).toBe(0);
  expect(
    (await db.game.findUnique({ where: { id: f.game.id } }))?.description,
  ).toBe("New manual text");
});
it("partial acceptance invalidates remaining proposals and rejection is idempotent", async () => {
  const f = await prepared("ADMIN");
  const name = f.review.suggestions.find((s) => s.fieldPath === "name")!;
  await applyEnrichmentSuggestions(
    f.owner.context,
    acceptance(f.review, [name.id]),
  );
  const rows = await db.enrichmentSuggestion.findMany();
  expect(rows.filter((r) => r.reviewStatus === "ACCEPTED")).toHaveLength(1);
  expect(rows.filter((r) => r.reviewStatus === "CONFLICT")).toHaveLength(4);
  await expect(
    applyEnrichmentSuggestions(f.owner.context, acceptance(f.review)),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  const next = await prepared();
  const command = {
    runId: next.review.id,
    expectedRunVersion: next.review.runVersion,
    suggestionIds: next.review.suggestions.map((s) => s.id),
  };
  const rejected = await rejectEnrichmentSuggestions(
    next.owner.context,
    command,
  );
  expect(rejected.suggestions.every((s) => s.status === "REJECTED")).toBe(true);
  expect(
    await rejectEnrichmentSuggestions(next.owner.context, command),
  ).toEqual(rejected);
});
it("rechecks revoked administrator authority before acceptance", async () => {
  const f = await prepared("ADMIN");
  await db.accessGrant.update({
    where: { id: f.owner.grant.id },
    data: { role: "EDITOR" },
  });
  await expect(
    applyEnrichmentSuggestions(f.owner.context, acceptance(f.review)),
  ).rejects.toThrow();
  expect(await db.metadataChange.count()).toBe(0);
  expect(
    (await db.game.findUnique({ where: { id: f.game.id } }))?.revision,
  ).toBe(1);
});
it("retries failed provider work at most three times and never starts twice for a stale retry", async () => {
  const f = await setup();
  f.adapter.search.mockResolvedValue({
    ok: false,
    error: { code: "UNAVAILABLE", retryable: true },
  });
  let review = await f.runner.start(f.owner.context, f.input);
  expect(review.failureCode).toBe("UNAVAILABLE");
  const firstRetry = {
    runId: review.id,
    expectedRunVersion: review.runVersion,
  };
  review = await f.runner.retry(f.owner.context, firstRetry);
  await f.runner.retry(f.owner.context, firstRetry);
  expect(f.adapter.search).toHaveBeenCalledTimes(2);
  review = await f.runner.retry(f.owner.context, {
    runId: review.id,
    expectedRunVersion: review.runVersion,
  });
  expect(review.attemptCount).toBe(3);
  await expect(
    f.runner.retry(f.owner.context, {
      runId: review.id,
      expectedRunVersion: review.runVersion,
    }),
  ).rejects.toMatchObject({ code: "STALE" });
  expect(f.adapter.search).toHaveBeenCalledTimes(3);
});
it("holds no database lock during provider work and fences cancelled responses", async () => {
  const f = await setup();
  let ready!: () => void;
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  let finish!: (value: ProviderResult<GameSearchPage>) => void;
  f.adapter.search.mockImplementation(() => {
    ready();
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const pending = f.runner.start(f.owner.context, f.input);
  await started;
  const row = (await db.enrichmentRun.findMany())[0];
  await expect(
    f.runner.start(f.owner.context, { ...f.input, requestKey: randomUUID() }),
  ).rejects.toMatchObject({ code: "IN_PROGRESS" });
  const cancelled = await f.runner.cancel(f.owner.context, {
    runId: row.id,
    expectedRunVersion: row.runVersion,
  });
  expect(cancelled.failureCode).toBe("CANCELLED");
  finish({ ok: true, data: page });
  expect((await pending).failureCode).toBe("CANCELLED");
  expect(
    (await db.enrichmentRun.findUnique({ where: { id: row.id } }))?.candidates,
  ).toBeNull();
});
it("recovers abandoned leases and blocks stale generations", async () => {
  const f = await setup();
  const review = await f.runner.start(f.owner.context, f.input);
  await db.enrichmentRun.update({
    where: { id: review.id },
    data: {
      fetchStatus: "RUNNING",
      operationToken: randomUUID(),
      leaseUntil: new Date(Date.now() - 1000),
      completedAt: null,
    },
  });
  const recovered = await getEnrichmentReview(f.owner.context, {
    runId: review.id,
  });
  expect(recovered.failureCode).toBe("TIMEOUT");
  expect(recovered.fetchStatus).toBe("FAILED");
});
it("rejects forged candidates and validates adapter output again", async () => {
  const f = await setup();
  const review = await f.runner.start(f.owner.context, f.input);
  await expect(
    f.runner.selectCandidate(f.owner.context, {
      runId: review.id,
      expectedRunVersion: review.runVersion,
      externalId: "999",
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  f.adapter.fetch.mockResolvedValue({
    ok: true,
    data: { ...metadata, schemaVersion: 999 },
  } as never);
  const failed = await f.runner.selectCandidate(f.owner.context, {
    runId: review.id,
    expectedRunVersion: review.runVersion,
    externalId: "42",
  });
  expect(failed.failureCode).toBe("INVALID_RESPONSE");
  expect(await db.enrichmentSuggestion.count()).toBe(0);
});
it("keeps release evidence conservative and never applies broad Game fields to an edition", async () => {
  const f = await setup("ADMIN");
  const platform = await db.consolePlatform.create({
    data: { name: "Platform", slug: randomUUID() },
  });
  const release = await db.gameRelease.create({
    data: {
      gameId: f.game.id,
      platformId: platform.id,
      slug: randomUUID(),
      editionName: "Collectors",
    },
  });
  const searched = await f.runner.start(f.owner.context, {
    ...f.input,
    target: { kind: "release", id: release.id },
  });
  const fetched = await f.runner.selectCandidate(f.owner.context, {
    runId: searched.id,
    expectedRunVersion: searched.runVersion,
    externalId: "42",
  });
  const review = await prepareEnrichmentReview(f.owner.context, {
    runId: fetched.id,
    expectedRunVersion: fetched.runVersion,
    fields: ["references", "descriptionOverride", "markets"],
  });
  expect(review.suggestions.map((s) => s.fieldPath)).toEqual(["references"]);
  await applyEnrichmentSuggestions(f.owner.context, acceptance(review));
  expect(
    await db.gameRelease.findUnique({ where: { id: release.id } }),
  ).toMatchObject({
    revision: 2,
    descriptionOverride: null,
    editionName: "Collectors",
  });
  expect(
    (await db.game.findUnique({ where: { id: f.game.id } }))?.revision,
  ).toBe(1);
});
it("requires active company bindings and detects changed match dependencies", async () => {
  const f = await prepared("ADMIN", ["developers"]);
  expect(f.review.suggestions).toHaveLength(0);
  expect(f.review.unavailable.some((u) => u.field === "developers")).toBe(true);
  const company = await db.company.create({
    data: { name: "Studio", slug: randomUUID() },
  });
  const searched = await f.runner.start(f.owner.context, {
    ...f.input,
    requestKey: randomUUID(),
  });
  const fetched = await f.runner.selectCandidate(f.owner.context, {
    runId: searched.id,
    expectedRunVersion: searched.runVersion,
    externalId: "42",
  });
  const review = await prepareEnrichmentReview(f.owner.context, {
    runId: fetched.id,
    expectedRunVersion: fetched.runVersion,
    fields: ["developers"],
    companyBindings: [{ externalId: "7", companyId: company.id }],
  });
  expect(review.suggestions).toHaveLength(1);
  await db.company.update({
    where: { id: company.id },
    data: { revision: { increment: 1 } },
  });
  await expect(
    applyEnrichmentSuggestions(f.owner.context, acceptance(review)),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(await db.gameCompany.count()).toBe(0);
});
it("protects published payloads and source/target constraints at the database boundary", async () => {
  const f = await prepared("ADMIN");
  const row = (await db.enrichmentRun.findMany())[0];
  const suggestion = f.review.suggestions[0];
  await expect(
    db.enrichmentRun.update({
      where: { id: row.id },
      data: { query: { query: "rewrite" } },
    }),
  ).rejects.toThrow();
  await expect(
    db.enrichmentSuggestion.update({
      where: { id: suggestion.id },
      data: { proposed: "rewrite" },
    }),
  ).rejects.toThrow();
  const fresh = {
    requestKey: randomUUID(),
    requestedById: f.owner.user.id,
    targetBaseRevision: 1,
    targetSnapshot: {},
    query: {},
    fingerprint: "a".repeat(64),
    provider: "IGDB",
  };
  await expect(db.enrichmentRun.create({ data: fresh })).rejects.toThrow();
  await expect(
    db.enrichmentRun.create({
      data: { ...fresh, gameId: f.game.id, preparedChoices: {} },
    }),
  ).rejects.toThrow();
  await expect(
    db.enrichmentSuggestion.create({
      data: {
        runId: row.id,
        fieldPath: "aliases",
        before: [],
        proposed: ["alias"],
        sourceSnapshot: { schemaVersion: 1, data: {} },
        origin: "PROVIDER",
        confidence: 0.5,
      },
    }),
  ).rejects.toThrow();
});

it("rolls back canonical values, relations, history and decisions when any write fails", async () => {
  const f = await prepared("ADMIN");
  vi.spyOn(catalogRepository, "recordAcceptedChange").mockRejectedValueOnce(
    new Error("Database unavailable"),
  );
  await expect(
    applyEnrichmentSuggestions(f.owner.context, acceptance(f.review)),
  ).rejects.toMatchObject({ code: "UNAVAILABLE" });
  expect(await db.game.findUnique({ where: { id: f.game.id } })).toMatchObject({
    revision: 1,
    name: "Manual title",
    description: "Manual description",
    trailerProvider: null,
  });
  expect(await db.externalReference.count()).toBe(0);
  expect(await db.gamePlaytime.count()).toBe(0);
  expect(await db.metadataChange.count()).toBe(0);
  expect(
    (await db.enrichmentSuggestion.findMany()).every(
      (s) => s.reviewStatus === "PENDING",
    ),
  ).toBe(true);
  expect(
    (await db.enrichmentRun.findUnique({ where: { id: f.review.id } }))
      ?.receipt,
  ).toBeNull();
});
it("omits no-op proposals and fetches a previously accepted mapping without searching", async () => {
  const f = await setup("ADMIN");
  await db.game.update({
    where: { id: f.game.id },
    data: {
      name: metadata.identity.name,
      aliases: metadata.identity.aliases,
      description:
        "data" in metadata.description ? metadata.description.data.value : null,
    },
  });
  await db.externalReference.create({
    data: {
      gameId: f.game.id,
      provider: "igdb",
      providerObjectType: "GAME",
      externalId: "42",
    },
  });
  const fetched = await f.runner.start(f.owner.context, f.input);
  expect(fetched.fetchStatus).toBe("COMPLETED");
  expect(f.adapter.search).not.toHaveBeenCalled();
  expect(f.adapter.fetch).toHaveBeenCalledOnce();
  const review = await prepareEnrichmentReview(f.owner.context, {
    runId: fetched.id,
    expectedRunVersion: fetched.runVersion,
    fields: ["name", "aliases", "description", "references"],
  });
  expect(review.suggestions).toHaveLength(0);
  expect(review.canApply).toBe(false);
  expect(await db.metadataChange.count()).toBe(0);
});
it("enforces the hourly quota under concurrent admission", async () => {
  const f = await setup();
  f.adapter.search.mockResolvedValue({
    ok: false,
    error: { code: "NOT_CONFIGURED", retryable: false },
  });
  await db.enrichmentRun.createMany({
    data: Array.from({ length: 19 }, () => ({
      gameId: f.game.id,
      requestedById: f.owner.user.id,
      requestKey: randomUUID(),
      targetBaseRevision: 1,
      targetSnapshot: {},
      query: {},
      fingerprint: "b".repeat(64),
      provider: "IGDB",
      fetchStatus: "FAILED" as const,
      failureCode: "NOT_CONFIGURED",
      completedAt: new Date(),
    })),
  });
  const results = await Promise.allSettled([
    f.runner.start(f.owner.context, f.input),
    f.runner.start(f.owner.context, { ...f.input, requestKey: randomUUID() }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await db.enrichmentRun.count()).toBe(20);
  expect(f.adapter.search).toHaveBeenCalledOnce();
  await expect(
    f.runner.start(f.owner.context, { ...f.input, requestKey: randomUUID() }),
  ).rejects.toMatchObject({ code: "RATE_LIMITED" });
});
it("revoking a grant during retrieval prevents result publication", async () => {
  const f = await setup();
  f.adapter.search.mockImplementation(async () => {
    await db.accessGrant.update({
      where: { id: f.owner.grant.id },
      data: { enabled: false },
    });
    return { ok: true, data: page };
  });
  await expect(f.runner.start(f.owner.context, f.input)).rejects.toThrow();
  const run = (await db.enrichmentRun.findMany())[0];
  expect(run.candidates).toBeNull();
  expect(run.result).toBeNull();
  expect(await db.metadataChange.count()).toBe(0);
});
it("bounds non-cooperative adapters and propagates caller cancellation", async () => {
  const f = await setup();
  let ready!: () => void;
  let started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  f.adapter.search.mockImplementation(() => {
    ready();
    return new Promise(() => {});
  });
  const controller = new AbortController();
  const pending = f.runner.start(f.owner.context, f.input, controller.signal);
  await started;
  controller.abort();
  expect((await pending).failureCode).toBe("CANCELLED");
  started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    const second = f.runner.start(f.owner.context, {
      ...f.input,
      requestKey: randomUUID(),
    });
    await started;
    vi.advanceTimersByTime(45000);
    vi.useRealTimers();
    expect((await second).failureCode).toBe("TIMEOUT");
  } finally {
    vi.useRealTimers();
  }
});

it("rejects an archived target without changing the catalog", async () => {
  const f = await prepared("ADMIN");
  await db.game.update({
    where: { id: f.game.id },
    data: { archivedAt: new Date() },
  });
  await expect(
    applyEnrichmentSuggestions(f.owner.context, acceptance(f.review)),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(await db.metadataChange.count()).toBe(0);
  expect(
    (await db.enrichmentSuggestion.findMany()).every(
      (s) => s.reviewStatus === "CONFLICT",
    ),
  ).toBe(true);
});
it("retains accepted lineage and decision times after actor deletion", async () => {
  const f = await prepared("ADMIN");
  const receipt = await applyEnrichmentSuggestions(
    f.owner.context,
    acceptance(f.review),
  );
  const times = (
    await db.enrichmentSuggestion.findMany({ orderBy: { id: "asc" } })
  ).map((s) => s.reviewedAt);
  const other = await actor("ADMIN");
  await db.user.delete({ where: { id: f.owner.user.id } });
  const review = await getEnrichmentReview(other.context, {
    runId: f.review.id,
  });
  expect(review.receipt).toEqual(receipt);
  const suggestions = await db.enrichmentSuggestion.findMany({
    orderBy: { id: "asc" },
  });
  expect(suggestions.map((s) => s.reviewedAt)).toEqual(times);
  expect(
    suggestions.every(
      (s) => s.reviewedById === null && s.reviewStatus === "ACCEPTED",
    ),
  ).toBe(true);
  expect(
    (await db.metadataChange.findMany()).every(
      (h) => h.actorId === null && h.sourceSnapshot && h.enrichmentSuggestionId,
    ),
  ).toBe(true);
  await expect(db.game.delete({ where: { id: f.game.id } })).rejects.toThrow();
});

it("offers editors a narrow active target and company lookup while denying viewers", async () => {
  const f = await setup();
  const active = await db.company.create({
    data: { name: "Example Studio", slug: randomUUID() },
  });
  await db.company.create({
    data: {
      name: "Example Archived",
      slug: randomUUID(),
      archivedAt: new Date(),
    },
  });
  expect(await getEnrichmentTarget(f.owner.context, f.input.target)).toEqual({
    target: f.input.target,
    label: `Manual title · ${f.game.slug}`,
    revision: 1,
    query: "Manual title",
  });
  expect(
    await findEnrichmentCompanies(f.owner.context, { query: "Example" }),
  ).toEqual([{ id: active.id, name: active.name }]);
  const viewer = await actor("VIEWER");
  await expect(
    getEnrichmentTarget(viewer.context, f.input.target),
  ).rejects.toThrow();
  await expect(
    findEnrichmentCompanies(viewer.context, { query: "Example" }),
  ).rejects.toThrow();
  await db.game.update({
    where: { id: f.game.id },
    data: { archivedAt: new Date() },
  });
  await expect(
    getEnrichmentTarget(f.owner.context, f.input.target),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});

it.each(["search", "trailer"])(
  "refuses ambiguous %s selections from an adapter without retaining usable results",
  async (stage) => {
    const f = await setup("ADMIN");
    if (stage === "search") {
      const malformed = structuredClone(page);
      malformed.candidates.push({
        ...structuredClone(malformed.candidates[0]),
        identity: {
          ...malformed.candidates[0].identity,
          name: "Conflicting game",
        },
      });
      f.adapter.search.mockResolvedValue({ ok: true, data: malformed });
    } else {
      const malformed: GameMetadataResult = structuredClone(metadata);
      if (!("data" in malformed.videos))
        throw new Error("Missing fixture video");
      malformed.videos.data.push({
        ...structuredClone(malformed.videos.data[0]),
        value: {
          ...malformed.videos.data[0].value,
          title: "Conflicting video",
          video: { provider: "YOUTUBE", id: "abcdefghijk" },
        },
      });
      f.adapter.fetch.mockResolvedValue({ ok: true, data: malformed });
    }
    const found = await f.runner.start(f.owner.context, f.input);
    const review =
      stage === "search"
        ? found
        : await f.runner.selectCandidate(f.owner.context, {
            runId: found.id,
            expectedRunVersion: found.runVersion,
            externalId: "42",
          });
    expect(review).toMatchObject({
      fetchStatus: "FAILED",
      failureCode: "INVALID_RESPONSE",
      suggestions: [],
      availableFields: [],
    });
    expect(
      (await db.enrichmentRun.findUniqueOrThrow({ where: { id: review.id } }))
        .result,
    ).toBeNull();
    expect(await db.metadataChange.count()).toBe(0);
    expect(
      (await db.game.findUniqueOrThrow({ where: { id: f.game.id } })).revision,
    ).toBe(1);
  },
);

it("retains incomplete-evidence warnings across review and acceptance while preserving manual group entries", async () => {
  const f = await setup("ADMIN");
  const existing = await db.company.create({
    data: { name: "Manual developer", slug: randomUUID() },
  });
  const added = await db.company.create({
    data: { name: "Reviewed developer", slug: randomUUID() },
  });
  await db.game.update({
    where: { id: f.game.id },
    data: { aliases: ["Manual alias"] },
  });
  await db.gameCompany.create({
    data: {
      gameId: f.game.id,
      companyId: existing.id,
      role: "DEVELOPER",
      creditLabel: "Manual credit",
      sortOrder: 0,
    },
  });
  await db.gamePlaytime.create({
    data: {
      gameId: f.game.id,
      mainMinutes: 10,
      mainExtrasMinutes: 20,
      completionistMinutes: 30,
      sourceType: "MANUAL",
      sourceName: "Manual timing",
      observedAt: new Date(time),
    },
  });
  const limited = mapGame(
    {
      ...base,
      involved_companies: [...base.involved_companies, null],
      videos: [...base.videos, null],
    },
    [
      {
        id: 99,
        game_id: 42,
        count: 12,
        hastily: 1800,
        normally: 0,
        completely: 7200,
      },
    ],
    time,
  );
  f.adapter.fetch.mockResolvedValue({ ok: true, data: limited });
  const found = await f.runner.start(f.owner.context, f.input);
  const fetched = await f.runner.selectCandidate(f.owner.context, {
    runId: found.id,
    expectedRunVersion: found.runVersion,
    externalId: "42",
  });
  expect(fetched.warnings).toEqual([
    "Developer evidence is incomplete; only supplied values or choices are shown.",
    "Trailer evidence is incomplete; only supplied values or choices are shown.",
    "Playtime evidence is incomplete; only supplied values or choices are shown.",
  ]);
  const review = await prepareEnrichmentReview(f.owner.context, {
    runId: fetched.id,
    expectedRunVersion: fetched.runVersion,
    fields: ["aliases", "developers", "trailer", "playtime"],
    trailerExternalId: "18",
    companyBindings: [{ externalId: "7", companyId: added.id }],
  });
  expect(review.warnings).toEqual(fetched.warnings);
  const playtime = review.suggestions.find((s) => s.fieldPath === "playtime")!;
  expect(playtime.proposed).toMatchObject({
    mainMinutes: 30,
    mainExtrasMinutes: null,
    completionistMinutes: 120,
  });
  expect(playtime.manualReplacementRequired).toBe(true);
  await expect(
    applyEnrichmentSuggestions(f.owner.context, {
      ...acceptance(review),
      manualReplacementIds: [],
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await applyEnrichmentSuggestions(f.owner.context, acceptance(review));
  expect(
    (await db.game.findUniqueOrThrow({ where: { id: f.game.id } })).aliases,
  ).toEqual(["Manual alias", "Orbit Quest International"]);
  expect(
    await db.gameCompany.findMany({
      where: { gameId: f.game.id },
      select: { companyId: true, creditLabel: true },
      orderBy: { sortOrder: "asc" },
    }),
  ).toEqual([
    { companyId: existing.id, creditLabel: "Manual credit" },
    { companyId: added.id, creditLabel: null },
  ]);
  expect(
    (await getEnrichmentReview(f.owner.context, { runId: review.id })).warnings,
  ).toEqual(fetched.warnings);
  expect(await db.metadataChange.count()).toBe(4);
});

it("returns one receipt for concurrent identical acceptance without duplicating history", async () => {
  const f = await prepared("ADMIN");
  const receipts = await Promise.all([
    applyEnrichmentSuggestions(f.owner.context, acceptance(f.review)),
    applyEnrichmentSuggestions(f.owner.context, acceptance(f.review)),
  ]);
  expect(receipts[0]).toEqual(receipts[1]);
  expect(await db.metadataChange.count()).toBe(5);
  expect(
    (await db.game.findUniqueOrThrow({ where: { id: f.game.id } })).revision,
  ).toBe(2);
});

it.each(["game", "platform"])(
  "invalidates a release reference when its parent %s changes",
  async (parent) => {
    const f = await setup("ADMIN");
    const platform = await db.consolePlatform.create({
      data: { name: "Platform", slug: randomUUID() },
    });
    const release = await db.gameRelease.create({
      data: {
        gameId: f.game.id,
        platformId: platform.id,
        slug: randomUUID(),
        editionType: "COLLECTORS",
        editionName: "Manual edition",
      },
    });
    const found = await f.runner.start(f.owner.context, {
      ...f.input,
      target: { kind: "release", id: release.id },
    });
    const fetched = await f.runner.selectCandidate(f.owner.context, {
      runId: found.id,
      expectedRunVersion: found.runVersion,
      externalId: "42",
    });
    const review = await prepareEnrichmentReview(f.owner.context, {
      runId: fetched.id,
      expectedRunVersion: fetched.runVersion,
      fields: ["references"],
    });
    if (parent === "game")
      await db.game.update({
        where: { id: f.game.id },
        data: { revision: { increment: 1 } },
      });
    else
      await db.consolePlatform.update({
        where: { id: platform.id },
        data: { revision: { increment: 1 } },
      });
    await expect(
      applyEnrichmentSuggestions(f.owner.context, acceptance(review)),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await db.externalReference.count()).toBe(0);
    expect(await db.metadataChange.count()).toBe(0);
    expect(
      await db.gameRelease.findUniqueOrThrow({ where: { id: release.id } }),
    ).toMatchObject({
      revision: 1,
      editionType: "COLLECTORS",
      editionName: "Manual edition",
      firstReleaseYear: null,
    });
  },
);
