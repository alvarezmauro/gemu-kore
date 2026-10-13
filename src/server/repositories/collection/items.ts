import "server-only";
import { getDatabase } from "../../db/client";
import type { TransactionClient } from "../../db/transaction";
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
export function listCollectionItemOptions(
  database: TransactionClient = getDatabase(),
) {
  return database.collectionItem.findMany({
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
