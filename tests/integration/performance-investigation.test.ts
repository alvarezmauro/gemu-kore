import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { PrismaClient, Prisma } from "@/server/db/generated/client";
import { requirePrivateAccess } from "@/server/auth/access";
import { withTransaction } from "@/server/db/transaction";
import { getMediaManagement } from "@/server/services/collection/media";
import { getDashboard } from "@/server/services/collection/dashboard";
import { browsePrivateCollection } from "@/server/services/search/filtered";
import { getPublicConsole } from "@/server/services/public-collection";
import {
  configureSearch,
  parseSearchTerms,
} from "@/server/repositories/search";
import {
  privateSearchQuery,
  filteredPrivateSearchQuery,
} from "@/server/repositories/search/query";
import { resetSearchData, seedSearchData } from "../helpers/search-data";
import { signedSessionCookie } from "../helpers/access-session";
import { metrics, nodes, type QueryPlan } from "../helpers/dashboard-plans";

// Only this disposable diagnostic client emits SQL events. Production logging,
// query deadlines, caching and schema are not modified by the probe.
const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    statement_timeout: 10000,
  }),
  log: [{ emit: "event", level: "query" }],
});
const shared = globalThis as typeof globalThis & {
  gemukorePrisma?: PrismaClient;
};
const previous = shared.gemukorePrisma;
let events: { hash: string; durationMs: number; verb: string }[] = [];
db.$on("query", (event) => {
  events.push({
    hash: createHash("sha256").update(event.query).digest("hex").slice(0, 12),
    durationMs: event.duration,
    verb: event.query.trim().split(/\s/)[0],
  });
});
const report: Record<string, unknown> = {
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  includesUncommittedChanges: Boolean(
    execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
  ),
  recordedAt: new Date().toISOString(),
  node: process.version,
  note: "Synthetic disposable PostgreSQL; instrumented single-client local observations, not production SLOs. No SQL parameters or credentials retained.",
};
beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("/gemukore_test?schema=public"))
    throw new Error("Disposable database required");
  shared.gemukorePrisma = db;
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3002");
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "performance-investigation-test-secret-long-enough",
  );
  vi.stubEnv("GOOGLE_CLIENT_ID", "test");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test");
  await resetSearchData(db);
});
afterAll(async () => {
  await resetSearchData(db);
  await db.user.deleteMany({
    where: { email: { endsWith: "@performance.example" } },
  });
  await db.accessGrant.deleteMany({
    where: { email: { endsWith: "@performance.example" } },
  });
  await db.$disconnect();
  shared.gemukorePrisma = previous;
  vi.unstubAllEnvs();
});
async function actor() {
  const email = `${randomUUID()}@performance.example`;
  const user = await db.user.create({
    data: { name: "Synthetic diagnostic", email, emailVerified: true },
  });
  const token = randomUUID();
  await db.session.create({
    data: {
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  await db.accessGrant.create({
    data: { email, role: "VIEWER", enabled: true },
  });
  return requirePrivateAccess(
    new Headers({
      cookie: `gemukore.session_token=${signedSessionCookie(token, process.env.BETTER_AUTH_SECRET!)}`,
    }),
  );
}
async function sample<T>(read: () => Promise<T>) {
  events = [];
  const start = performance.now();
  const value = await read();
  const elapsedMs = performance.now() - start;
  const captured = [...events];
  expect(captured.length, "Actual SQL events must be captured").toBeGreaterThan(
    0,
  );
  const groups = new Map<
    string,
    { count: number; durationMs: number; verb: string }
  >();
  for (const event of captured) {
    const group = groups.get(event.hash) ?? {
      count: 0,
      durationMs: 0,
      verb: event.verb,
    };
    group.count++;
    group.durationMs += event.durationMs;
    groups.set(event.hash, group);
  }
  return {
    value,
    measurement: {
      elapsedMs,
      sqlEvents: captured.length,
      statements: [...groups].map(([hash, values]) => ({ hash, ...values })),
    },
  };
}
async function addPhoto(modelId: string) {
  const original = await db.asset.create({
    data: {
      kind: "IMAGE",
      scope: "CATALOG",
      state: "READY",
      deliveryClass: "ORIGINAL",
      storageNamespace: "fixture",
      objectKey: randomUUID(),
      rightsStatus: "APPROVED",
      mimeType: "image/png",
      sizeBytes: 100,
      sha256: "a".repeat(64),
      width: 80,
      height: 60,
    },
  });
  const display = await db.asset.create({
    data: {
      kind: "IMAGE",
      scope: "CATALOG",
      deliveryClass: "DISPLAY",
      storageNamespace: "fixture",
      objectKey: randomUUID(),
      publicSafe: true,
      reviewedAt: new Date(),
      rightsStatus: "APPROVED",
      mimeType: "image/png",
      sizeBytes: 100,
      sha256: "b".repeat(64),
      width: 80,
      height: 60,
    },
  });
  await db.assetDependency.create({
    data: {
      sourceAssetId: original.id,
      derivedAssetId: display.id,
      purpose: "RESIZE",
    },
  });
  await db.asset.update({
    where: { id: display.id },
    data: { state: "READY" },
  });
  await db.catalogAsset.create({
    data: {
      consoleModelId: modelId,
      assetId: display.id,
      publicDisplayAssetId: display.id,
      role: "GALLERY",
      publicApproved: true,
      approvedAt: new Date(),
    },
  });
}
it("records bounded private pages, public media query growth and real search plans without changing production budgets", async () => {
  const data = await seedSearchData(db),
    context = await actor();
  report.postgres = await db.$queryRaw`SELECT version() version`;
  await db.$transaction(async (tx) => {
    for (let index = 0; index < 30; index++)
      await tx.collectionItem.create({
        data: {
          type: "CONSOLE",
          ownedConsole: { create: { consoleModelId: data.modelId } },
        },
      });
  });
  const privateReads = [];
  for (const limit of [1, 20]) {
    const result = await sample(() =>
      browsePrivateCollection(context, {
        q: "",
        limit,
        controls: { sort: "newest" },
      }),
    );
    expect(result.value.items).toHaveLength(limit);
    privateReads.push({ limit, ...result.measurement });
  }
  const dashboard = await sample(() => getDashboard(context));
  expect(dashboard.value.recent).toHaveLength(8);
  const smallSelector = await sample(() =>
    getMediaManagement(context, data.consoleId),
  );
  expect(smallSelector.value.items).toHaveLength(25);
  expect(smallSelector.value.hasMoreCopies).toBe(true);
  report.smallCopySelector = {
    choices: smallSelector.value.items.length,
    serializedBytes: Buffer.byteLength(JSON.stringify(smallSelector.value)),
    ...smallSelector.measurement,
  };
  report.privateReads = privateReads;
  report.dashboard = dashboard.measurement;
  await db.publicSettings.update({
    where: { id: 1 },
    data: {
      publicCollectionEnabled: true,
      showPersonalPhotos: false,
      showLocations: false,
    },
  });
  await db.collectionItem.update({
    where: { id: data.consoleId },
    data: { publicationStatus: "PUBLISHED", publishedAt: new Date() },
  });
  const publicReads = [];
  let photos = 0;
  for (const target of [1, 12, 30]) {
    while (photos < target) {
      await addPhoto(data.modelId);
      photos++;
    }
    const result = await sample(() => getPublicConsole({ id: data.consoleId }));
    expect(result.value.gallery?.images).toHaveLength(Math.min(target, 24));
    publicReads.push({
      approvedPhotos: target,
      displayedPhotos: result.value.gallery?.images.length,
      ...result.measurement,
    });
  }
  expect(new Set(publicReads.map((read) => read.sqlEvents)).size).toBe(1);
  report.publicMedia = publicReads;
  await resetSearchData(db);
  const search = await seedSearchData(db);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`INSERT INTO game(id,name,slug) SELECT gen_random_uuid(),'Fixture item '||n,'search-probe-'||n FROM generate_series(1,3000)n`;
    await tx.$executeRaw`INSERT INTO game_release(id,"gameId","platformId",slug) SELECT id,id,${search.platformId}::uuid,slug FROM game WHERE slug LIKE 'search-probe-%'`;
    await tx.$executeRaw`INSERT INTO collection_item(id,type) SELECT id,'GAME'::"CollectionItemType" FROM game WHERE slug LIKE 'search-probe-%'`;
    await tx.$executeRaw`INSERT INTO owned_game("collectionItemId","gameReleaseId") SELECT id,id FROM game WHERE slug LIKE 'search-probe-%'`;
  });
  for (const table of ["game", "game_release", "collection_item", "owned_game"])
    await db.$executeRaw(Prisma.sql`ANALYZE ${Prisma.raw(table)}`);
  const largeSelector = await sample(() =>
    getMediaManagement(context, search.consoleId),
  );
  expect(largeSelector.value.items).toHaveLength(25);
  expect(largeSelector.value.selected?.id).toBe(search.consoleId);
  report.largeCopySelector = {
    choices: largeSelector.value.items.length,
    serializedBytes: Buffer.byteLength(JSON.stringify(largeSelector.value)),
    ...largeSelector.measurement,
  };
  const plans = [];
  for (const q of ["chrono", "fixture", "fi"])
    for (const filtered of [false, true]) {
      const run = (diagnostic: boolean) =>
        withTransaction(
          async (tx) => {
            await configureSearch(tx);
            // Separate diagnostic-only EXPLAIN allowance after a recorded 2s failure.
            if (diagnostic)
              await tx.$queryRaw`SELECT set_config('statement_timeout','15000',true)`;
            const terms = await parseSearchTerms(q, tx);
            const query = filtered
              ? filteredPrivateSearchQuery({ q, limit: 20, offset: 0 }, terms, {
                  type: "game",
                  sort: "year-desc",
                })
              : privateSearchQuery({ q, limit: 20, offset: 0 }, terms);
            const rows = await tx.$queryRaw<{ "QUERY PLAN": QueryPlan[] }[]>(
              Prisma.sql`EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) ${query}`,
            );
            return rows[0]["QUERY PLAN"][0];
          },
          { timeout: 20000 },
        );
      // Distinguish bare query work from EXPLAIN's instrumentation overhead.
      let queryBudget = "within-2s",
        queryRows = 0;
      const queryStarted = performance.now();
      try {
        queryRows = await withTransaction(async (tx) => {
          await configureSearch(tx);
          const terms = await parseSearchTerms(q, tx);
          const query = filtered
            ? filteredPrivateSearchQuery({ q, limit: 20, offset: 0 }, terms, {
                type: "game",
                sort: "year-desc",
              })
            : privateSearchQuery({ q, limit: 20, offset: 0 }, terms);
          return (await tx.$queryRaw<unknown[]>(query)).length;
        });
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !error.message.includes("statement timeout")
        )
          throw error;
        queryBudget = "statement-timeout-at-2s";
      }
      const queryElapsedMs = performance.now() - queryStarted;
      let productionBudget = "within-2s",
        plan: QueryPlan;
      try {
        plan = await run(false);
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !error.message.includes("statement timeout")
        )
          throw error;
        productionBudget = "statement-timeout-at-2s";
        plan = await run(true);
      }
      plans.push({
        query: q,
        filtered,
        explainBudget: productionBudget,
        queryBudget,
        queryRows,
        queryElapsedMs,
        ...metrics(plan),
        maxJoinFilterRemovals: Math.max(
          ...nodes(plan.Plan).map((node) => {
            const n = node as typeof node & {
              "Rows Removed by Join Filter"?: number;
            };
            return (n["Rows Removed by Join Filter"] ?? 0) * n["Actual Loops"];
          }),
        ),
        hotNodes: nodes(plan.Plan)
          .map((node) => ({
            type: node["Node Type"],
            relation: node["Relation Name"],
            cte: (node as typeof node & { "CTE Name"?: string })["CTE Name"],
            estimatedRows: (node as typeof node & { "Plan Rows": number })[
              "Plan Rows"
            ],
            rowsRemovedByJoinFilter: (
              node as typeof node & { "Rows Removed by Join Filter"?: number }
            )["Rows Removed by Join Filter"],
            rows: node["Actual Rows"],
            loops: node["Actual Loops"],
            totalMsAcrossLoops:
              (node as typeof node & { "Actual Total Time": number })[
                "Actual Total Time"
              ] * node["Actual Loops"],
          }))
          .sort((a, b) => b.totalMsAcrossLoops - a.totalMsAcrossLoops)
          .slice(0, 12),
      });
    }
  report.search = { ownedCopies: 3004, observations: plans };
  if (process.env.PERFORMANCE_INVESTIGATION_REPORT === "1")
    await writeFile(
      process.env.PERFORMANCE_REPORT_OUTPUT ??
        "docs/performance/APPLICATION_DATABASE_EVIDENCE.json",
      JSON.stringify(report, null, 2) + "\n",
    );
  console.info("Performance investigation recorded", {
    searchCases: plans.length,
    statementTimeouts: plans.filter(
      (plan) => plan.explainBudget !== "within-2s",
    ).length,
  });
}, 180000);
