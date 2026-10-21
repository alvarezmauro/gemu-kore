import "server-only";
import type { Prisma } from "@/server/db/generated/client";
import type { TransactionClient } from "@/server/db/transaction";
import { trailerSelect } from "./trailers";
type AccessoryKind = "accessory" | "variant";
const identity = {
  id: true,
  name: true,
  slug: true,
  archivedAt: true,
} as const;
const common = {
  ...identity,
  revision: true,
  producerId: true,
  producer: { select: identity },
  releaseYear: true,
  ...trailerSelect,
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
export const accessorySelect = {
  ...common,
  description: true,
  specifications: true,
  externalReferences: references,
} satisfies Prisma.AccessorySelect;
export const variantSelect = {
  ...common,
  accessoryId: true,
  accessory: { select: accessorySelect },
  modelNumber: true,
  color: true,
  edition: true,
  descriptionOverride: true,
  specificationsOverride: true,
  regionLock: true,
  regionLockNote: true,
  identificationStatus: true,
  regions: {
    select: { regionId: true, region: { select: { ...identity, code: true } } },
    orderBy: { regionId: "asc" as const },
  },
  platforms: {
    select: {
      platformId: true,
      compatibilityNote: true,
      platform: { select: identity },
    },
    orderBy: { platformId: "asc" as const },
  },
  externalReferences: references,
} satisfies Prisma.AccessoryVariantSelect;
export function findAccessoryCatalog(
  kind: AccessoryKind,
  id: string,
  tx: TransactionClient,
) {
  return kind === "accessory"
    ? tx.accessory.findUnique({ where: { id }, select: accessorySelect })
    : tx.accessoryVariant.findUnique({ where: { id }, select: variantSelect });
}
export function listAccessoryCatalog(
  kind: AccessoryKind,
  page: number,
  archived: "active" | "archived" | "all",
  tx: TransactionClient,
): Promise<
  {
    id: string;
    name: string;
    slug: string;
    revision: number;
    archivedAt: Date | null;
    accessory?: { name: string };
  }[]
> {
  const args = {
    where:
      archived === "all"
        ? {}
        : { archivedAt: archived === "active" ? null : { not: null } },
    select: { ...identity, revision: true },
    orderBy: [{ name: "asc" as const }, { id: "asc" as const }],
    skip: (page - 1) * 25,
    take: 26,
  };
  return kind === "accessory"
    ? tx.accessory.findMany(args)
    : tx.accessoryVariant.findMany({
        ...args,
        select: { ...args.select, accessory: { select: { name: true } } },
      });
}
export function saveAccessory(
  data: Prisma.AccessoryUncheckedCreateInput,
  id: string | undefined,
  tx: TransactionClient,
) {
  return id
    ? tx.accessory.update({
        where: { id },
        data: { ...data, revision: { increment: 1 } },
        select: { id: true, revision: true },
      })
    : tx.accessory.create({ data, select: { id: true, revision: true } });
}
export function saveVariant(
  data: Prisma.AccessoryVariantUncheckedCreateInput,
  id: string | undefined,
  tx: TransactionClient,
) {
  return id
    ? tx.accessoryVariant.update({
        where: { id },
        data: { ...data, revision: { increment: 1 } },
        select: { id: true, revision: true },
      })
    : tx.accessoryVariant.create({
        data,
        select: { id: true, revision: true },
      });
}
export async function setVariantRelations(
  id: string,
  regionIds: string[],
  platforms: { platformId: string; compatibilityNote: string | null }[],
  tx: TransactionClient,
) {
  await tx.accessoryVariantRegion.deleteMany({
    where: { accessoryVariantId: id, regionId: { notIn: regionIds } },
  });
  await tx.accessoryVariantRegion.createMany({
    data: regionIds.map((regionId) => ({ accessoryVariantId: id, regionId })),
    skipDuplicates: true,
  });
  // These joins have no dependent rows or separate identity. Replace atomically
  // in one batch, keeping the same composite keys for retained platforms.
  await tx.accessoryVariantPlatform.deleteMany({
    where: { accessoryVariantId: id },
  });
  await tx.accessoryVariantPlatform.createMany({
    data: platforms.map((p) => ({ ...p, accessoryVariantId: id })),
  });
}
export function archiveAccessoryCatalog(
  kind: AccessoryKind,
  id: string,
  archived: boolean,
  tx: TransactionClient,
) {
  const data = {
    archivedAt: archived ? new Date() : null,
    revision: { increment: 1 },
  };
  return kind === "accessory"
    ? tx.accessory.update({ where: { id }, data })
    : tx.accessoryVariant.update({ where: { id }, data });
}
// Read-only union across active variants, never a writable family compatibility list.
export function familyPlatforms(id: string, tx: TransactionClient) {
  return tx.consolePlatform.findMany({
    where: {
      accessoryVariants: {
        some: { accessoryVariant: { accessoryId: id, archivedAt: null } },
      },
    },
    select: identity,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 31,
  });
}
export function accessoryLinks(
  kind: "platform" | "region",
  ids: string[],
  tx: TransactionClient,
): Promise<
  { id: string; name: string; archivedAt: Date | null; code?: string }[]
> {
  const where = { id: { in: ids } };
  return kind === "platform"
    ? tx.consolePlatform.findMany({
        where,
        select: { id: true, name: true, archivedAt: true },
      })
    : tx.region.findMany({
        where,
        select: { id: true, name: true, archivedAt: true, code: true },
      });
}
