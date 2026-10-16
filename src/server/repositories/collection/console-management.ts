import "server-only";
import type { Prisma } from "@/server/db/generated/client";
import type { TransactionClient } from "@/server/db/transaction";
import { platformSelect, modelSelect } from "./consoles";
const assetSelect = {
  id: true,
  kind: true,
  state: true,
  deliveryClass: true,
  width: true,
  height: true,
  originalFilename: true,
  mimeType: true,
  sizeBytes: true,
} as const;
const useSelect = {
  id: true,
  type: true,
  isPrimary: true,
  asset: {
    select: {
      ...assetSelect,
      inputs: {
        where: { purpose: "RESIZE" },
        select: { sourceAsset: { select: { originalFilename: true } } },
        orderBy: { sourceAssetId: "asc" },
        take: 1,
      },
    },
  },
} as const;
const overrideWhere = {
  type: {
    in: ["CUSTOM_LOGO", "CUSTOM_MODEL"] as ("CUSTOM_LOGO" | "CUSTOM_MODEL")[],
  },
  asset: { state: "READY" as const },
};
export function ownedConsole(id: string, tx: TransactionClient) {
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
      notes: true,
      locationId: true,
      ownedConsole: {
        select: {
          consoleModel: {
            select: {
              ...modelSelect,
              discontinuedYear: true,
              specifications: true,
              widthMm: true,
              heightMm: true,
              depthMm: true,
              weightGrams: true,
              platform: {
                select: { ...platformSelect, description: true, history: true },
              },
            },
          },
        },
      },
      defects: {
        select: {
          id: true,
          title: true,
          description: true,
          severity: true,
          status: true,
          repairNote: true,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 20,
      },
      _count: { select: { defects: true } },
    },
  });
}
export function consolePhotos(id: string, tx: TransactionClient) {
  return tx.collectionItemMedia.findMany({
    where: {
      collectionItemId: id,
      type: { notIn: ["CUSTOM_LOGO", "CUSTOM_MODEL"] },
      asset: { state: "READY", kind: "IMAGE", deliveryClass: "DISPLAY" },
    },
    select: { caption: true, altText: true, asset: { select: assetSelect } },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    take: 12,
  });
}
export function consoleCatalogGallery(
  modelId: string,
  platformId: string,
  tx: TransactionClient,
) {
  return tx.catalogAsset.findMany({
    where: {
      OR: [{ consoleModelId: modelId }, { consolePlatformId: platformId }],
      role: { in: ["COVER", "GALLERY", "PREVIEW", "SCREENSHOT"] },
      asset: { state: "READY", kind: "IMAGE", deliveryClass: "DISPLAY" },
    },
    select: { caption: true, altText: true, asset: { select: assetSelect } },
    orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { id: "asc" }],
    take: 12,
  });
}
export function consoleCatalogModel(
  modelId: string,
  platformId: string,
  tx: TransactionClient,
) {
  return tx.catalogAsset.findFirst({
    where: {
      OR: [{ consoleModelId: modelId }, { consolePlatformId: platformId }],
      isPrimary: true,
      role: "MODEL_3D",
      asset: { state: "READY", kind: "MODEL_3D" },
    },
    select: {
      id: true,
      consoleModelId: true,
      assetId: true,
      asset: { select: assetSelect },
    },
    orderBy: [
      { consoleModelId: { sort: "asc", nulls: "last" } },
      { id: "asc" },
    ],
  });
}
export function consoleOverrides(
  id: string,
  page: number,
  tx: TransactionClient,
) {
  return tx.collectionItemMedia.findMany({
    where: { collectionItemId: id, ...overrideWhere },
    select: useSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * 25,
    take: 26,
  });
}
export function consolePrimaryOverrides(id: string, tx: TransactionClient) {
  return tx.collectionItemMedia.findMany({
    where: { collectionItemId: id, ...overrideWhere, isPrimary: true },
    select: useSelect,
    orderBy: { id: "asc" },
    take: 2,
  });
}
export function findOverride(id: string, useId: string, tx: TransactionClient) {
  return tx.collectionItemMedia.findUnique({
    where: { id: useId, collectionItemId: id },
    select: useSelect,
  });
}
export async function updateConsole(
  id: string,
  fields: Prisma.CollectionItemUncheckedUpdateInput,
  modelId: string,
  tx: TransactionClient,
) {
  return tx.collectionItem.update({
    where: { id },
    data: { ...fields, ownedConsole: { update: { consoleModelId: modelId } } },
    select: { id: true },
  });
}
export async function deleteConsole(id: string, tx: TransactionClient) {
  return tx.collectionItem.delete({ where: { id }, select: { id: true } });
}
export function consoleMediaAssets(id: string, tx: TransactionClient) {
  return tx.collectionItemMedia.findMany({
    where: { collectionItemId: id },
    select: { assetId: true, publicDisplayAssetId: true },
  });
}
export async function setConsoleOverride(
  id: string,
  type: "CUSTOM_LOGO" | "CUSTOM_MODEL",
  useId: string | null,
  tx: TransactionClient,
) {
  const reset = {
    isPrimary: false,
    publicApproved: false,
    publicDisplayAssetId: null,
    approvedAt: null,
    approvedById: null,
  };
  await tx.collectionItemMedia.updateMany({
    where: { collectionItemId: id, type, isPrimary: true },
    data: reset,
  });
  if (useId)
    await tx.collectionItemMedia.update({
      where: { id: useId, collectionItemId: id },
      data: { ...reset, isPrimary: true },
    });
}
export function removeConsoleOverride(id: string, tx: TransactionClient) {
  return tx.collectionItemMedia.delete({ where: { id }, select: { id: true } });
}

export function consoleViewerIdentity(id: string, tx: TransactionClient) {
  return tx.collectionItem.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      revision: true,
      ownedConsole: {
        select: {
          consoleModel: {
            select: {
              id: true,
              name: true,
              platform: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
}
export async function consoleViewerPoster(
  id: string,
  modelId: string,
  platformId: string,
  tx: TransactionClient,
) {
  const asset = {
    state: "READY" as const,
    kind: "IMAGE" as const,
    deliveryClass: "DISPLAY" as const,
  };
  const select = {
    altText: true,
    asset: { select: { id: true, width: true, height: true } },
  };
  const own = await tx.collectionItemMedia.findFirst({
    where: { collectionItemId: id, type: { in: ["PHOTO", "FRONT"] }, asset },
    select,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  return (
    own ??
    tx.catalogAsset.findFirst({
      where: {
        OR: [{ consoleModelId: modelId }, { consolePlatformId: platformId }],
        role: { in: ["PREVIEW", "COVER"] },
        asset,
      },
      select,
      orderBy: [
        { consoleModelId: { sort: "asc", nulls: "last" } },
        { isPrimary: "desc" },
        { sortOrder: "asc" },
        { id: "asc" },
      ],
    })
  );
}
