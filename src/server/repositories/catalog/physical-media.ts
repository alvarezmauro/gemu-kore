import "server-only";
import type { Prisma } from "@/server/db/generated/client";
import type { TransactionClient } from "@/server/db/transaction";
import { assetSourceSelect } from "./provenance";
const asset = {
  id: true,
  state: true,
  scope: true,
  kind: true,
  deliveryClass: true,
  mimeType: true,
  sizeBytes: true,
  width: true,
  height: true,
  ...assetSourceSelect,
} as const;
export const templateSelect = {
  id: true,
  name: true,
  slug: true,
  familyKey: true,
  revisionNumber: true,
  revision: true,
  status: true,
  geometryType: true,
  type: true,
  baseModelAssetId: true,
  baseModelAsset: { select: asset },
  dimensions: true,
  materialSettings: true,
  cameraSettings: true,
  metadata: true,
  archivedAt: true,
  slots: {
    select: {
      id: true,
      name: true,
      required: true,
      materialName: true,
      target: true,
    },
    orderBy: { name: "asc" as const },
    take: 8,
  },
} as const;
const component = {
  id: true,
  name: true,
  kind: true,
  quantity: true,
  physicalMediaTemplateId: true,
  physicalMediaTemplate: { select: templateSelect },
  physicalMediaBindings: {
    select: {
      physicalMediaTextureSlotId: true,
      assetId: true,
      transform: true,
      asset: { select: asset },
    },
    orderBy: { physicalMediaTextureSlotId: "asc" as const },
    take: 7,
  },
} as const;
export function physicalMediaRelease(id: string, tx: TransactionClient) {
  return tx.gameRelease.findUnique({
    where: { id },
    select: {
      id: true,
      revision: true,
      slug: true,
      archivedAt: true,
      game: { select: { name: true, archivedAt: true } },
      platform: { select: { name: true, archivedAt: true } },
      includedItems: {
        select: component,
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        take: 100,
      },
    },
  });
}
export function physicalMediaCopy(id: string, tx: TransactionClient) {
  return tx.collectionItem.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      revision: true,
      ownedGame: { select: { gameReleaseId: true } },
    },
  });
}
export function template(id: string, tx: TransactionClient) {
  return tx.physicalMediaTemplate.findUnique({
    where: { id },
    select: templateSelect,
  });
}
export function templates(familyKey: "cartridge", tx: TransactionClient) {
  return tx.physicalMediaTemplate.findMany({
    where: { familyKey },
    select: templateSelect,
    orderBy: [{ familyKey: "asc" }, { revisionNumber: "desc" }],
    take: 51,
  });
}
export function selectedTemplates(ids: string[], tx: TransactionClient) {
  return tx.physicalMediaTemplate.findMany({
    where: { id: { in: ids } },
    select: templateSelect,
    take: 100,
  });
}
export function createTemplate(
  data: Prisma.PhysicalMediaTemplateUncheckedCreateInput,
  tx: TransactionClient,
) {
  return tx.physicalMediaTemplate.create({ data, select: templateSelect });
}
export function createSlots(
  data: Prisma.PhysicalMediaTextureSlotCreateManyInput[],
  tx: TransactionClient,
) {
  return tx.physicalMediaTextureSlot.createMany({ data });
}
export function updateTemplate(
  id: string,
  data: Prisma.PhysicalMediaTemplateUncheckedUpdateInput,
  tx: TransactionClient,
) {
  return tx.physicalMediaTemplate.update({
    where: { id },
    data: { ...data, revision: { increment: 1 } },
    select: templateSelect,
  });
}
export function assets(ids: string[], tx: TransactionClient) {
  return tx.asset.findMany({
    where: { id: { in: ids } },
    select: asset,
    take: 1,
  });
}
export function artworkChoices(releaseId: string, tx: TransactionClient) {
  return tx.catalogAsset.findMany({
    where: {
      OR: [
        { gameReleaseId: releaseId },
        { includedItem: { gameReleaseId: releaseId } },
      ],
      asset: {
        state: "READY",
        scope: "CATALOG",
        kind: "IMAGE",
        deliveryClass: "DISPLAY",
      },
    },
    select: { caption: true, asset: { select: asset } },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: 51,
  });
}
export async function replaceBindings(
  id: string,
  templateId: string | null,
  bindings: {
    slotId: string;
    assetId: string;
    transform: Prisma.InputJsonValue;
  }[],
  tx: TransactionClient,
) {
  await tx.physicalMediaTextureBinding.deleteMany({
    where: { includedItemId: id },
  });
  await tx.gameReleaseIncludedItem.update({
    where: { id },
    data: { physicalMediaTemplateId: templateId, presentationApproved: false },
  });
  if (templateId && bindings.length)
    await tx.physicalMediaTextureBinding.createMany({
      data: bindings.map((b) => ({
        includedItemId: id,
        physicalMediaTemplateId: templateId,
        physicalMediaTextureSlotId: b.slotId,
        assetId: b.assetId,
        transform: b.transform,
      })),
    });
}
export function bumpRelease(id: string, tx: TransactionClient) {
  return tx.gameRelease.update({
    where: { id },
    data: { revision: { increment: 1 } },
    select: { revision: true },
  });
}
export function protectedComponents(releaseId: string, tx: TransactionClient) {
  return tx.gameReleaseIncludedItem.findMany({
    where: { gameReleaseId: releaseId, physicalMediaTemplateId: { not: null } },
    select: { id: true, kind: true },
    take: 100,
  });
}

export function templateGeometryAsset(id: string, tx: TransactionClient) {
  return tx.asset.findUnique({
    where: { id },
    select: { ...asset, objectKey: true, storageNamespace: true, sha256: true },
  });
}
