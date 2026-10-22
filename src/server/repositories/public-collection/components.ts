import "server-only";
import type { TransactionClient } from "@/server/db/transaction";
const template = {
  id: true,
  revision: true,
  status: true,
  familyKey: true,
  geometryType: true,
  baseModelAssetId: true,
  dimensions: true,
  cameraSettings: true,
  metadata: true,
  slots: {
    select: { id: true, name: true, required: true, target: true },
    orderBy: { name: "asc" as const },
    take: 9,
  },
} as const;
export const componentSelect = {
  id: true,
  name: true,
  kind: true,
  presentationTemplateRevision: true,
  packagingTemplate: { select: template },
  physicalMediaTemplate: { select: { ...template, type: true } },
  packagingBindings: {
    select: { packagingTextureSlotId: true, assetId: true, transform: true },
    take: 9,
  },
  physicalMediaBindings: {
    select: {
      physicalMediaTextureSlotId: true,
      assetId: true,
      transform: true,
    },
    take: 9,
  },
} as const;
export function publicComponents(releaseId: string, tx: TransactionClient) {
  return tx.gameReleaseIncludedItem.findMany({
    where: {
      gameReleaseId: releaseId,
      presentationApproved: true,
      presentationReviewedAt: { not: null },
    },
    select: componentSelect,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    take: 101,
  });
}
