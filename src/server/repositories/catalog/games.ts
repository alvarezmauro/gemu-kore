import "server-only";
import type { Prisma } from "@/server/db/generated/client";
import type { TransactionClient } from "@/server/db/transaction";
const identity = { id: true, name: true, archivedAt: true } as const;
const base = {
  id: true,
  slug: true,
  revision: true,
  archivedAt: true,
} as const;
const references = {
  select: {
    id: true,
    provider: true,
    providerObjectType: true,
    externalId: true,
    url: true,
  },
  orderBy: { id: "asc" as const },
};
export const gameSelect = {
  ...base,
  name: true,
  description: true,
  aliases: true,
  companies: {
    select: {
      companyId: true,
      creditLabel: true,
      company: { select: identity },
    },
    orderBy: [{ sortOrder: "asc" as const }, { companyId: "asc" as const }],
  },
  externalReferences: references,
} satisfies Prisma.GameSelect;
export const releaseSelect = {
  ...base,
  gameId: true,
  platformId: true,
  game: { select: { ...identity, slug: true } },
  platform: { select: identity },
  editionName: true,
  editionType: true,
  printingLabel: true,
  firstReleaseYear: true,
  languages: true,
  descriptionOverride: true,
  regionLock: true,
  regionLockNote: true,
  identificationStatus: true,
  regions: {
    select: {
      regionId: true,
      releaseYear: true,
      releaseMonth: true,
      releaseDay: true,
      region: { select: identity },
    },
    orderBy: { regionId: "asc" as const },
  },
  companies: {
    select: {
      companyId: true,
      role: true,
      regionId: true,
      creditLabel: true,
      company: { select: identity },
    },
    orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
  },
  includedItems: {
    select: {
      id: true,
      name: true,
      kind: true,
      description: true,
      quantity: true,
    },
    orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
  },
  externalReferences: references,
} satisfies Prisma.GameReleaseSelect;
export function findGameCatalog(
  kind: "game" | "release",
  id: string,
  tx: TransactionClient,
) {
  return kind === "game"
    ? tx.game.findUnique({ where: { id }, select: gameSelect })
    : tx.gameRelease.findUnique({ where: { id }, select: releaseSelect });
}
export async function listGameCatalog(
  kind: "game" | "release",
  page: number,
  archived: "active" | "archived" | "all",
  tx: TransactionClient,
) {
  const where =
    archived === "all"
      ? {}
      : { archivedAt: archived === "active" ? null : { not: null } };
  const paging = { where, skip: (page - 1) * 25, take: 26 };
  return kind === "game"
    ? tx.game.findMany({
        ...paging,
        select: { ...base, name: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      })
    : tx.gameRelease.findMany({
        ...paging,
        select: {
          ...base,
          editionName: true,
          editionType: true,
          game: { select: { name: true } },
          platform: { select: { name: true } },
        },
        orderBy: [{ game: { name: "asc" } }, { slug: "asc" }, { id: "asc" }],
      });
}
export function saveGame(
  data: Prisma.GameUncheckedCreateInput,
  id: string | undefined,
  tx: TransactionClient,
) {
  return id
    ? tx.game.update({
        where: { id },
        data: { ...data, revision: { increment: 1 } },
        select: { id: true, revision: true },
      })
    : tx.game.create({ data, select: { id: true, revision: true } });
}
export function saveRelease(
  data: Prisma.GameReleaseUncheckedCreateInput,
  id: string | undefined,
  tx: TransactionClient,
) {
  return id
    ? tx.gameRelease.update({
        where: { id },
        data: { ...data, revision: { increment: 1 } },
        select: { id: true, revision: true },
      })
    : tx.gameRelease.create({ data, select: { id: true, revision: true } });
}
export function archiveGameCatalog(
  kind: "game" | "release",
  id: string,
  archived: boolean,
  tx: TransactionClient,
) {
  const data = {
    archivedAt: archived ? new Date() : null,
    revision: { increment: 1 },
  };
  return kind === "game"
    ? tx.game.update({ where: { id }, data })
    : tx.gameRelease.update({ where: { id }, data });
}
export async function setDevelopers(
  id: string,
  developers: { companyId: string; creditLabel: string | null }[],
  tx: TransactionClient,
) {
  await tx.gameCompany.deleteMany({ where: { gameId: id } });
  await tx.gameCompany.createMany({
    data: developers.map((c, sortOrder) => ({
      ...c,
      gameId: id,
      role: "DEVELOPER",
      sortOrder,
    })),
  });
}
export async function setReleaseDetails(
  id: string,
  fields: {
    markets: {
      regionId: string;
      year: number | null;
      month: number | null;
      day: number | null;
    }[];
    credits: {
      companyId: string;
      role: "DEVELOPER" | "PORT_DEVELOPER" | "PUBLISHER" | "DISTRIBUTOR";
      regionId: string | null;
      creditLabel: string | null;
    }[];
    includedItems: {
      id?: string;
      name: string;
      kind: "PACKAGING" | "MEDIA" | "MANUAL" | "EXTRA";
      description: string | null;
      quantity: number;
    }[];
  },
  tx: TransactionClient,
) {
  // Remove credits before deleting a market referenced by their composite FK.
  await tx.gameReleaseCompany.deleteMany({ where: { gameReleaseId: id } });
  await tx.gameReleaseRegion.deleteMany({
    where: {
      gameReleaseId: id,
      regionId: { notIn: fields.markets.map((m) => m.regionId) },
    },
  });
  for (const m of fields.markets) {
    const data = {
      releaseYear: m.year,
      releaseMonth: m.month,
      releaseDay: m.day,
    };
    await tx.gameReleaseRegion.upsert({
      where: {
        gameReleaseId_regionId: { gameReleaseId: id, regionId: m.regionId },
      },
      create: { gameReleaseId: id, regionId: m.regionId, ...data },
      update: data,
    });
  }
  await tx.gameReleaseCompany.createMany({
    data: fields.credits.map((c, sortOrder) => ({
      ...c,
      gameReleaseId: id,
      sortOrder,
    })),
  });
  await tx.gameReleaseIncludedItem.deleteMany({
    where: {
      gameReleaseId: id,
      id: { notIn: fields.includedItems.flatMap((c) => (c.id ? [c.id] : [])) },
    },
  });
  for (const [sortOrder, c] of fields.includedItems.entries()) {
    const { id: componentId, ...data } = c;
    if (componentId)
      await tx.gameReleaseIncludedItem.update({
        where: { id: componentId, gameReleaseId: id },
        data: { ...data, sortOrder },
      });
    else
      await tx.gameReleaseIncludedItem.create({
        data: { ...data, gameReleaseId: id, sortOrder },
      });
  }
}
