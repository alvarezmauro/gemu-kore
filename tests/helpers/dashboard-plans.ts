import type { PrismaClient } from "../../src/server/db/generated/client";
import { Prisma } from "../../src/server/db/generated/client";
import type { TransactionClient } from "../../src/server/db/transaction";
// SQL equivalents of the six Task 17.1 Prisma count calls, for comparison only.
export const baselineCountsQueries = [
  Prisma.sql`SELECT count(*) FROM collection_item`,
  Prisma.sql`SELECT count(*) FROM collection_item WHERE type='CONSOLE'`,
  Prisma.sql`SELECT count(*) FROM collection_item WHERE type='GAME'`,
  Prisma.sql`SELECT count(*) FROM collection_item WHERE type='ACCESSORY'`,
  Prisma.sql`SELECT count(*) FROM collection_item WHERE "hasBox" IS TRUE`,
  Prisma.sql`SELECT count(*) FROM collection_item c WHERE EXISTS (SELECT 1 FROM defect d WHERE d."collectionItemId"=c.id AND d.status='ACTIVE')`,
];
export async function seedDashboardScale(
  db: PrismaClient,
  ids: { modelId: string; releaseId: string; variantId: string },
) {
  if (!process.env.DATABASE_URL?.includes("/gemukore_test?schema=public"))
    throw new Error("Scale fixtures require the disposable database.");
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`CREATE TEMP TABLE dashboard_probe ON COMMIT DROP AS SELECT gen_random_uuid() id, n FROM generate_series(1,6000) n`;
    await tx.$executeRaw`INSERT INTO collection_item(id,type,"hasBox",notes,"createdAt")
      SELECT id, (CASE n%3 WHEN 0 THEN 'CONSOLE' WHEN 1 THEN 'GAME' ELSE 'ACCESSORY' END)::"CollectionItemType",
        CASE n%4 WHEN 0 THEN true WHEN 1 THEN false ELSE NULL END,
        repeat('Private fixture notes. ',16), '2026-10-21 01:00:00+00'::timestamptz+n*interval '1 second' FROM dashboard_probe`;
    await tx.$executeRaw`INSERT INTO owned_console("collectionItemId","consoleModelId") SELECT id,${ids.modelId}::uuid FROM dashboard_probe WHERE n%3=0`;
    await tx.$executeRaw`INSERT INTO owned_game("collectionItemId","gameReleaseId") SELECT id,${ids.releaseId}::uuid FROM dashboard_probe WHERE n%3=1`;
    await tx.$executeRaw`INSERT INTO owned_accessory("collectionItemId","accessoryVariantId") SELECT id,${ids.variantId}::uuid FROM dashboard_probe WHERE n%3=2`;
    await tx.$executeRaw`INSERT INTO defect("collectionItemId",title,severity,status)
      SELECT p.id,'Synthetic active defect','MINOR','ACTIVE' FROM dashboard_probe p CROSS JOIN generate_series(1,2) d WHERE p.n%10=0`;
    await tx.$executeRaw`INSERT INTO defect("collectionItemId",title,severity,status,"resolvedAt")
      SELECT id,'Synthetic historical defect','MINOR',CASE n%10 WHEN 1 THEN 'ACCEPTED'::"DefectStatus" ELSE 'REPAIRED'::"DefectStatus" END,
        CASE WHEN n%10=2 THEN now() ELSE NULL END FROM dashboard_probe WHERE n%10 IN (1,2)`;
  });
  // Metadata-only media graph for query plans; no files are delivered here.
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`CREATE TEMP TABLE dashboard_media_probe ON COMMIT DROP AS
      SELECT id, gen_random_uuid() original, gen_random_uuid() display, gen_random_uuid() thumbnail
      FROM collection_item WHERE "createdAt">='2026-10-21 01:00:00+00' AND
        (extract(epoch FROM "createdAt")::int%10=0 OR "createdAt">'2026-10-21 02:39:52+00')`;
    await tx.$executeRaw`INSERT INTO asset(id,kind,scope,state,"deliveryClass","storageNamespace","objectKey","mimeType","sizeBytes",sha256,width,height)
      SELECT original,'IMAGE','COLLECTION','READY','ORIGINAL','fixture',original::text,'image/webp',100,repeat('a',64),640,480 FROM dashboard_media_probe`;
    await tx.$executeRaw`INSERT INTO asset(id,kind,scope,state,"deliveryClass","storageNamespace","objectKey","mimeType","sizeBytes",sha256,width,height,"transformMetadata")
      SELECT display,'IMAGE'::"AssetKind",'COLLECTION'::"AssetScope",'PENDING'::"AssetState",'DISPLAY'::"AssetDeliveryClass",'fixture',display::text,'image/webp',100,repeat('a',64),640,480,NULL FROM dashboard_media_probe
      UNION ALL SELECT thumbnail,'IMAGE','COLLECTION','PENDING','DISPLAY','fixture',thumbnail::text,'image/webp',100,repeat('a',64),80,60,'{"schemaVersion":1,"data":{"variant":"thumbnail"}}'::jsonb FROM dashboard_media_probe`;
    await tx.$executeRaw`INSERT INTO asset_dependency("derivedAssetId","sourceAssetId",purpose)
      SELECT display,original,'RESIZE'::"AssetDependencyPurpose" FROM dashboard_media_probe UNION ALL SELECT thumbnail,original,'RESIZE' FROM dashboard_media_probe`;
    await tx.$executeRaw`UPDATE asset SET state='READY' WHERE state='PENDING'`;
    await tx.$executeRaw`INSERT INTO collection_item_media("collectionItemId","assetId",type,"isPrimary")
      SELECT id,display,'PHOTO',true FROM dashboard_media_probe`;
  });
  for (const table of [
    "collection_item",
    "owned_console",
    "owned_game",
    "owned_accessory",
    "defect",
    "asset",
    "asset_dependency",
    "collection_item_media",
  ])
    await db.$executeRaw(Prisma.sql`ANALYZE ${Prisma.raw(table)}`);
}
export type PlanNode = {
  "Node Type": string;
  "Relation Name"?: string;
  "Index Name"?: string;
  "Actual Rows": number;
  "Actual Loops": number;
  "Shared Hit Blocks"?: number;
  "Shared Read Blocks"?: number;
  "Scan Direction"?: string;
  "Subplan Name"?: string;
  Plans?: PlanNode[];
};
export type QueryPlan = {
  Plan: PlanNode;
  "Planning Time": number;
  "Execution Time": number;
};
export function nodes(plan: PlanNode): PlanNode[] {
  return [plan, ...(plan.Plans ?? []).flatMap(nodes)];
}
export async function explain(tx: TransactionClient, query: Prisma.Sql) {
  const rows = await tx.$queryRaw<{ "QUERY PLAN": QueryPlan[] }[]>(
    Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`,
  );
  return rows[0]["QUERY PLAN"][0];
}
export function metrics(plan: QueryPlan) {
  return {
    executionMs: plan["Execution Time"],
    planningMs: plan["Planning Time"],
    sharedBlocks:
      (plan.Plan["Shared Hit Blocks"] ?? 0) +
      (plan.Plan["Shared Read Blocks"] ?? 0),
    rows: plan.Plan["Actual Rows"],
    indexes: [
      ...new Set(
        nodes(plan.Plan).flatMap((n) =>
          n["Index Name"] ? [n["Index Name"]!] : [],
        ),
      ),
    ],
  };
}
