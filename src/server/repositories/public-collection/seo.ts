import "server-only";
import { Prisma } from "@/server/db/generated/client";
import type { TransactionClient } from "@/server/db/transaction";
// Metadata has its own canonical projection: personal disclosure flags cannot
// add serials, notes, locations, defects, accounts or condition to this query.
export function seoIdentity(
  id: string,
  type: "CONSOLE" | "GAME" | "ACCESSORY",
  tx: TransactionClient,
) {
  return tx.collectionItem.findFirst({
    where: { id, type, publicationStatus: "PUBLISHED" },
    select: {
      id: true,
      type: true,
      ownedConsole: {
        select: {
          consoleModel: {
            select: {
              name: true,
              description: true,
              platform: { select: { name: true, description: true } },
            },
          },
        },
      },
      ownedGame: {
        select: {
          gameRelease: {
            select: {
              editionName: true,
              printingLabel: true,
              descriptionOverride: true,
              platform: { select: { name: true } },
              game: { select: { name: true, description: true } },
            },
          },
        },
      },
      ownedAccessory: {
        select: {
          accessoryVariant: {
            select: {
              name: true,
              edition: true,
              color: true,
              descriptionOverride: true,
              accessory: { select: { name: true, description: true } },
            },
          },
        },
      },
    },
  });
}
export function sitemapBuckets(tx: TransactionClient) {
  return tx.$queryRaw<{ bucket: string }[]>(
    Prisma.sql`SELECT DISTINCT left(id::text,2) bucket FROM collection_item WHERE "publicationStatus"='PUBLISHED' ORDER BY bucket`,
  );
}
export const sitemapLimit = 50_000;
export function sitemapItems(bucket: string, tx: TransactionClient) {
  return tx.collectionItem.findMany({
    where: {
      publicationStatus: "PUBLISHED",
      id: {
        gte: `${bucket}000000-0000-0000-0000-000000000000`,
        lte: `${bucket}ffffff-ffff-ffff-ffff-ffffffffffff`,
      },
    },
    select: { id: true, type: true },
    orderBy: { id: "asc" },
    take: sitemapLimit + 1,
  });
}
