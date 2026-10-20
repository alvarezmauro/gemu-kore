import "server-only";
import { nextMediaOrder } from "./collection/media";
import { getDatabase } from "../db/client";
import type { Prisma } from "../db/generated/client";
import type { TransactionClient } from "../db/transaction";
import type { UploadManifest, UploadTarget } from "../assets/contracts";

export const findAsset = (id: string, tx: TransactionClient = getDatabase()) =>
  tx.asset.findUnique({ where: { id } });
export async function lockAssets(ids: string[], tx: TransactionClient) {
  for (const id of [...new Set(ids)].sort())
    await tx.$queryRaw`SELECT id FROM asset WHERE id = ${id}::uuid FOR UPDATE`;
}
export async function targetIdentity(
  target: UploadTarget,
  tx: TransactionClient,
) {
  if (target.kind === "collection")
    return tx.collectionItem.findUnique({
      where: { id: target.id },
      select: { id: true, type: true },
    });
  if (target.kind === "application")
    return tx.appSettings.findUnique({
      where: { id: 1 },
      select: { id: true },
    });
  const query = {
    where: { id: target.id, archivedAt: null },
    select: { id: true },
  };
  switch (target.target) {
    case "company":
      return tx.company.findUnique(query);
    case "consolePlatform":
      return tx.consolePlatform.findUnique(query);
    case "consoleModel":
      return tx.consoleModel.findUnique(query);
    case "game":
      return tx.game.findUnique(query);
    case "gameRelease":
      return tx.gameRelease.findUnique(query);
    case "accessory":
      return tx.accessory.findUnique(query);
    case "accessoryVariant":
      return tx.accessoryVariant.findUnique(query);
  }
}
export const insertAsset = (
  data: Prisma.AssetUncheckedCreateInput,
  tx: TransactionClient,
) => tx.asset.create({ data });
export const updateAsset = (
  id: string,
  data: Prisma.AssetUncheckedUpdateInput,
  tx: TransactionClient,
) => tx.asset.update({ where: { id }, data });
export const removeAssetRecord = (id: string, tx: TransactionClient) =>
  tx.asset.delete({ where: { id } });
export async function makeReady(
  manifest: UploadManifest,
  tx: TransactionClient,
) {
  const original = manifest.data.artifacts[0];
  await updateAsset(original.id, { state: "READY" }, tx);
  for (const entry of manifest.data.artifacts.slice(1)) {
    await tx.assetDependency.create({
      data: {
        derivedAssetId: entry.id,
        sourceAssetId: original.id,
        purpose: "RESIZE",
      },
    });
    await updateAsset(entry.id, { state: "READY" }, tx);
  }
  const assetId =
    manifest.data.artifacts.find((a) => a.variant === "display")?.id ??
    original.id;
  const target = manifest.data.target;
  const base = { id: manifest.data.useId, assetId };
  if (target.kind === "collection")
    return tx.collectionItemMedia.create({
      data: {
        ...base,
        collectionItemId: target.id,
        type: target.type,
        sortOrder: await nextMediaOrder(target.id, tx),
      },
    });
  if (target.kind === "application")
    return tx.appAsset.create({
      data: { ...base, appSettingsId: 1, role: target.role },
    });
  return tx.catalogAsset.create({
    data: {
      ...base,
      [`${target.target}Id`]: target.id,
      role: target.role,
      ...((target.screenshot ?? target.artwork)
        ? {
            caption: (target.screenshot ?? target.artwork)!.caption,
            altText: (target.screenshot ?? target.artwork)!.altText,
          }
        : {}),
      ...(target.role === "SCREENSHOT" && target.target === "gameRelease"
        ? {
            sortOrder:
              ((
                await tx.catalogAsset.aggregate({
                  where: { gameReleaseId: target.id, role: "SCREENSHOT" },
                  _max: { sortOrder: true },
                })
              )._max.sortOrder ?? -1) + 1,
          }
        : {}),
    },
  });
}
export async function hasReferences(id: string, tx: TransactionClient) {
  const where = { OR: [{ assetId: id }, { publicDisplayAssetId: id }] };
  return Boolean(
    (await tx.packagingTextureBinding.count({ where: { assetId: id } })) ||
    (await tx.catalogAsset.count({ where })) ||
    (await tx.collectionItemMedia.count({ where })) ||
    (await tx.appAsset.count({ where })) ||
    (await tx.assetDependency.count({ where: { sourceAssetId: id } })),
  );
}
export async function hasFamilyUses(id: string, tx: TransactionClient) {
  const sources = await tx.assetDependency.findMany({
    where: { derivedAssetId: id },
    select: { sourceAssetId: true },
  });
  for (const source of sources) {
    const siblings = await tx.assetDependency.findMany({
      where: { sourceAssetId: source.sourceAssetId },
      select: { derivedAssetId: true },
    });
    for (const sibling of siblings) {
      const where = {
        OR: [
          { assetId: sibling.derivedAssetId },
          { publicDisplayAssetId: sibling.derivedAssetId },
        ],
      };
      if (
        (await tx.packagingTextureBinding.count({
          where: { assetId: sibling.derivedAssetId },
        })) ||
        (await tx.catalogAsset.count({ where })) ||
        (await tx.collectionItemMedia.count({ where })) ||
        (await tx.appAsset.count({ where }))
      )
        return true;
    }
  }
  return false;
}
