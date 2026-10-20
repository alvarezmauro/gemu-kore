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
  packagingTemplateId: true,
  packagingTemplate: { select: templateSelect },
  packagingBindings: {
    select: {
      packagingTextureSlotId: true,
      assetId: true,
      transform: true,
      asset: { select: asset },
    },
    orderBy: { packagingTextureSlotId: "asc" as const },
    take: 7,
  },
} as const;
export function packagingRelease(id: string, tx: TransactionClient) {
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
export function packagingCopy(id: string, tx: TransactionClient) {
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
  return tx.packagingTemplate.findUnique({
    where: { id },
    select: templateSelect,
  });
}
export function templates(tx: TransactionClient) {
  return tx.packagingTemplate.findMany({
    select: templateSelect,
    orderBy: [{ familyKey: "asc" }, { revisionNumber: "desc" }],
    take: 51,
  });
}
export function selectedTemplates(ids: string[], tx: TransactionClient) {
  return tx.packagingTemplate.findMany({
    where: { id: { in: ids } },
    select: templateSelect,
    take: 100,
  });
}
export function createTemplate(
  data: Prisma.PackagingTemplateUncheckedCreateInput,
  tx: TransactionClient,
) {
  return tx.packagingTemplate.create({ data, select: templateSelect });
}
export function createSlots(
  data: Prisma.PackagingTextureSlotCreateManyInput[],
  tx: TransactionClient,
) {
  return tx.packagingTextureSlot.createMany({ data });
}
export function updateTemplate(
  id: string,
  data: Prisma.PackagingTemplateUncheckedUpdateInput,
  tx: TransactionClient,
) {
  return tx.packagingTemplate.update({
    where: { id },
    data: { ...data, revision: { increment: 1 } },
    select: templateSelect,
  });
}
export function assets(ids: string[], tx: TransactionClient) {
  return tx.asset.findMany({
    where: { id: { in: ids } },
    select: asset,
    take: 6,
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
  await tx.packagingTextureBinding.deleteMany({
    where: { includedItemId: id },
  });
  await tx.gameReleaseIncludedItem.update({
    where: { id },
    data: { packagingTemplateId: templateId, presentationApproved: false },
  });
  if (templateId && bindings.length)
    await tx.packagingTextureBinding.createMany({
      data: bindings.map((b) => ({
        includedItemId: id,
        packagingTemplateId: templateId,
        packagingTextureSlotId: b.slotId,
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
    where: { gameReleaseId: releaseId, packagingTemplateId: { not: null } },
    select: { id: true, kind: true },
    take: 100,
  });
}
