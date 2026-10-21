import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { requirePrivateAccess } from "@/server/auth/access";
import { getDatabase, disconnectDatabase } from "@/server/db/client";
import type { AccessRole } from "@/features/auth/contracts";
import { signedSessionCookie } from "../helpers/access-session";
import {
  accessoryEvidenceFixture,
  fixtureAccessoryProvider,
} from "../helpers/accessory-enrichment-fixture";
import {
  createEnrichmentRunner,
  getEnrichmentTarget,
  getEnrichmentReview,
  prepareEnrichmentReview,
  rejectEnrichmentSuggestions,
  applyEnrichmentSuggestions,
} from "@/server/services/enrichment";
import type { EnrichmentTarget } from "@/features/enrichment/validation";
import * as catalog from "@/server/repositories/catalog/enrichment";
import * as guard from "@/server/repositories/catalog/management";
const db = getDatabase();
const secret = "game-creation-test-secret-longer-than-thirty-two-characters";
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
async function setup(
  role: AccessRole = "EDITOR",
  kind: "accessory" | "variant" = "accessory",
) {
  const owner = await actor(role),
    company = await db.company.create({
      data: { name: "Sony", slug: randomUUID() },
    }),
    accessory = await db.accessory.create({
      data: {
        name: "Manual controller",
        slug: randomUUID(),
        description: "Manual description",
      },
    }),
    variant = await db.accessoryVariant.create({
      data: {
        accessoryId: accessory.id,
        name: "Black",
        slug: randomUUID(),
        edition: "Manual edition",
      },
    });
  const adapter = fixtureAccessoryProvider();
  const game = vi.fn(() => {
    throw new Error("Game provider must not be used");
  });
  const runner = createEnrichmentRunner(game, () => adapter);
  const target: EnrichmentTarget = {
    kind,
    id: kind === "accessory" ? accessory.id : variant.id,
  };
  const input = {
    target,
    expectedRevision: 1,
    requestKey: randomUUID(),
    query: "Synthetic controller",
  };
  return { owner, company, accessory, variant, adapter, game, runner, input };
}
async function fetched(s: Awaited<ReturnType<typeof setup>>) {
  const started = await s.runner.start(s.owner.context, s.input);
  expect(started.fetchStatus).toBe("NEEDS_SELECTION");
  return s.runner.selectCandidate(s.owner.context, {
    runId: started.id,
    expectedRunVersion: started.runVersion,
    externalId: "Q42",
  });
}
async function prepared(
  s: Awaited<ReturnType<typeof setup>>,
  fields = [
    "description",
    "releaseYear",
    "producerId",
    "trailer",
    "references",
  ],
) {
  const review = await fetched(s);
  return prepareEnrichmentReview(s.owner.context, {
    runId: review.id,
    expectedRunVersion: review.runVersion,
    fields,
    companyBindings: fields.includes("producerId")
      ? [{ externalId: "Q77", companyId: s.company.id }]
      : [],
    ...(fields.includes("trailer") ? { trailerExternalId: "dQw4w9WgXcQ" } : {}),
  });
}
it("uses shared runs and explicit candidate selection without invoking game retrieval", async () => {
  const s = await setup();
  expect(
    await getEnrichmentTarget(s.owner.context, s.input.target),
  ).toMatchObject({ revision: 1, query: "Manual controller" });
  const review = await fetched(s);
  expect(review).toMatchObject({
    fetchStatus: "COMPLETED",
    target: s.input.target,
    canAccept: false,
    observations: [
      { label: "Product image (source file page)" },
      { label: "Edition observation" },
    ],
  });
  expect(review.availableFields).toEqual(
    expect.arrayContaining([
      "releaseYear",
      "producerId",
      "description",
      "trailer",
      "references",
    ]),
  );
  expect(s.game).not.toHaveBeenCalled();
  expect(
    await db.accessory.findUnique({ where: { id: s.accessory.id } }),
  ).toMatchObject({ revision: 1, description: "Manual description" });
  expect(JSON.stringify(await db.enrichmentRun.findFirst())).not.toContain(
    "serialNumber",
  );
});
it("lets editors prepare private suggestions and only admins accept an acknowledged batch exactly once", async () => {
  const s = await setup(),
    review = await prepared(s),
    admin = await actor("ADMIN");
  expect(review.suggestions).toHaveLength(5);
  const command = {
    runId: review.id,
    reviewToken: review.reviewToken,
    suggestionIds: review.suggestions.map((v) => v.id),
    manualReplacementIds: review.suggestions
      .filter((v) => v.manualReplacementRequired)
      .map((v) => v.id),
  };
  await expect(
    applyEnrichmentSuggestions(s.owner.context, command),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    applyEnrichmentSuggestions(admin.context, {
      ...command,
      manualReplacementIds: [],
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  const receipt = await applyEnrichmentSuggestions(admin.context, command);
  expect(await applyEnrichmentSuggestions(admin.context, command)).toEqual(
    receipt,
  );
  expect(
    await db.accessory.findUnique({ where: { id: s.accessory.id } }),
  ).toMatchObject({
    revision: 2,
    description: "Synthetic sourced controller description",
    releaseYear: 2001,
    producerId: s.company.id,
    trailerProvider: "YOUTUBE",
    trailerId: "dQw4w9WgXcQ",
    trailerPublicApproved: false,
  });
  expect(await db.metadataChange.count()).toBe(5);
  expect(await db.metadataChange.findMany()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        accessoryId: s.accessory.id,
        origin: "PROVIDER",
        enrichmentSuggestionId: expect.any(String),
        sourceSnapshot: expect.objectContaining({
          data: expect.objectContaining({
            provider: "WIKIDATA",
            scope: "ACCESSORY",
          }),
        }),
      }),
    ]),
  );
});
it("keeps variant reviews reference-only and leaves identity, markets, compatibility and family facts unchanged", async () => {
  const s = await setup("ADMIN", "variant"),
    review = await fetched(s);
  expect(
    (await getEnrichmentTarget(s.owner.context, s.input.target)).query,
  ).toBe("Manual controller");
  expect(review.availableFields).toEqual(["references"]);
  const ready = await prepareEnrichmentReview(s.owner.context, {
    runId: review.id,
    expectedRunVersion: review.runVersion,
    fields: ["references", "description", "releaseYear"],
  });
  expect(ready.suggestions.map((v) => v.fieldPath)).toEqual(["references"]);
  expect(ready.unavailable.map((v) => v.field)).toEqual(
    expect.arrayContaining(["variantMetadata", "description", "releaseYear"]),
  );
  await applyEnrichmentSuggestions(s.owner.context, {
    runId: ready.id,
    reviewToken: ready.reviewToken,
    suggestionIds: ready.suggestions.map((v) => v.id),
  });
  expect(
    await db.accessoryVariant.findUnique({
      where: { id: s.variant.id },
      include: { regions: true, platforms: true },
    }),
  ).toMatchObject({
    edition: "Manual edition",
    releaseYear: null,
    producerId: null,
    revision: 2,
    regions: [],
    platforms: [],
  });
  expect(
    await db.accessory.findUnique({ where: { id: s.accessory.id } }),
  ).toMatchObject({ revision: 1, description: "Manual description" });
});
it("preserves other copies and private fields when family metadata is accepted", async () => {
  const s = await setup("ADMIN");
  const copy = await db.collectionItem.create({
    data: {
      type: "ACCESSORY",
      serialNumber: "Private serial",
      notes: "Private notes",
      ownedAccessory: { create: { accessoryVariantId: s.variant.id } },
    },
  });
  const ready = await prepared(s, ["releaseYear"]);
  await applyEnrichmentSuggestions(s.owner.context, {
    runId: ready.id,
    reviewToken: ready.reviewToken,
    suggestionIds: ready.suggestions.map((v) => v.id),
  });
  expect(
    await db.collectionItem.findUnique({ where: { id: copy.id } }),
  ).toMatchObject({
    serialNumber: "Private serial",
    notes: "Private notes",
    revision: 1,
    publicationStatus: "PRIVATE",
  });
  expect(JSON.stringify(ready)).not.toContain("Private notes");
});
it("detects stale roots, changed parent dependencies and changed company mappings", async () => {
  const s = await setup("ADMIN"),
    ready = await prepared(s);
  await db.company.update({
    where: { id: s.company.id },
    data: { revision: { increment: 1 } },
  });
  await expect(
    applyEnrichmentSuggestions(s.owner.context, {
      runId: ready.id,
      reviewToken: ready.reviewToken,
      suggestionIds: ready.suggestions.map((v) => v.id),
      manualReplacementIds: ready.suggestions.map((v) => v.id),
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(
    await db.accessory.findUnique({ where: { id: s.accessory.id } }),
  ).toMatchObject({ revision: 1 });
  const variant = await setup("ADMIN", "variant");
  const v = await fetched(variant);
  await db.accessory.update({
    where: { id: variant.accessory.id },
    data: { revision: { increment: 1 } },
  });
  await expect(
    prepareEnrichmentReview(variant.owner.context, {
      runId: v.id,
      expectedRunVersion: v.runVersion,
      fields: ["references"],
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});
it("requires exactly one sourced manufacturer binding and never creates companies", async () => {
  const s = await setup();
  const review = await fetched(s);
  const prepared = await prepareEnrichmentReview(s.owner.context, {
    runId: review.id,
    expectedRunVersion: review.runVersion,
    fields: ["producerId"],
  });
  expect(prepared.suggestions).toEqual([]);
  expect(prepared.unavailable).toEqual(
    expect.arrayContaining([expect.objectContaining({ field: "producerId" })]),
  );
  expect(await db.company.count()).toBe(1);
});
it("rejects foreign manufacturer IDs, unknown candidates and forged provider/source authority", async () => {
  const s = await setup();
  const started = await s.runner.start(s.owner.context, s.input);
  await expect(
    s.runner.selectCandidate(s.owner.context, {
      runId: started.id,
      expectedRunVersion: started.runVersion,
      externalId: "Q99",
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  const result = await s.runner.selectCandidate(s.owner.context, {
    runId: started.id,
    expectedRunVersion: started.runVersion,
    externalId: "Q42",
  });
  await expect(
    prepareEnrichmentReview(s.owner.context, {
      runId: result.id,
      expectedRunVersion: result.runVersion,
      fields: ["producerId"],
      companyBindings: [{ externalId: "Q99", companyId: s.company.id }],
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    s.runner.start(s.owner.context, { ...s.input, provider: "IGDB" }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
it("supports retries, identical start intents and cancellation through the same runner", async () => {
  const s = await setup();
  const search = vi.spyOn(s.adapter, "search").mockResolvedValueOnce({
    ok: false,
    error: { code: "NOT_CONFIGURED", retryable: false },
  });
  let review = await s.runner.start(s.owner.context, s.input);
  expect(review.failureCode).toBe("NOT_CONFIGURED");
  expect((await s.runner.start(s.owner.context, s.input)).id).toBe(review.id);
  expect(search).toHaveBeenCalledTimes(1);
  review = await s.runner.retry(s.owner.context, {
    runId: review.id,
    expectedRunVersion: review.runVersion,
  });
  expect(review.fetchStatus).toBe("NEEDS_SELECTION");
  review = await s.runner.cancel(s.owner.context, {
    runId: review.id,
    expectedRunVersion: review.runVersion,
  });
  expect(review.failureCode).toBe("CANCELLED");
});
it("does not expose editors' runs to other editors or viewers", async () => {
  const s = await setup(),
    ready = await fetched(s),
    other = await actor(),
    viewer = await actor("VIEWER");
  await expect(
    getEnrichmentReview(other.context, { runId: ready.id }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    getEnrichmentReview(viewer.context, { runId: ready.id }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("rolls back all accepted fields, history and decisions on failure", async () => {
  const s = await setup("ADMIN"),
    ready = await prepared(s);
  const save = catalog.recordAcceptedChange;
  vi.spyOn(catalog, "recordAcceptedChange").mockImplementation(
    async (...args) => {
      await save(...args);
      throw new Error("Synthetic history failure");
    },
  );
  await expect(
    applyEnrichmentSuggestions(s.owner.context, {
      runId: ready.id,
      reviewToken: ready.reviewToken,
      suggestionIds: ready.suggestions.map((v) => v.id),
      manualReplacementIds: ready.suggestions.map((v) => v.id),
    }),
  ).rejects.toMatchObject({ code: "UNAVAILABLE" });
  expect(
    await db.accessory.findUnique({ where: { id: s.accessory.id } }),
  ).toMatchObject({ revision: 1, description: "Manual description" });
  expect(await db.metadataChange.count()).toBe(0);
  expect(
    await db.enrichmentSuggestion.count({
      where: { reviewStatus: "ACCEPTED" },
    }),
  ).toBe(0);
});
it("rechecks grants under the write guard and rejects archived targets", async () => {
  const s = await setup("ADMIN"),
    ready = await prepared(s);
  const lock = guard.lockCatalogWrites;
  vi.spyOn(guard, "lockCatalogWrites").mockImplementation(async (tx) => {
    await lock(tx);
    await db.accessGrant.update({
      where: { id: s.owner.grant.id },
      data: { role: "EDITOR" },
    });
  });
  await expect(
    applyEnrichmentSuggestions(s.owner.context, {
      runId: ready.id,
      reviewToken: ready.reviewToken,
      suggestionIds: ready.suggestions.map((v) => v.id),
      manualReplacementIds: ready.suggestions.map((v) => v.id),
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  vi.restoreAllMocks();
  await db.accessory.update({
    where: { id: s.accessory.id },
    data: { archivedAt: new Date() },
  });
  await expect(
    s.runner.start(s.owner.context, { ...s.input, requestKey: randomUUID() }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});
it("rejects suggestions without writing canonical data and detects ambiguous normalized output", async () => {
  const s = await setup(),
    ready = await prepared(s, ["description"]);
  const ignored = await rejectEnrichmentSuggestions(s.owner.context, {
    runId: ready.id,
    expectedRunVersion: ready.runVersion,
    suggestionIds: ready.suggestions.map((v) => v.id),
  });
  expect(ignored.suggestions[0].status).toBe("REJECTED");
  const t = await setup();
  vi.spyOn(t.adapter, "fetch").mockResolvedValue({
    ok: true,
    data: {
      ...accessoryEvidenceFixture(),
      identity: {
        ...accessoryEvidenceFixture().identity,
        ref: { provider: "WIKIDATA", objectType: "ITEM", externalId: "Q999" },
      },
    },
  });
  const failed = await fetched(t);
  expect(failed).toMatchObject({
    fetchStatus: "FAILED",
    failureCode: "INVALID_RESPONSE",
  });
});
it("reuses accepted item/company mappings without searching and preserves unchanged producer fields", async () => {
  const s = await setup();
  await db.externalReference.createMany({
    data: [
      {
        accessoryId: s.accessory.id,
        provider: "wikidata",
        providerObjectType: "ITEM",
        externalId: "Q42",
      },
      {
        companyId: s.company.id,
        provider: "wikidata",
        providerObjectType: "ITEM",
        externalId: "Q77",
      },
    ],
  });
  const search = vi.spyOn(s.adapter, "search");
  const review = await s.runner.start(s.owner.context, s.input);
  expect(review.fetchStatus).toBe("COMPLETED");
  expect(search).not.toHaveBeenCalled();
  const ready = await prepareEnrichmentReview(s.owner.context, {
    runId: review.id,
    expectedRunVersion: review.runVersion,
    fields: ["producerId"],
  });
  expect(ready.suggestions).toMatchObject([
    { fieldPath: "producerId", proposed: s.company.id },
  ]);
});
it("keeps strict database provider and suggestion allowlists after replaying the migration", async () => {
  const s = await setup();
  await expect(
    db.enrichmentRun.create({
      data: {
        accessoryId: s.accessory.id,
        requestKey: randomUUID(),
        targetBaseRevision: 1,
        targetSnapshot: {},
        query: {},
        fingerprint: "a".repeat(64),
        provider: "UNKNOWN",
      },
    }),
  ).rejects.toThrow();
  expect(await db.enrichmentRun.count()).toBe(0);
});
