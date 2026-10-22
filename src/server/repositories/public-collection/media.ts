import "server-only";
import type { TransactionClient } from "@/server/db/transaction";
import type { Prisma } from "@/server/db/generated/client";
// No private metadata, filenames or provenance URLs enter public resolution.
export const mediaAssetSelect = {
  id: true,
  state: true,
  kind: true,
  scope: true,
  deliveryClass: true,
  mimeType: true,
  sizeBytes: true,
  width: true,
  height: true,
  publicSafe: true,
  reviewedAt: true,
  rightsStatus: true,
} as const;
export function mediaIdentity(id: string, tx: TransactionClient) {
  return tx.collectionItem.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      publicationStatus: true,
      ownedConsole: {
        select: {
          consoleModelId: true,
          consoleModel: { select: { platformId: true } },
        },
      },
      ownedGame: {
        select: {
          gameReleaseId: true,
          gameRelease: { select: { gameId: true } },
        },
      },
      ownedAccessory: {
        select: {
          accessoryVariantId: true,
          accessoryVariant: { select: { accessoryId: true } },
        },
      },
    },
  });
}
export type MediaIdentity = NonNullable<
  Awaited<ReturnType<typeof mediaIdentity>>
>;
export function catalogScopes(
  item: MediaIdentity,
): Prisma.CatalogAssetWhereInput[] {
  if (item.type === "CONSOLE" && item.ownedConsole)
    return [
      { consoleModelId: item.ownedConsole.consoleModelId },
      { consolePlatformId: item.ownedConsole.consoleModel.platformId },
    ];
  if (item.type === "GAME" && item.ownedGame)
    return [
      { gameReleaseId: item.ownedGame.gameReleaseId },
      { gameId: item.ownedGame.gameRelease.gameId },
      { includedItem: { gameReleaseId: item.ownedGame.gameReleaseId } },
    ];
  if (item.type === "ACCESSORY" && item.ownedAccessory)
    return [
      { accessoryVariantId: item.ownedAccessory.accessoryVariantId },
      { accessoryId: item.ownedAccessory.accessoryVariant.accessoryId },
    ];
  return [];
}
const useSelect = {
  id: true,
  caption: true,
  altText: true,
  publicApproved: true,
  approvedAt: true,
  publicDisplayAssetId: true,
  publicDisplayAsset: { select: mediaAssetSelect },
} as const;
export async function itemMediaUses(
  item: MediaIdentity,
  personal: boolean,
  tx: TransactionClient,
) {
  const result = [];
  if (personal) {
    const rows = await tx.collectionItemMedia.findMany({
      where: {
        collectionItemId: item.id,
        type: { not: "SERIAL" },
        publicApproved: true,
        approvedAt: { not: null },
      },
      select: { ...useSelect, type: true },
      orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { id: "asc" }],
      take: 1000,
    });
    for (const row of rows)
      result.push({
        ...row,
        kind: "personal" as const,
        model: row.type === "CUSTOM_MODEL",
        image: row.type !== "CUSTOM_MODEL",
        source: "Collection photo",
      });
  }
  for (const scope of catalogScopes(item)) {
    const rows = await tx.catalogAsset.findMany({
      where: {
        ...scope,
        publicApproved: true,
        approvedAt: { not: null },
        role: {
          in: ["COVER", "GALLERY", "SCREENSHOT", "PREVIEW", "MODEL_3D", "LOGO"],
        },
      },
      select: { ...useSelect, role: true },
      orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { id: "asc" }],
      take: 1000,
    });
    for (const row of rows)
      result.push({
        ...row,
        kind: "catalog" as const,
        model: row.role === "MODEL_3D",
        image: row.role !== "MODEL_3D",
        source: "Catalog artwork",
      });
  }
  return result;
}
export function assetNode(id: string, tx: TransactionClient) {
  return tx.asset.findUnique({
    where: { id },
    select: {
      ...mediaAssetSelect,
      inputs: { select: { sourceAssetId: true, purpose: true }, take: 129 },
    },
  });
}
export function assetLocator(id: string, tx: TransactionClient) {
  return tx.asset.findUnique({
    where: { id },
    select: { storageNamespace: true, objectKey: true },
  });
}
