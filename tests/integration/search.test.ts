import * as searchRepository from "@/server/repositories/search";
import { Prisma } from "@/server/db/generated/client";
import { privateSearchQuery } from "@/server/repositories/search/query";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { getDatabase, disconnectDatabase } from "@/server/db/client";
import { requirePrivateAccess } from "@/server/auth/access";
import { searchPrivateCollection } from "@/server/services/search";
import { privateSearchRequest } from "@/server/http/search";
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
import { resetSearchData, seedSearchData } from "../helpers/search-data";
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
