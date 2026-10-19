import "server-only";
import type { TransactionClient } from "@/server/db/transaction";
import type { Prisma, GameEditionType } from "@/server/db/generated/client";
export const gameSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  revision: true,
  archivedAt: true,
} satisfies Prisma.GameSelect;
export const releaseSelect = {
  id: true,
  revision: true,
  slug: true,
  archivedAt: true,
  gameId: true,
  platformId: true,
  editionType: true,
  editionName: true,
  printingLabel: true,
  languages: true,
  descriptionOverride: true,
  identificationStatus: true,
  regionLock: true,
  regionLockNote: true,
  regions: {
    select: {
      region: { select: { id: true, name: true } },
      releaseYear: true,
      releaseMonth: true,
      releaseDay: true,
    },
    orderBy: { regionId: "asc" as const },
  },
  includedItems: {
    select: { name: true, kind: true, quantity: true, description: true },
    orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
  },
} satisfies Prisma.GameReleaseSelect;
export function game(id: string, tx: TransactionClient) {
  return tx.game.findUnique({ where: { id }, select: gameSelect });
}
export async function games(
  query: string,
  page: number,
  tx: TransactionClient,
) {
  const ids = await tx.$queryRaw<
    { id: string }[]
  >`SELECT g.id FROM game g WHERE g."archivedAt" IS NULL AND (strpos(lower(g.name), lower(${query})) > 0 OR strpos(lower(g.slug), lower(${query})) > 0 OR EXISTS (SELECT 1 FROM unnest(g.aliases) a WHERE strpos(lower(a), lower(${query})) > 0)) ORDER BY g.name, g.id OFFSET ${page * 25} LIMIT 26`;
  return tx.game.findMany({
    where: { id: { in: ids.map((r) => r.id) } },
    select: gameSelect,
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
}
export function release(id: string, tx: TransactionClient) {
  return tx.gameRelease.findUnique({ where: { id }, select: releaseSelect });
}
export function releases(
  input: {
    query: string;
    page: number;
    platformId: string;
    gameId: string;
    marketId: string;
    editionType: GameEditionType | "";
  },
  tx: TransactionClient,
) {
  const literal = input.query.replace(/[\\%_]/g, "\\$&");
  return tx.gameRelease.findMany({
    where: {
      gameId: input.gameId,
      platformId: input.platformId,
      archivedAt: null,
      game: { archivedAt: null },
      platform: { archivedAt: null },
      ...(input.marketId
        ? { regions: { some: { regionId: input.marketId } } }
        : {}),
      ...(input.editionType ? { editionType: input.editionType } : {}),
      OR: [
        { slug: { contains: literal, mode: "insensitive" } },
        { editionName: { contains: literal, mode: "insensitive" } },
        { printingLabel: { contains: literal, mode: "insensitive" } },
      ],
    },
    select: releaseSelect,
    orderBy: [{ slug: "asc" }, { id: "asc" }],
    skip: input.page * 25,
    take: 26,
  });
}
export function releaseMarkets(
  platformId: string,
  gameId: string,
  tx: TransactionClient,
) {
  return tx.region.findMany({
    where: {
      gameReleases: {
        some: {
          gameRelease: {
            gameId,
            platformId,
            archivedAt: null,
            game: { archivedAt: null },
            platform: { archivedAt: null },
          },
        },
      },
    },
    select: { id: true, name: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 250,
  });
}
export function createdGame(id: string, tx: TransactionClient) {
  return tx.collectionItem.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      createdById: true,
      serialNumber: true,
      observedMarkings: true,
      hasBox: true,
      locationId: true,
      notes: true,
      ownedGame: { select: { gameReleaseId: true } },
      defects: {
        select: {
          title: true,
          description: true,
          severity: true,
          status: true,
        },
      },
    },
  });
}
export async function insertGame(
  data: Prisma.CollectionItemUncheckedCreateInput,
  tx: TransactionClient,
) {
  return tx.collectionItem.create({ data, select: { id: true } });
}
