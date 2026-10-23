import "server-only";
import { getDatabase } from "../../db/client";
import type { TransactionClient } from "../../db/transaction";
import { Prisma } from "../../db/generated/client";
const identity = {
  id: true,
  type: true,
  ownedConsole: {
    select: {
      consoleModel: {
        select: { name: true, platform: { select: { name: true } } },
      },
    },
  },
  ownedGame: {
    select: {
      gameRelease: {
        select: {
          editionName: true,
          game: { select: { name: true } },
          platform: { select: { name: true } },
        },
      },
    },
  },
  ownedAccessory: {
    select: {
      accessoryVariant: {
        select: { name: true, accessory: { select: { name: true } } },
      },
    },
  },
} as const;
export async function listCollectionItemOptions(
  database: TransactionClient = getDatabase(),
  input: { query: string; page: number } = { query: "", page: 0 },
) {
  if (!input.query)
    return database.collectionItem.findMany({
      select: identity,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 26,
      skip: input.page * 25,
    });
  const pattern = `%${input.query.replace(/[\\%_]/g, "\\$&")}%`;
  // Search only displayed identity fields, including the copy UUID. Select the
  // bounded IDs before Prisma hydrates any subtype relationships.
  const ids = await database.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT c.id FROM collection_item c
    LEFT JOIN owned_console oc ON oc."collectionItemId"=c.id
    LEFT JOIN console_model cm ON cm.id=oc."consoleModelId"
    LEFT JOIN console_platform cp ON cp.id=cm."platformId"
    LEFT JOIN owned_game og ON og."collectionItemId"=c.id
    LEFT JOIN game_release gr ON gr.id=og."gameReleaseId"
    LEFT JOIN game g ON g.id=gr."gameId"
    LEFT JOIN console_platform gp ON gp.id=gr."platformId"
    LEFT JOIN owned_accessory oa ON oa."collectionItemId"=c.id
    LEFT JOIN accessory_variant av ON av.id=oa."accessoryVariantId"
    LEFT JOIN accessory a ON a.id=av."accessoryId"
    WHERE concat_ws(' · ',cp.name,cm.name,g.name,gp.name,gr."editionName",a.name,av.name,'Copy ' || c.id::text) ILIKE ${pattern} ESCAPE '\\'
    ORDER BY c."createdAt",c.id LIMIT 26 OFFSET ${input.page * 25}
  `);
  if (!ids.length) return [];
  return database.collectionItem.findMany({
    where: { id: { in: ids.map((row) => row.id) } },
    select: identity,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}
export function findCollectionItem(
  id: string,
  database: TransactionClient = getDatabase(),
) {
  return database.collectionItem.findUnique({
    where: { id },
    select: { ...identity, revision: true, publicationStatus: true },
  });
}
export async function lockCollectionItem(
  id: string,
  transaction: TransactionClient,
) {
  await transaction.$queryRaw`SELECT id FROM collection_item WHERE id = ${id}::uuid FOR UPDATE`;
}
export function advanceCollectionItem(
  id: string,
  revision: number,
  actorId: string,
  unpublish: boolean,
  transaction: TransactionClient,
) {
  return transaction.collectionItem.updateMany({
    where: { id, revision },
    data: {
      revision: { increment: 1 },
      updatedById: actorId,
      ...(unpublish
        ? {
            publicationStatus: "PRIVATE",
            publishedAt: null,
            publishedById: null,
          }
        : {}),
    },
  });
}
