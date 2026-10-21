import "server-only";
import type { TransactionClient } from "@/server/db/transaction";
import { variantSelect } from "../catalog/accessories";
import { assetSourceSelect } from "../catalog/provenance";
const asset = {
  ...assetSourceSelect,
  id: true,
  mimeType: true,
  sizeBytes: true,
  width: true,
  height: true,
} as const;
const imageUse = {
  id: true,
  caption: true,
  altText: true,
  asset: { select: asset },
} as const;
const displayImage = {
  state: "READY",
  kind: "IMAGE",
  deliveryClass: "DISPLAY",
} as const;
export function variant(id: string, tx: TransactionClient) {
  return tx.accessoryVariant.findUnique({
    where: { id },
    select: variantSelect,
  });
}
export function identity(id: string, tx: TransactionClient) {
  return tx.collectionItem.findFirst({
    where: { id, type: "ACCESSORY" },
    select: {
      id: true,
      revision: true,
      ownedAccessory: { select: { accessoryVariantId: true } },
    },
  });
}
export function catalogImages(
  kind: "family" | "variant",
  id: string,
  page: number,
  tx: TransactionClient,
) {
  return tx.catalogAsset.findMany({
    where: {
      ...(kind === "family" ? { accessoryId: id } : { accessoryVariantId: id }),
      role: { in: ["PREVIEW", "COVER", "GALLERY"] },
      asset: { ...displayImage, scope: "CATALOG" },
    },
    select: imageUse,
    orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { id: "asc" }],
    skip: (page - 1) * 12,
    take: 13,
  });
}
export function photos(id: string, tx: TransactionClient) {
  return tx.collectionItemMedia.findMany({
    where: {
      collectionItemId: id,
      type: { notIn: ["CUSTOM_LOGO", "CUSTOM_MODEL"] },
      asset: { ...displayImage, scope: "COLLECTION" },
    },
    select: imageUse,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    take: 13,
  });
}
export async function modelFile(
  id: string,
  variantId: string,
  familyId: string,
  tx: TransactionClient,
) {
  const custom = await tx.collectionItemMedia.findFirst({
    where: {
      collectionItemId: id,
      type: "CUSTOM_MODEL",
      isPrimary: true,
      asset: { state: "READY", kind: "MODEL_3D", scope: "COLLECTION" },
    },
    select: { id: true, asset: { select: asset } },
  });
  if (custom) return { ...custom, source: "Your copy's custom 3D file" };
  const catalog = await tx.catalogAsset.findFirst({
    where: {
      OR: [{ accessoryVariantId: variantId }, { accessoryId: familyId }],
      role: "MODEL_3D",
      isPrimary: true,
      asset: { state: "READY", kind: "MODEL_3D", scope: "CATALOG" },
    },
    select: { id: true, accessoryVariantId: true, asset: { select: asset } },
    orderBy: [
      { accessoryVariantId: { sort: "asc", nulls: "last" } },
      { id: "asc" },
    ],
  });
  return catalog
    ? {
        ...catalog,
        source: catalog.accessoryVariantId
          ? "Variant catalog 3D file"
          : "Family catalog 3D file",
      }
    : null;
}
