import {
  searchFilteredCollection,
  browsePrivateCollection,
  getCollectionFilterOptions,
} from "@/server/services/search/filtered";
import * as searchRepository from "@/server/repositories/search";
import { Prisma } from "@/server/db/generated/client";
import { privateCatalogSearchQuery } from "@/server/repositories/search/catalog-query";
import { filteredPrivateSearchQuery } from "@/server/repositories/search/query";
import { privateSearchQuery } from "@/server/repositories/search/query";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { getDatabase, disconnectDatabase } from "@/server/db/client";
import { requirePrivateAccess } from "@/server/auth/access";
import {
  searchPrivateCollection,
  searchPrivatePalette,
} from "@/server/services/search";
import {
  privateSearchRequest,
  privatePaletteRequest,
  privateFilteredRequest,
  privateCollectionRequest,
} from "@/server/http/search";
import { withTransaction } from "@/server/db/transaction";
import {
  configureSearch,
  parseSearchTerms,
} from "@/server/repositories/search";
import {
  publicSearchQuery,
  type SearchRow,
} from "@/server/repositories/search/query";
import type { AccessRole } from "@/features/auth/contracts";
import { signedSessionCookie } from "../helpers/access-session";
import {
  resetSearchData,
  seedSearchData,
  seedFilterData,
  seedBrowseData,
} from "../helpers/search-data";
const db = getDatabase();
const secret = "search-integration-secret-longer-than-thirty-two-characters";
async function actor(role: AccessRole = "VIEWER") {
  const email = `${randomUUID()}@example.com`;
  const user = await db.user.create({
    data: { name: "Search fixture", email, emailVerified: true },
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
  const headers = new Headers({
    Cookie: `gemukore.session_token=${signedSessionCookie(session.token, secret)}`,
    Origin: "http://localhost:3002",
    "Content-Type": "application/json",
  });
  return {
    context: await requirePrivateAccess(headers),
    headers,
    grant,
    session,
    user,
  };
}
beforeEach(async () => {
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3002");
  vi.stubEnv("BETTER_AUTH_SECRET", secret);
  vi.stubEnv("GOOGLE_CLIENT_ID", "test");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test");
  vi.stubEnv("GITHUB_CLIENT_ID", "");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "");
  await resetSearchData(db);
  await db.accessGrant.deleteMany();
  await db.user.deleteMany();
});
afterAll(async () => {
  await resetSearchData(db);
  await db.accessGrant.deleteMany();
  await db.user.deleteMany();
  await disconnectDatabase();
  vi.unstubAllEnvs();
});
const ids = (result: Awaited<ReturnType<typeof searchPrivateCollection>>) =>
  result.items.map((item) => item.id).sort();
it.each(["ADMIN", "EDITOR", "VIEWER"] as const)(
  "offers separate canonical and owned palette scopes for %s",
  async (role) => {
    const { context } = await actor(role);
    const data = await seedSearchData(db);
    const result = await searchPrivatePalette(context, { q: "chrono" });
    expect(ids(result.collection)).toEqual(
      [data.firstId, data.secondId].sort(),
    );
    expect(result.catalog).toEqual([
      {
        id: data.gameId,
        kind: "game",
        title: "Chrono Trigger",
        context: "",
        identificationStatus: null,
      },
    ]);
  },
);
it.each([
  ["SNS-001", "model"],
  ["snes", "platform"],
  ["chronoo", "game"],
  ["first printing", "release"],
  ["controller", "accessory"],
  ["tournament black", "variant"],
  ["squaresoft", "company"],
  ["japan", "region"],
])("finds canonical %s identities in the typed %s scope", async (q, kind) => {
  const { context } = await actor();
  await seedSearchData(db);
  const result = await searchPrivatePalette(context, { q });
  expect(result.catalog.some((item) => item.kind === kind)).toBe(true);
});
it("keeps unowned identities in catalog only, excludes archived catalog records and observes committed edits", async () => {
  const { context } = await actor();
  const data = await seedSearchData(db);
  const game = await db.game.create({
    data: { name: "Unowned museum title", slug: randomUUID() },
  });
  const before = await searchPrivatePalette(context, { q: "unowned museum" });
  expect(before.collection.items).toEqual([]);
  expect(before.catalog.map((item) => item.id)).toEqual([game.id]);
  await db.game.update({
    where: { id: game.id },
    data: { name: "Changed canonical name" },
  });
  expect(
    (await searchPrivatePalette(context, { q: "unowned museum" })).catalog,
  ).toEqual([]);
  expect(
    (await searchPrivatePalette(context, { q: "changed canonical" })).catalog[0]
      .id,
  ).toBe(game.id);
  await db.game.update({
    where: { id: data.gameId },
    data: { archivedAt: new Date() },
  });
  const archived = await searchPrivatePalette(context, { q: "chrono" });
  expect(archived.catalog).toEqual([]);
  expect(ids(archived.collection)).toEqual(
    [data.firstId, data.secondId].sort(),
  );
});
it("keeps serial/note/defect data out of catalog matching and every palette projection", async () => {
  const { context } = await actor();
  const data = await seedSearchData(db);
  for (const q of ["00-ABC-123", "ownersecret", "repairsecret", "cracked"]) {
    const result = await searchPrivatePalette(context, { q });
    expect(result.collection.items.map((item) => item.id)).toEqual([
      data.firstId,
    ]);
    expect(result.catalog).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(q);
  }
});
it("bounds and deduplicates canonical results with stable typed IDs", async () => {
  const { context } = await actor();
  await db.game.createMany({
    data: Array.from({ length: 15 }, (_, n) => ({
      name: `Palette fixture ${n}`,
      aliases: ["Palette fixture"],
      slug: randomUUID(),
    })),
  });
  const first = await searchPrivatePalette(context, { q: "palette" });
  expect(first.catalog).toHaveLength(10);
  expect(first.catalogHasMore).toBe(true);
  expect(first.collection.items).toEqual([]);
  expect(
    new Set(first.catalog.map((item) => `${item.kind}:${item.id}`)).size,
  ).toBe(10);
  expect(await searchPrivatePalette(context, { q: "palette" })).toEqual(first);
});
it("enforces current palette access, strict scope inputs, resource limits and redacted failures", async () => {
  const { context, headers, grant } = await actor();
  await seedSearchData(db);
  const send = (body: string, requestHeaders = headers) =>
    privatePaletteRequest(
      new Request("http://localhost:3002/api/search/palette", {
        method: "POST",
        headers: requestHeaders,
        body,
      }),
    );
  const response = await send(JSON.stringify({ q: "chrono" }));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
  expect((await response.json()).catalog).toHaveLength(1);
  for (const extra of [
    { includePrivate: true },
    { audience: "public" },
    { limit: 100 },
    { offset: 1 },
  ])
    expect((await send(JSON.stringify({ q: "chrono", ...extra }))).status).toBe(
      400,
    );
  expect((await send(" ".repeat(4097))).status).toBe(413);
  expect((await send("not json")).status).toBe(400);
  const foreign = new Headers(headers);
  foreign.set("origin", "https://outside.example");
  expect((await send('{"q":"chrono"}', foreign)).status).toBe(403);
  const anonymous = new Headers(headers);
  anonymous.delete("cookie");
  expect((await send('{"q":"chrono"}', anonymous)).status).toBe(401);
  const spy = vi
    .spyOn(searchRepository, "searchCatalogRows")
    .mockRejectedValueOnce(new Error("private catalog credentials"));
  try {
    const failed = await send('{"q":"chrono"}');
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("credentials");
  } finally {
    spy.mockRestore();
  }
  await db.accessGrant.update({
    where: { id: grant.id },
    data: { enabled: false },
  });
  await expect(searchPrivatePalette(context, { q: "" })).rejects.toThrow();
  expect((await send('{"q":"chrono"}')).status).toBe(403);
});
it.each(["ADMIN", "EDITOR", "VIEWER"] as const)(
  "allows current %s read access",
  async (role) => {
    const { context } = await actor(role);
    const data = await seedSearchData(db);
    expect(
      ids(await searchPrivateCollection(context, { q: "chrono" })),
    ).toEqual([data.firstId, data.secondId].sort());
  },
);
it.each([
  ["chrono snes square", "games"],
  ["squaresoft original japan", "games"],
  ["トリガー", "games"],
  ["first printing", "games"],
  ["cracked fracture", "first"],
  ["cracked ownersecret", "first"],
  ["repairsecret", "first"],
  ["yellowed restored", "second"],
  ["SNS-001 sharp", "console"],
  ["super famicom sharp", "console"],
  ["000-SNS", "console"],
  ["00-ABC-123", "first"],
  ["001234", "games"],
  ["00-MODEL", "console"],
  ["controller hori tournament black", "accessory"],
  ["HFC-RETAIL", "accessory"],
])("matches %s through the correct physical identity", async (q, kind) => {
  const { context } = await actor();
  const data = await seedSearchData(db);
  const expected =
    kind === "games"
      ? [data.firstId, data.secondId]
      : kind === "console"
        ? [data.consoleId]
        : kind === "accessory"
          ? [data.accessoryId]
          : kind === "first"
            ? [data.firstId]
            : [data.secondId];
  expect(ids(await searchPrivateCollection(context, { q }))).toEqual(
    expected.sort(),
  );
});
it.each([
  "chrono missing",
  "ownersecret yellowed",
  "00-ABC-124",
  "unsearchedmarkings",
  "unsearched snapshot",
  "unsearched catalog narrative",
  "%_\\",
  "chr OR nonexistent",
])("does not broaden or search excluded data for %s", async (q) => {
  const { context } = await actor();
  await seedSearchData(db);
  expect((await searchPrivateCollection(context, { q })).items).toEqual([]);
});
it("returns physical copies once, with narrow projections and real actions' IDs", async () => {
  const { context } = await actor();
  const data = await seedSearchData(db);
  const result = await searchPrivateCollection(context, { q: "square japan" });
  expect(ids(result)).toEqual([data.firstId, data.secondId].sort());
  expect(result.items[0]).toMatchObject({
    title: "Chrono Trigger",
    context:
      "Super Nintendo · Original · First printing · Japan, North America",
    identificationStatus: "CONFIRMED",
  });
  for (const value of [
    "ownersecret",
    "00-ABC-123",
    "repairsecret",
    "notes",
    "serialNumber",
    "metadata",
    "sources",
    "strength",
  ])
    expect(JSON.stringify(result)).not.toContain(value);
});
it("matches prefixes and typos inside names while ranking fully lexical matches first", async () => {
  const { context } = await actor();
  const data = await seedSearchData(db);
  expect(ids(await searchPrivateCollection(context, { q: "trig" }))).toEqual(
    [data.firstId, data.secondId].sort(),
  );
  expect(ids(await searchPrivateCollection(context, { q: "chronoo" }))).toEqual(
    [data.firstId, data.secondId].sort(),
  );
  const game = await db.game.create({
    data: { name: "Chronoo", slug: randomUUID() },
  });
  const release = await db.gameRelease.create({
    data: { gameId: game.id, platformId: data.platformId, slug: randomUUID() },
  });
  const copy = await db.collectionItem.create({
    data: {
      type: "GAME",
      ownedGame: { create: { gameReleaseId: release.id } },
    },
  });
  const hits = (await searchPrivateCollection(context, { q: "chronoo" })).items;
  expect(hits[0].id).toBe(copy.id);
  expect(hits).toHaveLength(3);
});
it("ranks an identity token ahead of an exact whole related-company name", async () => {
  const { context } = await actor();
  const data = await seedSearchData(db);
  const company = await db.company.create({
    data: { name: "Chrono", slug: randomUUID() },
  });
  await db.accessoryVariant.update({
    where: { id: data.variantId },
    data: { producerId: company.id },
  });
  const hits = (await searchPrivateCollection(context, { q: "chrono" })).items;
  expect(
    hits
      .slice(0, 2)
      .map((hit) => hit.id)
      .sort(),
  ).toEqual([data.firstId, data.secondId].sort());
  expect(hits[2].id).toBe(data.accessoryId);
  expect(hits[2].matchSources).toEqual(["Company"]);
});
it("normalizes case, repeated terms and composed/decomposed accents without removing accents", async () => {
  const { context } = await actor();
  const data = await seedSearchData(db);
  expect(
    ids(await searchPrivateCollection(context, { q: " CHRONO chrono  SNES " })),
  ).toEqual([data.firstId, data.secondId].sort());
  await db.game.update({
    where: { id: data.gameId },
    data: { name: "e\u0301clair" },
  });
  expect(ids(await searchPrivateCollection(context, { q: "éclair" }))).toEqual(
    [data.firstId, data.secondId].sort(),
  );
});
it("preserves archived owned identities, refreshes after canonical edits and re-identification", async () => {
  const { context } = await actor();
  const data = await seedSearchData(db);
  await db.game.update({
    where: { id: data.gameId },
    data: { name: "Renamed adventure", archivedAt: new Date() },
  });
  expect(
    (await searchPrivateCollection(context, { q: "chrono" })).items,
  ).toEqual([]);
  expect(ids(await searchPrivateCollection(context, { q: "renamed" }))).toEqual(
    [data.firstId, data.secondId].sort(),
  );
  await db.ownedGame.update({
    where: { collectionItemId: data.firstId },
    data: {
      gameReleaseId: (
        await db.gameRelease.create({
          data: {
            gameId: data.gameId,
            platformId: data.platformId,
            editionName: "Deluxe",
            slug: randomUUID(),
          },
        })
      ).id,
    },
  });
  expect(ids(await searchPrivateCollection(context, { q: "deluxe" }))).toEqual([
    data.firstId,
  ]);
});
it("never uses unowned canonical rows as collection results", async () => {
  const { context } = await actor();
  await seedSearchData(db);
  await db.game.create({
    data: { name: "Unowned rarity", slug: randomUUID() },
  });
  expect(
    (await searchPrivateCollection(context, { q: "rarity" })).items,
  ).toEqual([]);
});
it("handles incomplete catalog rows and unknown relationships without losing the copy", async () => {
  const { context } = await actor();
  const data = await seedSearchData(db);
  await db.consoleModel.update({
    where: { id: data.modelId },
    data: { manufacturerId: null, identificationStatus: "INCOMPLETE" },
  });
  expect(
    (await searchPrivateCollection(context, { q: "SNS-001" })).items[0],
  ).toMatchObject({ id: data.consoleId, identificationStatus: "INCOMPLETE" });
  expect(
    (await searchPrivateCollection(context, { q: "sharp" })).items,
  ).toEqual([]);
});
it("paginates only after complete matching/deduplication with deterministic ties", async () => {
  const { context } = await actor();
  const data = await seedSearchData(db);
  const all = await searchPrivateCollection(context, { q: "chrono" });
  const a = await searchPrivateCollection(context, { q: "chrono", limit: 1 });
  const b = await searchPrivateCollection(context, {
    q: "chrono",
    limit: 1,
    offset: 1,
  });
  expect(a.items[0].id).toBe(all.items[0].id);
  expect(a.hasMore).toBe(true);
  expect(b.items[0].id).toBe(all.items[1].id);
  expect(b.hasMore).toBe(false);
  expect(
    (await searchPrivateCollection(context, { q: "chrono", offset: 50 })).items,
  ).toEqual([]);
  expect(new Set([a.items[0].id, b.items[0].id])).toEqual(
    new Set([data.firstId, data.secondId]),
  );
});
it.each([
  { q: "a".repeat(161) },
  { q: "one two three four five six seven eight nine" },
  { q: "chrono", audience: "public" },
  { q: "chrono", includePrivate: true },
  { q: "chrono", offset: 5001 },
  { q: "chrono", limit: 51 },
])("rejects invalid or privileged input %j", async (input) => {
  const { context } = await actor();
  await expect(searchPrivateCollection(context, input)).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
});
it("rejects over-sixteen parsed lexemes, and treats short/blank searches as idle", async () => {
  const { context } = await actor();
  await expect(
    searchPrivateCollection(context, {
      q: Array.from({ length: 18 }, (_, i) => `word${i}`).join("-"),
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  for (const q of ["", " ", "x"])
    expect(await searchPrivateCollection(context, { q })).toMatchObject({
      state: "idle",
      items: [],
      hasMore: false,
    });
});
it("revalidates a changed grant/session even for idle requests", async () => {
  const { context, grant, session } = await actor();
  await db.accessGrant.update({
    where: { id: grant.id },
    data: { enabled: false },
  });
  await expect(
    searchPrivateCollection(context, { q: "" }),
  ).rejects.toBeDefined();
  await db.accessGrant.update({
    where: { id: grant.id },
    data: { enabled: true },
  });
  await db.session.delete({ where: { id: session.id } });
  await expect(
    searchPrivateCollection(context, { q: "chrono" }),
  ).rejects.toBeDefined();
});
it("serves authenticated POSTs with no-store headers and does not accept wrong origin or malformed bodies", async () => {
  const { headers } = await actor();
  const data = await seedSearchData(db);
  const send = (body: string, h: Headers = headers) =>
    privateSearchRequest(
      new Request("http://localhost:3002/api/search/private", {
        method: "POST",
        headers: h,
        body,
      }),
    );
  const response = await send(JSON.stringify({ q: "00-ABC-123" }));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
  expect(ids(await response.json())).toEqual([data.firstId]);
  const foreign = new Headers(headers);
  foreign.set("origin", "https://outside.example");
  expect((await send('{"q":"chrono"}', foreign)).status).toBe(403);
  expect((await send("bad")).status).toBe(400);
  expect((await send(" ".repeat(4097))).status).toBe(413);
  expect(
    (
      await send(
        '{"q":"chrono"}',
        new Headers({
          "content-type": "application/json",
          origin: "http://localhost:3002",
        }),
      )
    ).status,
  ).toBe(401);
});
it("checks the separate public query contract against current policy without exposing a public endpoint", async () => {
  const { user } = await actor("ADMIN");
  const data = await seedSearchData(db);
  const run = (q: string) =>
    withTransaction(async (tx) => {
      await configureSearch(tx);
      const terms = await parseSearchTerms(q, tx);
      return tx.$queryRaw<SearchRow[]>(
        publicSearchQuery({ q, limit: 20, offset: 0 }, terms),
      );
    });
  await db.collectionItem.update({
    where: { id: data.firstId },
    data: {
      publicationStatus: "PUBLISHED",
      publishedAt: new Date(),
      publishedById: user.id,
    },
  });
  expect(await run("chrono")).toEqual([]);
  await db.publicSettings.update({
    where: { id: 1 },
    data: { publicCollectionEnabled: true, showSerialNumbers: true },
  });
  expect((await run("chrono")).map((x) => x.id)).toEqual([data.firstId]);
  for (const q of ["00-ABC-123", "ownersecret", "cracked", "repairsecret"])
    expect(await run(q)).toEqual([]);
  const before = await run("chrono");
  await db.collectionItem.update({
    where: { id: data.firstId },
    data: {
      notes: "chrono repeated chrono ownersecret",
      serialNumber: "chrono",
    },
  });
  expect(await run("chrono")).toEqual(before);
  await db.publicSettings.update({
    where: { id: 1 },
    data: { showNotes: true, showDefects: true },
  });
  expect((await run("ownersecret")).map((x) => x.id)).toEqual([data.firstId]);
  expect((await run("cracked")).map((x) => x.id)).toEqual([data.firstId]);
  expect(await run("repairsecret")).toEqual([]);
  await db.publicSettings.update({
    where: { id: 1 },
    data: { publicCollectionEnabled: false },
  });
  expect(await run("chrono")).toEqual([]);
});

it("matches escaped percent/underscore/backslash identifiers literally", async () => {
  const { context } = await actor();
  const data = await seedSearchData(db);
  await db.collectionItem.update({
    where: { id: data.firstId },
    data: { serialNumber: "50%_owner" },
  });
  await db.collectionItem.update({
    where: { id: data.secondId },
    data: { serialNumber: "50AXowner" },
  });
  expect(ids(await searchPrivateCollection(context, { q: "50%_" }))).toEqual([
    data.firstId,
  ]);
  await db.collectionItem.update({
    where: { id: data.firstId },
    data: { serialNumber: "00\\ABC" },
  });
  expect(ids(await searchPrivateCollection(context, { q: "00\\" }))).toEqual([
    data.firstId,
  ]);
});
it("redacts database failures and restores transaction-local settings", async () => {
  const { headers } = await actor();
  await seedSearchData(db);
  const spy = vi
    .spyOn(searchRepository, "searchPrivateRows")
    .mockRejectedValueOnce(new Error("database password and private text"));
  try {
    const response = await privateSearchRequest(
      new Request("http://localhost:3002/api/search/private", {
        method: "POST",
        headers,
        body: JSON.stringify({ q: "chrono" }),
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Search is unavailable right now. Please try again.",
    });
  } finally {
    spy.mockRestore();
  }
  const settings = await db.$queryRaw<
    { timeout: string }[]
  >`SELECT current_setting('statement_timeout') timeout`;
  expect(settings[0].timeout).not.toBe("2s");
});
it("measures complete search plans with representative owned graphs and index-backed canonical matches", async () => {
  const { context } = await actor();
  const data = await seedSearchData(db);
  await withTransaction(async (tx) => {
    await tx.$executeRaw`INSERT INTO game(id,name,slug) SELECT gen_random_uuid(),'Fixture item '||n,'search-probe-'||n FROM generate_series(1,3000)n`;
    await tx.$executeRaw`INSERT INTO game_release(id,"gameId","platformId",slug) SELECT id,id,${data.platformId}::uuid,slug FROM game WHERE slug LIKE 'search-probe-%'`;
    await tx.$executeRaw`INSERT INTO collection_item(id,type) SELECT id,'GAME'::"CollectionItemType" FROM game WHERE slug LIKE 'search-probe-%'`;
    await tx.$executeRaw`INSERT INTO owned_game("collectionItemId","gameReleaseId") SELECT id,id FROM game WHERE slug LIKE 'search-probe-%'`;
  });
  await db.$executeRaw`ANALYZE game`;
  await db.$executeRaw`ANALYZE game_release`;
  await db.$executeRaw`ANALYZE collection_item`;
  await db.$executeRaw`ANALYZE owned_game`;
  type Plan = { "Index Name"?: string; Plans?: Plan[] };
  const indexes = (node: Plan): string[] => [
    ...(node["Index Name"] ? [node["Index Name"]!] : []),
    ...(node.Plans ?? []).flatMap(indexes),
  ];
  for (const q of [
    "chrono",
    "chronoo",
    "chrono snes square",
    "fixture",
    "fi",
  ]) {
    const result = await searchPrivateCollection(context, { q });
    expect(result.state).toBe("ready");
    const filtered = await searchFilteredCollection(context, {
      q,
      controls: { type: "game", sort: "year-desc" },
      limit: 2,
      offset: 1,
    });
    const cards = await browsePrivateCollection(context, {
      q,
      controls: { type: "game", sort: "year-desc" },
    });
    expect(cards.items.every((item) => item.card !== undefined)).toBe(true);
    expect(filtered.state).toBe("ready");
    expect(filtered.items.length).toBeLessThanOrEqual(2);
    await withTransaction(async (tx) => {
      await configureSearch(tx);
      const terms = await parseSearchTerms(q, tx);
      const filteredPlans = await tx.$queryRaw<
        { "QUERY PLAN": { Plan: Plan }[] }[]
      >(
        Prisma.sql`EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) ${filteredPrivateSearchQuery({ q, limit: 20, offset: 0 }, terms, { type: "game", sort: "year-desc" })}`,
      );
      const reprocessedRows = (node: Plan): number => {
        const scan = node as Plan & {
          "CTE Name"?: string;
          "Actual Rows"?: number;
          "Actual Loops"?: number;
          "Rows Removed by Join Filter"?: number;
        };
        return Math.max(
          ["titles", "controls"].includes(scan["CTE Name"] ?? "")
            ? (scan["Actual Rows"] ?? 0) * (scan["Actual Loops"] ?? 0)
            : 0,
          (scan["Rows Removed by Join Filter"] ?? 0) *
            (scan["Actual Loops"] ?? 1),
          ...(node.Plans ?? []).map(reprocessedRows),
        );
      };
      expect(
        reprocessedRows(filteredPlans[0]["QUERY PLAN"][0].Plan),
      ).toBeLessThan(100_000);
    });
    const palette = await searchPrivatePalette(context, { q });
    expect(palette.collection).toEqual(result);
    expect(palette.catalog.length).toBeLessThanOrEqual(10);
    await withTransaction(async (tx) => {
      await configureSearch(tx);
      const terms = await parseSearchTerms(q, tx);
      const catalogPlan = await tx.$queryRaw<
        { "QUERY PLAN": { Plan: Plan }[] }[]
      >(
        Prisma.sql`EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) ${privateCatalogSearchQuery(q, terms)}`,
      );
      if (q === "chrono" || q === "chronoo")
        expect(
          indexes(catalogPlan[0]["QUERY PLAN"][0].Plan).some(
            (name) => name === "game_search_fts" || name === "game_search_trgm",
          ),
        ).toBe(true);
    });
    const plans = await withTransaction(async (tx) => {
      await configureSearch(tx);
      const terms = await parseSearchTerms(q, tx);
      return tx.$queryRaw<
        { "QUERY PLAN": { Plan: Plan; "Execution Time": number }[] }[]
      >(
        Prisma.sql`EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) ${privateSearchQuery({ q, limit: 20, offset: 0 }, terms)}`,
      );
    });
    const plan = plans[0]["QUERY PLAN"][0];
    const used = indexes(plan.Plan);
    if (q === "chrono" || q === "chronoo")
      expect(
        used.some(
          (name) => name === "game_search_fts" || name === "game_search_trgm",
        ),
      ).toBe(true);
    console.info(
      "Search plan",
      JSON.stringify({
        case:
          q === "fi"
            ? "short prefix"
            : q === "fixture"
              ? "common word"
              : q === "chrono snes square"
                ? "multi-source"
                : "selective",
        ownedCopies: 3004,
        executionMs: plan["Execution Time"],
        searchIndexes: [
          ...new Set(used.filter((name) => name.includes("search_"))),
        ],
      }),
    );
  }
}, 30000);

it.each([
  [{ type: "console" }, "console"],
  [{ type: "accessory" }, "accessory"],
  [{ platform: "snes" }, "all"],
  [{ model: "sns-001" }, "console"],
  [{ manufacturer: "sharp" }, "console"],
  [{ manufacturer: "nintendo" }, "none"],
  [{ producer: "hori" }, "accessory"],
  [{ producer: "nintendo" }, "accessory"],
  [{ publisher: "square" }, "games"],
  [{ publisher: "sega", region: "japan" }, "games"],
  [{ publisher: "sega", region: "north-america" }, "none"],
  [{ publisher: "square", region: "north-america" }, "games"],
  [{ region: "north-america" }, "games"],
  [{ year: "1995" }, "games"],
  [{ year: "1996", region: "north-america" }, "games"],
  [{ year: "1995", region: "north-america" }, "none"],
  [{ edition: "STANDARD" }, "games"],
  [{ hasBox: "unknown" }, "console"],
  [{ hasBox: "false" }, "second"],
  [{ hasBox: "true", type: "game" }, "first"],
  [{ hasDefects: "true" }, "first"],
  [{ hasDefects: "false", type: "game" }, "second"],
  [{ platform: "missing-platform" }, "none"],
])("filters owned graphs with %j", async (controls, expected) => {
  const { context } = await actor();
  const data = await seedFilterData(db);
  const result = await searchFilteredCollection(context, { q: "", controls });
  const expectIds =
    expected === "all"
      ? [data.firstId, data.secondId, data.consoleId, data.accessoryId]
      : expected === "games"
        ? [data.firstId, data.secondId]
        : expected === "console"
          ? [data.consoleId]
          : expected === "accessory"
            ? [data.accessoryId]
            : expected === "first"
              ? [data.firstId]
              : expected === "second"
                ? [data.secondId]
                : [];
  expect(ids(result)).toEqual(expectIds.sort());
});
it("filters locations through descendants without matching unassigned copies", async () => {
  const { context } = await actor();
  const data = await seedFilterData(db);
  expect(
    ids(
      await searchFilteredCollection(context, {
        q: "",
        controls: { location: data.rootId },
      }),
    ),
  ).toEqual([data.firstId, data.secondId, data.accessoryId].sort());
  expect(
    ids(
      await searchFilteredCollection(context, {
        q: "",
        controls: { location: data.shelfId },
      }),
    ),
  ).toEqual([data.firstId, data.accessoryId].sort());
  expect(
    ids(
      await searchFilteredCollection(context, {
        q: "",
        controls: { location: "unassigned" },
      }),
    ),
  ).toEqual([data.consoleId]);
  expect(
    ids(
      await searchFilteredCollection(context, {
        q: "",
        controls: { location: randomUUID() },
      }),
    ),
  ).toEqual([]);
});
it("keeps selected-market unknown years and model/variant years truthful", async () => {
  const { context } = await actor();
  const data = await seedFilterData(db);
  await db.gameReleaseRegion.update({
    where: {
      gameReleaseId_regionId: {
        gameReleaseId: data.releaseId,
        regionId: data.japanId,
      },
    },
    data: { releaseYear: null },
  });
  expect(
    ids(
      await searchFilteredCollection(context, {
        q: "",
        controls: { region: "japan", year: "unknown", type: "game" },
      }),
    ),
  ).toEqual([data.firstId, data.secondId].sort());
  expect(
    ids(
      await searchFilteredCollection(context, {
        q: "",
        controls: { region: "japan", year: "1994" },
      }),
    ),
  ).toEqual([]);
  expect(
    ids(
      await searchFilteredCollection(context, {
        q: "",
        controls: { year: "1996" },
      }),
    ),
  ).toEqual([data.firstId, data.secondId].sort());
  await db.gameReleaseRegion.updateMany({
    where: { gameReleaseId: data.releaseId },
    data: { releaseYear: null },
  });
  expect(
    ids(
      await searchFilteredCollection(context, {
        q: "",
        controls: { year: "1994" },
      }),
    ),
  ).toEqual([data.firstId, data.secondId].sort());
  await db.consoleModel.update({
    where: { id: data.modelId },
    data: { releaseYear: null },
  });
  await db.accessoryVariant.update({
    where: { id: data.variantId },
    data: { releaseYear: null },
  });
  expect(
    ids(
      await searchFilteredCollection(context, {
        q: "",
        controls: { year: "unknown" },
      }),
    ),
  ).toEqual([data.consoleId, data.accessoryId].sort());
});
it("sorts the complete eligible copies before bounded paging with nulls last and stable ties", async () => {
  const { context } = await actor();
  const d = await seedFilterData(db);
  const run = async (sort: string, extra = {}) =>
    await searchFilteredCollection(context, {
      q: "",
      controls: { sort },
      ...extra,
    });
  expect((await run("name-asc")).items.map((x) => x.id)).toEqual([
    ...[d.firstId, d.secondId].sort(),
    d.accessoryId,
    d.consoleId,
  ]);
  expect((await run("name-desc")).items.map((x) => x.id)).toEqual([
    d.consoleId,
    d.accessoryId,
    ...[d.firstId, d.secondId].sort(),
  ]);
  expect((await run("newest")).items.map((x) => x.id)).toEqual([
    d.accessoryId,
    d.secondId,
    d.firstId,
    d.consoleId,
  ]);
  expect((await run("oldest")).items.map((x) => x.id)).toEqual([
    d.consoleId,
    d.firstId,
    d.secondId,
    d.accessoryId,
  ]);
  expect((await run("year-asc")).items.map((x) => x.id)).toEqual([
    d.consoleId,
    ...[d.firstId, d.secondId].sort(),
    d.accessoryId,
  ]);
  expect((await run("year-desc")).items.map((x) => x.id)).toEqual([
    d.accessoryId,
    ...[d.firstId, d.secondId].sort(),
    d.consoleId,
  ]);
  const all = (await run("location")).items;
  expect(all.at(-1)?.id).toBe(d.consoleId);
  const limited = await run("newest", { limit: 1, offset: 1 });
  expect(limited.items[0].id).toBe(d.secondId);
  expect(limited.hasMore).toBe(true);
  expect((await run("newest", { offset: 5000 })).items).toEqual([]);
  const atari = await db.consolePlatform.create({
    data: { name: "Atari", slug: "atari" },
  });
  await db.accessoryVariantPlatform.create({
    data: { accessoryVariantId: d.variantId, platformId: atari.id },
  });
  const byPlatform = (await run("platform")).items;
  expect(byPlatform.map((x) => x.id)).toEqual([
    d.accessoryId,
    ...[d.firstId, d.secondId].sort(),
    d.consoleId,
  ]);
  expect(byPlatform[0].details?.platform).toBe("Atari, Super Nintendo");
  expect(
    (await run("publisher")).items
      .slice(0, 2)
      .map((x) => x.id)
      .sort(),
  ).toEqual([d.firstId, d.secondId].sort());
  await db.consoleModel.update({
    where: { id: d.modelId },
    data: { releaseYear: null },
  });
  expect((await run("year-asc")).items.at(-1)?.id).toBe(d.consoleId);
  expect((await run("year-desc")).items.at(-1)?.id).toBe(d.consoleId);
});
it("combines private text and structured controls without broadening empty or short queries", async () => {
  const { context } = await actor();
  const d = await seedFilterData(db);
  expect(
    ids(
      await searchFilteredCollection(context, {
        q: "chrono",
        controls: { hasBox: "true" },
      }),
    ),
  ).toEqual([d.firstId]);
  expect(
    ids(
      await searchFilteredCollection(context, {
        q: "00-ABC-123",
        controls: { hasBox: "false" },
      }),
    ),
  ).toEqual([]);
  for (const q of ["", "c", "%_"])
    expect(
      (await searchFilteredCollection(context, { q, controls: {} })).items,
    ).toEqual([]);
  expect(
    (
      await searchFilteredCollection(context, {
        q: "c",
        controls: { type: "game" },
      })
    ).state,
  ).toBe("idle");
  const result = await searchFilteredCollection(context, {
    q: "",
    controls: { sort: "newest" },
  });
  expect(result.items[0].details).toMatchObject({
    releaseYear: 1998,
    location: "Home / Shelf",
  });
  expect(result.items[0].matchSources).toEqual([]);
  expect(JSON.stringify(result)).not.toContain("repairsecret");
  expect(JSON.stringify(result)).not.toContain("00-ABC-123");
});
it("offers only owned-reachable filters, with private narrow labels and archived owned identities retained", async () => {
  const { context } = await actor();
  const d = await seedFilterData(db);
  await db.consolePlatform.create({
    data: { name: "Unowned", slug: "unowned" },
  });
  await db.consolePlatform.update({
    where: { id: d.platformId },
    data: { archivedAt: new Date() },
  });
  const options = await getCollectionFilterOptions(context);
  expect(options.platform).toEqual([
    { value: "snes", label: "Super Nintendo" },
  ]);
  expect(options.manufacturer).toEqual([{ value: "sharp", label: "Sharp" }]);
  expect(options.publisher.map((x) => x.value).sort()).toEqual([
    "sega",
    "square",
  ]);
  expect(options.location.map((x) => x.label).sort()).toEqual([
    "Home",
    "Home / Shelf",
  ]);
  expect(options.year.map((x) => x.value)).toEqual([
    "1990",
    "1995",
    "1996",
    "1998",
  ]);
  expect(JSON.stringify(options)).not.toContain("description");
});
it.each(["ADMIN", "EDITOR", "VIEWER"] as const)(
  "checks current %s filter access and strict private transport",
  async (role) => {
    const { context, headers, grant } = await actor(role);
    await seedFilterData(db);
    const send = (data: unknown, h = headers) =>
      privateFilteredRequest(
        new Request("http://localhost:3002/api/search/filtered", {
          method: "POST",
          headers: h,
          body: JSON.stringify(data),
        }),
      );
    const result = await send({ q: "", controls: { type: "game" } });
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    for (const controls of [
      { sort: "drop table" },
      { hasBox: true },
      { year: "0" },
      { location: "fake" },
      { rating: "4" },
      { type: "GAME" },
      { includePrivate: true },
    ])
      expect((await send({ q: "chrono", controls })).status).toBe(400);
    const outside = new Headers(headers);
    outside.set("origin", "https://elsewhere.example");
    expect(
      (await send({ q: "", controls: { type: "game" } }, outside)).status,
    ).toBe(403);
    await db.accessGrant.update({
      where: { id: grant.id },
      data: { enabled: false },
    });
    await expect(getCollectionFilterOptions(context)).rejects.toThrow();
    expect((await send({ q: "", controls: { type: "game" } })).status).toBe(
      403,
    );
  },
);

it("executes filter persistence with narrow columns and live hierarchical options", async () => {
  await actor();
  const d = await seedFilterData(db);
  await withTransaction(async (tx) => {
    const options = await searchRepository.listFilterOptions(tx);
    expect(options.some((x) => x.label === "Home / Shelf")).toBe(true);
    const rows = await searchRepository.searchFilteredRows(
      { q: "", limit: 20, offset: 0 },
      [],
      { sort: "relevance", type: "console" },
      tx,
    );
    expect(rows.map((x) => x.id)).toEqual([d.consoleId]);
    expect(Object.keys(rows[0]).sort()).toEqual(
      [
        "id",
        "type",
        "title",
        "context",
        "identificationStatus",
        "matchSources",
        "details",
      ].sort(),
    );
  });
});

it("browses collection roots without terms while preserving search idle and privacy behavior", async () => {
  const { context } = await actor();
  const d = await seedFilterData(db);
  const result = await browsePrivateCollection(context, {
    q: "",
    controls: {},
  });
  expect(result.state).toBe("ready");
  expect(ids(result)).toEqual(
    [d.firstId, d.secondId, d.consoleId, d.accessoryId].sort(),
  );
  expect(
    (await searchFilteredCollection(context, { q: "", controls: {} })).state,
  ).toBe("idle");
  for (const q of ["c", "%_"])
    expect(
      (await browsePrivateCollection(context, { q, controls: {} })).items,
    ).toEqual([]);
  expect(
    (
      await browsePrivateCollection(context, { q: "ownersecret", controls: {} })
    ).items.map((item) => item.id),
  ).toEqual([d.firstId]);
  const byId = new Map(result.items.map((item) => [item.id, item]));
  expect(byId.get(d.firstId)?.card).toMatchObject({
    hasBox: true,
    unresolvedDefects: 2,
    photo: null,
  });
  expect(byId.get(d.secondId)?.card).toMatchObject({
    hasBox: false,
    unresolvedDefects: 0,
  });
  expect(byId.get(d.consoleId)?.card?.hasBox).toBeNull();
  expect(byId.get(d.accessoryId)?.card?.producer).toBe("Hori, Nintendo");
  const encoded = JSON.stringify(result);
  for (const secret of [
    "ownersecret",
    "repairsecret",
    "00-ABC-123",
    "objectKey",
    "storageNamespace",
  ])
    expect(encoded).not.toContain(secret);
});
it("pages complete filtered copy sets with stable ties and honest final/empty pages", async () => {
  const { context } = await actor();
  await seedBrowseData(db);
  const pages = [];
  for (const offset of [0, 20, 40, 60])
    pages.push(
      await browsePrivateCollection(context, {
        q: "",
        controls: { type: "game", sort: "name-asc" },
        offset,
      }),
    );
  expect(pages.map((page) => page.items.length)).toEqual([20, 20, 5, 0]);
  expect(pages.map((page) => page.hasMore)).toEqual([true, true, false, false]);
  const found = pages.flatMap((page) => page.items.map((item) => item.id));
  expect(new Set(found).size).toBe(45);
  expect(found).toEqual([...found].sort());
  expect(pages[0].items.every((item) => item.type === "GAME")).toBe(true);
  expect(
    (
      await browsePrivateCollection(context, {
        q: "",
        controls: {},
        offset: 5000,
      })
    ).items,
  ).toEqual([]);
  await expect(
    browsePrivateCollection(context, { q: "", controls: {}, offset: 5001 }),
  ).rejects.toThrow();
});
it("chooses a private ready primary photo and its thumbnail without exposing storage or another copy's media", async () => {
  const { context } = await actor();
  const d = await seedFilterData(db);
  async function asset(
    deliveryClass: "DISPLAY" | "ORIGINAL" = "DISPLAY",
    thumbnail = false,
    state: "PENDING" | "READY" = "READY",
  ) {
    return db.asset.create({
      data: {
        kind: "IMAGE",
        scope: "COLLECTION",
        deliveryClass,
        state,
        mimeType: "image/webp",
        sizeBytes: 1,
        sha256: "a".repeat(64),
        width: 40,
        height: 80,
        storageNamespace: "fixture",
        objectKey: randomUUID(),
        originalFilename: "private-original-name",
        ...(thumbnail
          ? {
              transformMetadata: {
                schemaVersion: 1,
                data: { variant: "thumbnail" },
              },
            }
          : {}),
      },
    });
  }
  const earlier = await asset();
  const display = await asset("DISPLAY", false, "PENDING");
  const original = await asset("ORIGINAL");
  const thumbnail = await asset("DISPLAY", true, "PENDING");
  await db.assetDependency.createMany({
    data: [display, thumbnail].map((a) => ({
      derivedAssetId: a.id,
      sourceAssetId: original.id,
      purpose: "RESIZE" as const,
    })),
  });
  await db.asset.updateMany({
    where: { id: { in: [display.id, thumbnail.id] } },
    data: { state: "READY" },
  });
  await db.collectionItemMedia.createMany({
    data: [
      {
        collectionItemId: d.firstId,
        assetId: earlier.id,
        type: "FRONT",
        sortOrder: 0,
      },
      {
        collectionItemId: d.firstId,
        assetId: display.id,
        type: "BOX",
        isPrimary: true,
        sortOrder: 10,
        altText: "My boxed game",
      },
      {
        collectionItemId: d.firstId,
        assetId: earlier.id,
        type: "SERIAL",
        isPrimary: true,
        sortOrder: 0,
      },
      {
        collectionItemId: d.secondId,
        assetId: original.id,
        type: "PHOTO",
        isPrimary: true,
      },
    ],
  });
  const run = () =>
    browsePrivateCollection(context, { q: "", controls: { type: "game" } });
  const result = await run();
  expect(
    result.items.find((item) => item.id === d.firstId)?.card?.photo,
  ).toEqual({
    assetId: thumbnail.id,
    altText: "My boxed game",
    width: 40,
    height: 80,
  });
  expect(
    result.items.find((item) => item.id === d.secondId)?.card?.photo,
  ).toBeNull();
  for (const secret of [
    original.id,
    display.id,
    "private-original-name",
    "objectKey",
    "publicSafe",
  ])
    expect(JSON.stringify(result)).not.toContain(secret);
  await db.asset.update({
    where: { id: thumbnail.id },
    data: { state: "DELETING" },
  });
  expect(
    (await run()).items.find((item) => item.id === d.firstId)?.card?.photo
      ?.assetId,
  ).toBe(display.id);
  await db.collectionItemMedia.deleteMany({
    where: { collectionItemId: d.firstId, type: "BOX" },
  });
  await db.asset.update({
    where: { id: display.id },
    data: { state: "DELETING" },
  });
  expect(
    (await run()).items.find((item) => item.id === d.firstId)?.card?.photo
      ?.assetId,
  ).toBe(earlier.id);
});
it.each(["ADMIN", "EDITOR", "VIEWER"] as const)(
  "authorizes %s collection pages and rejects transport overrides or revoked access",
  async (role) => {
    const { headers, context, grant } = await actor(role);
    await seedFilterData(db);
    const send = (data: unknown, requestHeaders = headers) =>
      privateCollectionRequest(
        new Request("http://localhost:3002/api/collection/private", {
          method: "POST",
          headers: requestHeaders,
          body: JSON.stringify(data),
        }),
      );
    const result = await send({ q: "", controls: {}, offset: 1, limit: 1 });
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect((await result.json()).items).toHaveLength(1);
    for (const data of [
      { q: "", controls: {}, page: 2 },
      { q: "", controls: {}, includePrivate: true },
      { q: "", controls: {}, offset: -1 },
      { q: "", controls: {}, limit: 51 },
    ])
      expect((await send(data)).status).toBe(400);
    const anonymous = new Headers(headers);
    anonymous.delete("cookie");
    expect((await send({ q: "", controls: {} }, anonymous)).status).toBe(401);
    const outside = new Headers(headers);
    outside.set("origin", "https://elsewhere.invalid");
    expect((await send({ q: "", controls: {} }, outside)).status).toBe(403);
    await db.accessGrant.update({
      where: { id: grant.id },
      data: { enabled: false },
    });
    expect((await send({ q: "", controls: {} })).status).toBe(403);
    await expect(
      browsePrivateCollection(context, { q: "", controls: {} }),
    ).rejects.toThrow();
  },
);

it("bounds interactive query planning without JIT and keeps settings local to the transaction", async () => {
  await actor();
  await seedFilterData(db);
  const baseline = await db.$queryRaw<
    { jit: string }[]
  >`SELECT current_setting('jit') jit`;
  await withTransaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('jit_above_cost','0',true)`;
    await configureSearch(tx);
    const settings = await tx.$queryRaw<
      { jit: string; timeout: string }[]
    >`SELECT current_setting('jit') jit,current_setting('statement_timeout') timeout`;
    expect(settings[0]).toEqual({ jit: "off", timeout: "2s" });
    const plans = await tx.$queryRaw<{ "QUERY PLAN": { JIT?: unknown }[] }[]>(
      Prisma.sql`EXPLAIN(ANALYZE,FORMAT JSON) ${filteredPrivateSearchQuery({ q: "", limit: 1, offset: 1 }, [], { sort: "relevance" })}`,
    );
    expect(plans[0]["QUERY PLAN"][0].JIT).toBeUndefined();
  });
  const restored = await db.$queryRaw<
    { jit: string }[]
  >`SELECT current_setting('jit') jit`;
  expect(restored).toEqual(baseline);
});
