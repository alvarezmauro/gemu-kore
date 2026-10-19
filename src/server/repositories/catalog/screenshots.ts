import "server-only";
import type { TransactionClient } from "@/server/db/transaction";
const select = {
  id: true,
  caption: true,
  altText: true,
  sortOrder: true,
  asset: {
    select: {
      id: true,
      width: true,
      height: true,
      sourceType: true,
      provider: true,
      sourceUrl: true,
      author: true,
      licenseName: true,
      licenseUrl: true,
      attribution: true,
      usageRestrictions: true,
      retrievedAt: true,
    },
  },
} as const;
export function screenshotRelease(id: string, tx: TransactionClient) {
  return tx.gameRelease.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      revision: true,
      archivedAt: true,
      gameId: true,
      game: { select: { name: true } },
      platform: { select: { name: true } },
    },
  });
}
export function screenshots(
  id: string,
  scope: "release" | "game",
  page: number,
  tx: TransactionClient,
) {
  return tx.catalogAsset.findMany({
    where: {
      ...(scope === "release" ? { gameReleaseId: id } : { gameId: id }),
      role: "SCREENSHOT",
      asset: { state: "READY", kind: "IMAGE", deliveryClass: "DISPLAY" },
    },
    select,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    skip: (page - 1) * 16,
    take: 17,
  });
}
export function hasReleaseScreenshots(id: string, tx: TransactionClient) {
  return tx.catalogAsset.findFirst({
    where: {
      gameReleaseId: id,
      role: "SCREENSHOT",
      asset: { state: "READY", kind: "IMAGE", deliveryClass: "DISPLAY" },
    },
    select: { id: true },
  });
}
export function screenshotUse(
  id: string,
  releaseId: string,
  tx: TransactionClient,
) {
  return tx.catalogAsset.findFirst({
    where: { id, gameReleaseId: releaseId, role: "SCREENSHOT" },
    select: { ...select, assetId: true, publicDisplayAssetId: true },
  });
}
export function neighbor(
  releaseId: string,
  row: { id: string; sortOrder: number },
  direction: "up" | "down",
  tx: TransactionClient,
) {
  return tx.catalogAsset.findFirst({
    where: {
      gameReleaseId: releaseId,
      role: "SCREENSHOT",
      OR:
        direction === "up"
          ? [
              { sortOrder: { lt: row.sortOrder } },
              { sortOrder: row.sortOrder, id: { lt: row.id } },
            ]
          : [
              { sortOrder: { gt: row.sortOrder } },
              { sortOrder: row.sortOrder, id: { gt: row.id } },
            ],
    },
    select: { id: true, sortOrder: true },
    orderBy: [
      { sortOrder: direction === "up" ? "desc" : "asc" },
      { id: direction === "up" ? "desc" : "asc" },
    ],
  });
}
const reset = {
  publicApproved: false,
  publicDisplayAssetId: null,
  approvedAt: null,
  approvedById: null,
};
export async function editScreenshot(
  id: string,
  data: {
    caption?: string | null;
    altText?: string | null;
    sortOrder?: number;
  },
  tx: TransactionClient,
) {
  return tx.catalogAsset.update({
    where: { id },
    data: { ...data, ...reset },
    select: { id: true },
  });
}
export async function removeScreenshot(id: string, tx: TransactionClient) {
  return tx.catalogAsset.delete({ where: { id }, select: { id: true } });
}
export async function advanceRelease(id: string, tx: TransactionClient) {
  return tx.gameRelease.update({
    where: { id },
    data: { revision: { increment: 1 } },
    select: { revision: true },
  });
}
export async function normalizeScreenshotOrder(
  releaseId: string,
  tx: TransactionClient,
) {
  await tx.$executeRaw`UPDATE catalog_asset SET "sortOrder" = ordered.position FROM (SELECT id, (row_number() OVER (ORDER BY "sortOrder", id) - 1)::integer AS position FROM catalog_asset WHERE "gameReleaseId"=${releaseId}::uuid AND role='SCREENSHOT') ordered WHERE catalog_asset.id=ordered.id`;
}
