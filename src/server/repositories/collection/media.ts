import "server-only";
import type { CollectionMediaType } from "../../db/generated/client";
import type { TransactionClient } from "../../db/transaction";
type PhotoType = Exclude<CollectionMediaType, "CUSTOM_LOGO" | "CUSTOM_MODEL">;
const select = {
  id: true,
  type: true,
  caption: true,
  altText: true,
  sortOrder: true,
  publicApproved: true,
  asset: {
    select: {
      id: true,
      kind: true,
      state: true,
      width: true,
      height: true,
      inputs: {
        select: {
          sourceAsset: {
            select: {
              outputs: {
                select: {
                  derivedAsset: {
                    select: {
                      id: true,
                      state: true,
                      kind: true,
                      deliveryClass: true,
                      transformMetadata: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;
export function listItemPhotos(
  collectionItemId: string,
  tx: TransactionClient,
) {
  return tx.collectionItemMedia.findMany({
    where: {
      collectionItemId,
      type: { notIn: ["CUSTOM_LOGO", "CUSTOM_MODEL"] },
    },
    select,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
}
export function updatePhoto(
  id: string,
  data: { type: PhotoType; caption: string | null; altText: string | null },
  tx: TransactionClient,
) {
  return tx.collectionItemMedia.update({
    where: { id },
    data: {
      ...data,
      publicDisplayAssetId: null,
      publicApproved: false,
      approvedAt: null,
      approvedById: null,
    },
  });
}
export function removePhoto(id: string, tx: TransactionClient) {
  return tx.collectionItemMedia.delete({ where: { id } });
}
export async function reorderPhotos(ids: string[], tx: TransactionClient) {
  // Custom logo/model roles are deliberately outside this photo ordering scope.
  for (const [sortOrder, id] of ids.entries())
    await tx.collectionItemMedia.update({
      where: { id },
      data: {
        sortOrder,
        publicDisplayAssetId: null,
        publicApproved: false,
        approvedAt: null,
        approvedById: null,
      },
    });
}
export function photoPublicationPolicy(tx: TransactionClient) {
  return tx.publicSettings.findUniqueOrThrow({
    where: { id: 1 },
    select: { showPersonalPhotos: true },
  });
}
export async function nextMediaOrder(
  collectionItemId: string,
  tx: TransactionClient,
) {
  const result = await tx.collectionItemMedia.aggregate({
    where: { collectionItemId },
    _max: { sortOrder: true },
  });
  return (result._max.sortOrder ?? -1) + 1;
}
