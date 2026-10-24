import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { PrivateAccessContext } from "@/server/auth/access";
import { requirePermission } from "@/server/auth/permissions";
import {
  withTransaction,
  type TransactionClient,
} from "@/server/db/transaction";
import * as repository from "@/server/repositories/collection/accessory-detail";
import { accessoryDomainDto } from "../catalog/accessories";
import { assetAttribution } from "../catalog/provenance";
import type {
  AccessoryPresentation,
  AccessoryImage,
} from "@/features/accessories/detail-contracts";
import { modelPresentation, modelSettings } from "@/lib/three/contracts";
import { AccessoryCopyError } from "./accessory-copies";
const label = (key: string) =>
  key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ");
function text(value: unknown): string {
  if (value === null) return "Unknown";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(text).join(", ") || "Not recorded";
  if (typeof value === "object")
    return (
      Object.entries(value)
        .map(([k, v]) => `${label(k)}: ${text(v)}`)
        .join(" · ") || "Not recorded"
    );
  return String(value);
}
function facts(value: unknown) {
  const p = z
    .strictObject({
      schemaVersion: z.literal(1),
      data: z.record(z.string(), z.unknown()),
    })
    .safeParse(value);
  return p.success
    ? Object.entries(p.data.data).map(([key, value]) => ({
        label: label(key),
        value: text(value),
      }))
    : [];
}
function image(
  r: Awaited<ReturnType<typeof repository.photos>>[number],
): AccessoryImage {
  return {
    id: r.id,
    url: `/api/media/private/${r.asset.id}`,
    alt: r.altText ?? r.caption ?? "Accessory image",
    caption: r.caption,
    source: assetAttribution(r.asset),
    width: r.asset.width ?? 1,
    height: r.asset.height ?? 1,
  };
}
export async function readAccessoryPresentation(
  id: string,
  variantId: string,
  page: number,
  tx: TransactionClient,
): Promise<AccessoryPresentation> {
  const row = await repository.variant(variantId, tx);
  if (!row) throw new AccessoryCopyError("NOT_FOUND");
  const domain = accessoryDomainDto(row);
  const family = await repository.catalogImages(
    "family",
    row.accessoryId,
    page,
    tx,
  );
  const variant = await repository.catalogImages("variant", row.id, page, tx);
  const photos = await repository.photos(id, tx);
  // Hero selection is independent of the current gallery page.
  const firstVariant =
    page === 1
      ? variant
      : await repository.catalogImages("variant", row.id, 1, tx);
  const firstFamily =
    page === 1
      ? family
      : await repository.catalogImages("family", row.accessoryId, 1, tx);
  const poster = firstVariant[0] ?? firstFamily[0] ?? photos[0];
  const file = await repository.modelFile(id, row.id, row.accessoryId, tx);
  const model = file
    ? {
        source: file.source,
        attribution: assetAttribution(file.asset),
        url: `/api/media/private/${file.asset.id}`,
        selectionKey: createHash("sha256")
          .update(
            JSON.stringify([
              row.id,
              row.revision,
              row.accessory.revision,
              file.id,
              file.asset.id,
            ]),
          )
          .digest("hex"),
      }
    : null;
  return {
    description: domain.description,
    specifications: {
      scope: domain.specifications.scope,
      facts: facts(domain.specifications.value),
    },
    video: domain.video,
    yearScope: domain.releaseYear.scope,
    producerScope: domain.producer.scope,
    regionLock: row.regionLock,
    regionLockNote: row.regionLockNote,
    catalog: {
      family: family.slice(0, 12).map(image),
      variant: variant.slice(0, 12).map(image),
      page,
      hasNext: family.length > 12 || variant.length > 12,
    },
    photos: photos.slice(0, 12).map(image),
    morePhotos: photos.length > 12,
    poster: poster
      ? {
          url: `/api/media/private/${poster.asset.id}`,
          alt: poster.altText ?? poster.caption ?? "Accessory preview",
          width: poster.asset.width ?? 1,
          height: poster.asset.height ?? 1,
        }
      : null,
    model,
  };
}
const accessoryModelRequest = z.strictObject({
  id: z.uuid(),
  expectedRevision: z.number().int().positive().max(2147483646),
  selectionKey: z.string().regex(/^[a-f0-9]{64}$/),
});
export async function getAccessoryModelPresentation(
  context: PrivateAccessContext,
  input: unknown,
) {
  return withTransaction(
    async (tx) => {
      await requirePermission(context, "private.read", tx);
      const p = accessoryModelRequest.safeParse(input);
      if (!p.success) throw new AccessoryCopyError("INVALID_INPUT");
      const item = await repository.identity(p.data.id, tx);
      if (!item?.ownedAccessory) throw new AccessoryCopyError("NOT_FOUND");
      if (item.revision !== p.data.expectedRevision)
        throw new AccessoryCopyError("COPY_STALE");
      const row = await repository.variant(
        item.ownedAccessory.accessoryVariantId,
        tx,
      );
      if (!row) throw new AccessoryCopyError("NOT_FOUND");
      const presentation = await readAccessoryPresentation(
        item.id,
        row.id,
        1,
        tx,
      );
      if (!presentation.model)
        throw new AccessoryCopyError(
          "NOT_FOUND",
          "No ready 3D file is available for this accessory.",
        );
      if (presentation.model.selectionKey !== p.data.selectionKey)
        throw new AccessoryCopyError(
          "STALE",
          "This accessory model changed. Refresh the page before opening 3D.",
        );
      const file = await repository.modelFile(
        item.id,
        row.id,
        row.accessoryId,
        tx,
      );
      if (!file) throw new AccessoryCopyError("NOT_FOUND");
      return modelPresentation.parse({
        schemaVersion: 1,
        presentationKey: `${item.id}:${item.revision}:${presentation.model.selectionKey}`,
        title: `${row.accessory.name} · ${row.name}`,
        source: file.source,
        description:
          "Selected copy or catalog geometry. Physical condition and identifying details remain under My copy.",
        resource: {
          id: file.asset.id,
          url: presentation.model.url,
          mimeType: file.asset.mimeType,
          byteLength: Number(file.asset.sizeBytes),
        },
        poster: presentation.poster
          ? {
              url: presentation.poster.url,
              alt: presentation.poster.alt,
              width: presentation.poster.width,
              height: presentation.poster.height,
            }
          : null,
        settings: modelSettings.parse({ preset: "object" }),
      });
    },
    { isolationLevel: "RepeatableRead" },
  );
}
