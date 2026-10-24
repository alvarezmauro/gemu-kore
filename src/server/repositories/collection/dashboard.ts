import "server-only";
import { Prisma, type CollectionItemType } from "@/server/db/generated/client";
import type { TransactionClient } from "@/server/db/transaction";
type CountRow = {
  total: bigint;
  consoles: bigint;
  games: bigint;
  accessories: bigint;
  boxed: bigint;
  activeDefects: bigint;
};
// All owned copies contribute, including retained archived catalog identities.
// The scalar defect aggregate runs once. Its FK guarantees every counted ID
// refers to a current collection item; DISTINCT prevents multi-defect inflation.
export function countsQuery() {
  return Prisma.sql`
    SELECT count(*) AS total,
      count(*) FILTER (WHERE type = 'CONSOLE') AS consoles,
      count(*) FILTER (WHERE type = 'GAME') AS games,
      count(*) FILTER (WHERE type = 'ACCESSORY') AS accessories,
      count(*) FILTER (WHERE "hasBox" IS TRUE) AS boxed,
      (SELECT count(DISTINCT "collectionItemId") FROM defect WHERE status = 'ACTIVE') AS "activeDefects"
    FROM collection_item`;
}
export async function counts(tx: TransactionClient) {
  const rows = await tx.$queryRaw<CountRow[]>(countsQuery());
  if (rows.length !== 1) throw new Error("Dashboard counts unavailable.");
  const row = rows[0];
  function count(value: bigint) {
    if (value < BigInt(0) || value > BigInt(Number.MAX_SAFE_INTEGER))
      throw new RangeError("Dashboard count exceeds supported precision.");
    return Number(value);
  }
  return {
    total: count(row.total),
    consoles: count(row.consoles),
    games: count(row.games),
    accessories: count(row.accessories),
    boxed: count(row.boxed),
    activeDefects: count(row.activeDefects),
  };
}
type RecentRow = {
  id: string;
  type: CollectionItemType;
  createdAt: Date;
  consolePlatform: string | null;
  consoleModel: string | null;
  game: string | null;
  gamePlatform: string | null;
  editionName: string | null;
  accessory: string | null;
  variant: string | null;
};
// Materialize only the nine-row page before hydrating canonical display names.
// The existing (createdAt,id) B-tree supports the reverse newest-first read.
export function recentQuery() {
  return Prisma.sql`
    WITH recent AS MATERIALIZED (
      SELECT id, type, "createdAt" FROM collection_item
      ORDER BY "createdAt" DESC, id DESC LIMIT 9
    )
    SELECT r.id, r.type, r."createdAt",
      console.platform AS "consolePlatform", console.model AS "consoleModel",
      game.title AS game, game.platform AS "gamePlatform", game."editionName",
      accessory.family AS accessory, accessory.variant
    FROM recent r
    LEFT JOIN LATERAL (
      SELECT cp.name platform, cm.name model FROM owned_console oc
      JOIN console_model cm ON cm.id = oc."consoleModelId"
      JOIN console_platform cp ON cp.id = cm."platformId"
      WHERE r.type = 'CONSOLE' AND oc."collectionItemId" = r.id LIMIT 1
    ) console ON true
    LEFT JOIN LATERAL (
      SELECT g.name title, gp.name platform, gr."editionName" FROM owned_game og
      JOIN game_release gr ON gr.id = og."gameReleaseId"
      JOIN game g ON g.id = gr."gameId"
      JOIN console_platform gp ON gp.id = gr."platformId"
      WHERE r.type = 'GAME' AND og."collectionItemId" = r.id LIMIT 1
    ) game ON true
    LEFT JOIN LATERAL (
      SELECT a.name family, av.name variant FROM owned_accessory oa
      JOIN accessory_variant av ON av.id = oa."accessoryVariantId"
      JOIN accessory a ON a.id = av."accessoryId"
      WHERE r.type = 'ACCESSORY' AND oa."collectionItemId" = r.id LIMIT 1
    ) accessory ON true
    ORDER BY r."createdAt" DESC, r.id DESC`;
}
export function recent(tx: TransactionClient) {
  return tx.$queryRaw<RecentRow[]>(recentQuery());
}
