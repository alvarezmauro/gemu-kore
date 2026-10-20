import "server-only";
import type { Prisma } from "@/server/db/generated/client";
import type { TransactionClient } from "@/server/db/transaction";
import { assetSourceSelect } from "../catalog/provenance";
import { gameSelect, releaseSelect } from "./games";
import { platformSelect } from "./consoles";
import { trailerSelect } from "../catalog/trailers";
import { playtimeSelect } from "../catalog/playtime";
const image = {
  id: true,
  width: true,
  height: true,
  ...assetSourceSelect,
} as const;
export function ownedGame(id: string, tx: TransactionClient) {
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
      ownedGame: {
        select: {
          gameRelease: {
            select: {
              ...releaseSelect,
              ...trailerSelect,
              playtime: { select: playtimeSelect },
              firstReleaseYear: true,
              identifiers: {
                select: {
                  scheme: true,
                  value: true,
                  issuer: true,
                  marketNote: true,
                },
                orderBy: [{ scheme: "asc" }, { value: "asc" }, { id: "asc" }],
                take: 21,
              },
              game: {
                select: {
                  ...gameSelect,
                  ...trailerSelect,
                  playtime: { select: playtimeSelect },
                  companies: {
                    where: { role: "DEVELOPER" },
                    select: { company: { select: { name: true } } },
                    orderBy: [{ sortOrder: "asc" }, { companyId: "asc" }],
                  },
                },
              },
              platform: { select: platformSelect },
              companies: {
                select: {
                  role: true,
                  creditLabel: true,
                  company: { select: { name: true } },
                  releaseRegion: {
                    select: { region: { select: { name: true } } },
                  },
                },
                orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
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
export function copyLocations(tx: TransactionClient) {
  return tx.location.findMany({
    select: { id: true, name: true, parentId: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
}
export function gamePhotos(id: string, tx: TransactionClient) {
  return tx.collectionItemMedia.findMany({
    where: {
      collectionItemId: id,
      type: { notIn: ["CUSTOM_LOGO", "CUSTOM_MODEL"] },
      asset: { state: "READY", kind: "IMAGE", deliveryClass: "DISPLAY" },
    },
    select: { caption: true, altText: true, asset: { select: image } },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    take: 12,
  });
}
export function gameCover(
  gameId: string,
  releaseId: string,
  tx: TransactionClient,
) {
  return tx.catalogAsset.findFirst({
    where: {
      OR: [{ gameId }, { gameReleaseId: releaseId }],
      role: "COVER",
      isPrimary: true,
      asset: { state: "READY", kind: "IMAGE", deliveryClass: "DISPLAY" },
    },
    select: {
      gameReleaseId: true,
      caption: true,
      altText: true,
      asset: { select: image },
    },
    orderBy: [{ gameReleaseId: { sort: "asc", nulls: "last" } }, { id: "asc" }],
  });
}
export function gameMediaAssets(id: string, tx: TransactionClient) {
  return tx.collectionItemMedia.findMany({
    where: { collectionItemId: id },
    select: { assetId: true, publicDisplayAssetId: true },
  });
}
export async function updateGame(
  id: string,
  fields: Prisma.CollectionItemUncheckedUpdateInput,
  releaseId: string,
  tx: TransactionClient,
) {
  return tx.collectionItem.update({
    where: { id },
    data: { ...fields, ownedGame: { update: { gameReleaseId: releaseId } } },
    select: { id: true },
  });
}
export async function deleteGame(id: string, tx: TransactionClient) {
  return tx.collectionItem.delete({ where: { id }, select: { id: true } });
}
