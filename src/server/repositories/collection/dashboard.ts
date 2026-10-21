import "server-only";
import type { TransactionClient } from "@/server/db/transaction";
// Baseline counts for Task 17.1. Consolidation and measured query optimization
// belong to Task 17.2; never load collection rows to calculate these values.
export async function counts(tx: TransactionClient) {
  return {
    total: await tx.collectionItem.count(),
    consoles: await tx.collectionItem.count({ where: { type: "CONSOLE" } }),
    games: await tx.collectionItem.count({ where: { type: "GAME" } }),
    accessories: await tx.collectionItem.count({
      where: { type: "ACCESSORY" },
    }),
    boxed: await tx.collectionItem.count({ where: { hasBox: true } }),
    activeDefects: await tx.collectionItem.count({
      where: { defects: { some: { status: "ACTIVE" } } },
    }),
  };
}
export function recent(tx: TransactionClient) {
  return tx.collectionItem.findMany({
    select: {
      id: true,
      type: true,
      createdAt: true,
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
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 9,
  });
}
