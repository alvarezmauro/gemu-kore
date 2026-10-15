import "server-only";
import type { TransactionClient } from "@/server/db/transaction";
import type { Prisma } from "@/server/db/generated/client";

const images = {
  where: {
    isPrimary: true,
    asset: {
      state: "READY" as const,
      kind: "IMAGE" as const,
      deliveryClass: "DISPLAY" as const,
    },
  },
  select: { role: true, assetId: true },
  orderBy: { id: "asc" as const },
  take: 7,
};
const platformSelect = {
  id: true,
  name: true,
  revision: true,
  archivedAt: true,
  manufacturer: { select: { name: true } },
  generation: true,
  originalReleaseYear: true,
  assets: images,
} as const;
const modelSelect = {
  id: true,
  name: true,
  revision: true,
  platformId: true,
  archivedAt: true,
  modelNumber: true,
  releaseYear: true,
  description: true,
  identificationStatus: true,
  manufacturer: { select: { name: true } },
  regionLock: true,
  regions: {
    select: { region: { select: { name: true } } },
    orderBy: { regionId: "asc" as const },
  },
  assets: images,
} as const;
export function consolePlatform(id: string, tx: TransactionClient) {
  return tx.consolePlatform.findUnique({
    where: { id },
    select: platformSelect,
  });
}
export function consoleModel(id: string, tx: TransactionClient) {
  return tx.consoleModel.findUnique({ where: { id }, select: modelSelect });
}
export async function consolePlatforms(
  query: string,
  page: number,
  tx: TransactionClient,
) {
  // Literal, case-insensitive names, aliases and brands, with a bounded result.
  const ids = await tx.$queryRaw<{ id: string }[]>`
    SELECT p.id FROM console_platform p LEFT JOIN company c ON c.id = p."manufacturerId"
    WHERE p."archivedAt" IS NULL AND (
      strpos(lower(p.name), lower(${query})) > 0 OR
      EXISTS (SELECT 1 FROM unnest(p.aliases) a WHERE strpos(lower(a), lower(${query})) > 0) OR
      strpos(lower(coalesce(c.name, '')), lower(${query})) > 0
    ) ORDER BY p.name, p.id OFFSET ${page * 25} LIMIT 26`;
  return tx.consolePlatform.findMany({
    where: { id: { in: ids.map((row) => row.id) } },
    select: platformSelect,
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
}
export function consoleModels(
  platformId: string,
  query: string,
  page: number,
  tx: TransactionClient,
) {
  const literal = query.replace(/[\\%_]/g, "\\$&");
  return tx.consoleModel.findMany({
    where: {
      platformId,
      archivedAt: null,
      platform: { archivedAt: null },
      OR: [
        { name: { contains: literal, mode: "insensitive" } },
        { modelNumber: { contains: literal, mode: "insensitive" } },
      ],
    },
    select: modelSelect,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    skip: page * 25,
    take: 26,
  });
}
export function createdConsole(id: string, tx: TransactionClient) {
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
      ownedConsole: { select: { consoleModelId: true } },
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
export async function insertConsole(
  data: Prisma.CollectionItemUncheckedCreateInput,
  tx: TransactionClient,
) {
  return tx.collectionItem.create({
    data,
    select: { id: true },
  });
}
export function consoleLocationExists(id: string, tx: TransactionClient) {
  return tx.location.findUnique({ where: { id }, select: { id: true } });
}
export function findConsoleOverride(
  collectionItemId: string,
  useId: string,
  tx: TransactionClient,
) {
  return tx.collectionItemMedia.findUnique({
    where: { id: useId, collectionItemId },
    select: {
      id: true,
      type: true,
      isPrimary: true,
      publicApproved: true,
      asset: { select: { kind: true, state: true } },
    },
  });
}
export function primaryConsoleOverride(
  collectionItemId: string,
  type: "CUSTOM_LOGO" | "CUSTOM_MODEL",
  tx: TransactionClient,
) {
  return tx.collectionItemMedia.findFirst({
    where: { collectionItemId, type, isPrimary: true },
    select: { id: true },
  });
}
export function activateConsoleOverride(id: string, tx: TransactionClient) {
  return tx.collectionItemMedia.update({
    where: { id },
    data: { isPrimary: true },
    select: { id: true },
  });
}
