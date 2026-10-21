import "server-only";
import type { Prisma } from "@/server/db/generated/client";
import type { TransactionClient } from "@/server/db/transaction";
const identity = {
  id: true,
  name: true,
  slug: true,
  revision: true,
  archivedAt: true,
} as const;
export const familySelect = {
  ...identity,
  producer: { select: { name: true } },
  releaseYear: true,
} satisfies Prisma.AccessorySelect;
export const copyVariantSelect = {
  ...identity,
  accessoryId: true,
  accessory: { select: familySelect },
  producer: { select: { name: true } },
  releaseYear: true,
  modelNumber: true,
  color: true,
  edition: true,
  identificationStatus: true,
  regions: {
    select: { region: { select: { id: true, name: true } } },
    orderBy: { regionId: "asc" as const },
  },
  platforms: {
    select: {
      compatibilityNote: true,
      platform: { select: { id: true, name: true, archivedAt: true } },
    },
    orderBy: { platformId: "asc" as const },
  },
} satisfies Prisma.AccessoryVariantSelect;
export function families(query: string, page: number, tx: TransactionClient) {
  const literal = query.replace(/[\\%_]/g, "\\$&");
  return tx.accessory.findMany({
    where: {
      archivedAt: null,
      OR: [
        { name: { contains: literal, mode: "insensitive" } },
        { slug: { contains: literal, mode: "insensitive" } },
      ],
    },
    select: familySelect,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    skip: page * 25,
    take: 26,
  });
}
export function family(id: string, tx: TransactionClient) {
  return tx.accessory.findUnique({ where: { id }, select: familySelect });
}
export function variant(id: string, tx: TransactionClient) {
  return tx.accessoryVariant.findUnique({
    where: { id },
    select: copyVariantSelect,
  });
}
export function variants(
  accessoryId: string,
  query: string,
  page: number,
  tx: TransactionClient,
) {
  const literal = query.replace(/[\\%_]/g, "\\$&");
  return tx.accessoryVariant.findMany({
    where: {
      accessoryId,
      archivedAt: null,
      accessory: { archivedAt: null },
      OR: ["name", "slug", "modelNumber", "color", "edition"].map((key) => ({
        [key]: { contains: literal, mode: "insensitive" },
      })),
    },
    select: copyVariantSelect,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    skip: page * 25,
    take: 26,
  });
}
export function createdCopy(id: string, tx: TransactionClient) {
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
      ownedAccessory: { select: { accessoryVariantId: true } },
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
export async function insertCopy(
  data: Prisma.CollectionItemUncheckedCreateInput,
  tx: TransactionClient,
) {
  return tx.collectionItem.create({ data, select: { id: true } });
}
export function ownedCopy(id: string, tx: TransactionClient) {
  return tx.collectionItem.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      revision: true,
      publicationStatus: true,
      serialNumber: true,
      observedMarkings: true,
      hasBox: true,
      locationId: true,
      notes: true,
      ownedAccessory: {
        select: { accessoryVariant: { select: copyVariantSelect } },
      },
      defects: {
        select: {
          id: true,
          title: true,
          description: true,
          severity: true,
          status: true,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 20,
      },
      _count: { select: { defects: true } },
    },
  });
}
export function copyLocations(tx: TransactionClient) {
  return tx.location.findMany({
    select: { id: true, name: true, parentId: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
}
export function locationExists(id: string, tx: TransactionClient) {
  return tx.location.findUnique({ where: { id }, select: { id: true } });
}
export function mediaAssets(id: string, tx: TransactionClient) {
  return tx.collectionItemMedia.findMany({
    where: { collectionItemId: id },
    select: { assetId: true, publicDisplayAssetId: true },
  });
}
export async function updateCopy(
  id: string,
  fields: Prisma.CollectionItemUncheckedUpdateInput,
  variantId: string,
  tx: TransactionClient,
) {
  return tx.collectionItem.update({
    where: { id },
    data: {
      ...fields,
      ownedAccessory: { update: { accessoryVariantId: variantId } },
    },
    select: { id: true },
  });
}
export async function deleteCopy(id: string, tx: TransactionClient) {
  return tx.collectionItem.delete({ where: { id }, select: { id: true } });
}
const modelSelect = {
  id: true,
  isPrimary: true,
  asset: { select: { id: true, originalFilename: true } },
} as const;
export function models(id: string, page: number, tx: TransactionClient) {
  return tx.collectionItemMedia.findMany({
    where: {
      collectionItemId: id,
      type: "CUSTOM_MODEL",
      asset: { state: "READY", kind: "MODEL_3D" },
    },
    select: modelSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * 25,
    take: 26,
  });
}
export function primaryModel(id: string, tx: TransactionClient) {
  return tx.collectionItemMedia.findFirst({
    where: {
      collectionItemId: id,
      type: "CUSTOM_MODEL",
      isPrimary: true,
      asset: { state: "READY", kind: "MODEL_3D" },
    },
    select: modelSelect,
  });
}
export function findModel(id: string, useId: string, tx: TransactionClient) {
  return tx.collectionItemMedia.findFirst({
    where: {
      id: useId,
      collectionItemId: id,
      type: "CUSTOM_MODEL",
      asset: { state: "READY", kind: "MODEL_3D" },
    },
    select: modelSelect,
  });
}
const resetApproval = {
  publicApproved: false,
  publicDisplayAssetId: null,
  approvedAt: null,
  approvedById: null,
} as const;
export async function chooseModel(
  id: string,
  useId: string | null,
  tx: TransactionClient,
) {
  await tx.collectionItemMedia.updateMany({
    where: { collectionItemId: id, type: "CUSTOM_MODEL", isPrimary: true },
    data: { isPrimary: false, ...resetApproval },
  });
  if (useId)
    await tx.collectionItemMedia.update({
      where: { id: useId },
      data: { isPrimary: true, ...resetApproval },
    });
}
export function removeModel(useId: string, tx: TransactionClient) {
  return tx.collectionItemMedia.delete({
    where: { id: useId },
    select: { id: true },
  });
}
