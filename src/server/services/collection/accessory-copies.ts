import "server-only";
import {
  PrivateAccessError,
  type PrivateAccessContext,
} from "@/server/auth/access";
import { PermissionError, requirePermission } from "@/server/auth/permissions";
import { canPerform } from "@/server/policies/permissions";
import { withTransaction } from "@/server/db/transaction";
import { lockCatalogWrites } from "@/server/repositories/catalog/management";
import { lockLocationHierarchy } from "@/server/repositories/locations";
import {
  lockCollectionItem,
  advanceCollectionItem,
} from "@/server/repositories/collection/items";
import { lockAssets } from "@/server/repositories/assets";
import * as repository from "@/server/repositories/collection/accessory-copies";
import { getLocations } from "@/server/services/locations";
import { readAccessoryPresentation } from "./accessory-presentation";
import {
  accessorySearch,
  variantSearch,
  accessorySelection,
  accessoryCopyCreate,
  accessoryCopyDetail,
  accessoryCopyMutation,
} from "@/features/accessories/copy-validation";
import type {
  AccessoryChoice,
  VariantChoice,
  AccessoryCopyDetail,
} from "@/features/accessories/copy-contracts";
export class AccessoryCopyError extends Error {
  constructor(
    public readonly code:
      | "INVALID_INPUT"
      | "STALE"
      | "COPY_STALE"
      | "CONFLICT"
      | "NOT_FOUND"
      | "UNAVAILABLE",
    message?: string,
  ) {
    super(
      message ??
        {
          INVALID_INPUT: "Check your accessory and copy details and try again.",
          STALE:
            "The accessory or variant changed. Refresh the catalog choices and review them again. Your copy details are still here.",
          COPY_STALE:
            "This copy changed while you were editing. Your entries are still here. Close this form and refresh to review the latest copy before trying again.",
          CONFLICT:
            "This save reference is already in use. Check your collection before starting another copy.",
          NOT_FOUND: "This accessory copy no longer exists.",
          UNAVAILABLE:
            "We couldn't confirm the result. Keep this page open. Check the latest copy before trying again.",
        }[code],
    );
  }
}
function fail(error: unknown): never {
  if (
    error instanceof AccessoryCopyError ||
    error instanceof PrivateAccessError ||
    error instanceof PermissionError
  )
    throw error;
  throw new AccessoryCopyError("UNAVAILABLE");
}
export function familyDto(
  row: NonNullable<Awaited<ReturnType<typeof repository.family>>>,
): AccessoryChoice {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    revision: row.revision,
    archived: !!row.archivedAt,
    producer: row.producer?.name ?? null,
    year: row.releaseYear,
  };
}
export function variantDto(
  row: NonNullable<Awaited<ReturnType<typeof repository.variant>>>,
): VariantChoice {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    revision: row.revision,
    archived: !!row.archivedAt,
    accessoryId: row.accessoryId,
    modelNumber: row.modelNumber,
    color: row.color,
    edition: row.edition,
    producer: row.producer?.name ?? row.accessory.producer?.name ?? null,
    year: row.releaseYear ?? row.accessory.releaseYear,
    identificationStatus: row.identificationStatus,
    markets: row.regions.map((r) => r.region),
    platforms: row.platforms.map((p) => ({
      id: p.platform.id,
      name: p.platform.name,
      archived: !!p.platform.archivedAt,
      note: p.compatibilityNote,
    })),
  };
}
export async function findAccessories(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(
      async (tx) => {
        await requirePermission(context, "collection.manage", tx);
        const p = accessorySearch.safeParse(input);
        if (!p.success) throw new AccessoryCopyError("INVALID_INPUT");
        const rows = await repository.families(p.data.query, p.data.page, tx);
        return {
          items: rows.slice(0, 25).map(familyDto),
          hasMore: rows.length > 25,
          page: p.data.page,
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  } catch (e) {
    fail(e);
  }
}
export async function findAccessoryVariants(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(
      async (tx) => {
        await requirePermission(context, "collection.manage", tx);
        const p = variantSearch.safeParse(input);
        if (!p.success) throw new AccessoryCopyError("INVALID_INPUT");
        const rows = await repository.variants(
          p.data.accessoryId,
          p.data.query,
          p.data.page,
          tx,
        );
        return {
          items: rows.slice(0, 25).map(variantDto),
          hasMore: rows.length > 25,
          page: p.data.page,
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  } catch (e) {
    fail(e);
  }
}
export async function refreshAccessorySelection(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(
      async (tx) => {
        await requirePermission(context, "collection.manage", tx);
        const p = accessorySelection.safeParse(input);
        if (!p.success) throw new AccessoryCopyError("INVALID_INPUT");
        const row = await repository.variant(p.data.variantId, tx);
        if (
          !row ||
          row.accessoryId !== p.data.accessoryId ||
          row.archivedAt ||
          row.accessory.archivedAt
        )
          throw new AccessoryCopyError("STALE");
        return {
          accessory: familyDto(row.accessory),
          variant: variantDto(row),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  } catch (e) {
    fail(e);
  }
}
export async function getAccessoryCreation(context: PrivateAccessContext) {
  const [accessories, locations, actor] = await Promise.all([
    findAccessories(context, {}),
    getLocations(context),
    requirePermission(context, "collection.manage"),
  ]);
  return {
    accessories,
    locations: locations.locations.map((l) => ({
      id: l.id,
      label: l.path.map((p) => p.name).join(" / "),
    })),
    canManageCatalog: actor.role === "ADMIN",
  };
}
const fieldKeys = [
  "serialNumber",
  "observedMarkings",
  "hasBox",
  "locationId",
  "notes",
] as const;
export async function createAccessoryCopy(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(
      async (tx) => {
        await requirePermission(context, "collection.manage", tx);
        const p = accessoryCopyCreate.safeParse(input);
        if (!p.success) throw new AccessoryCopyError("INVALID_INPUT");
        const d = p.data;
        await lockCatalogWrites(tx);
        await lockLocationHierarchy(tx);
        const actor = await requirePermission(context, "collection.manage", tx);
        const existing = await repository.createdCopy(d.id, tx);
        if (existing) {
          const defects = (
            rows: {
              title: string;
              description: string | null;
              severity: string;
            }[],
          ) =>
            rows
              .map(({ title, description, severity }) =>
                JSON.stringify({ title, description, severity }),
              )
              .sort();
          if (
            existing.type !== "ACCESSORY" ||
            existing.createdById !== actor.userId ||
            existing.ownedAccessory?.accessoryVariantId !== d.variantId ||
            fieldKeys.some((k) => existing[k] !== d[k]) ||
            existing.defects.some((x) => x.status !== "ACTIVE") ||
            JSON.stringify(defects(existing.defects)) !==
              JSON.stringify(defects(d.defects))
          )
            throw new AccessoryCopyError("CONFLICT");
          const selected = await repository.variant(d.variantId, tx);
          if (!selected || selected.accessoryId !== d.accessoryId)
            throw new AccessoryCopyError("CONFLICT");
          return existing.id;
        }
        const selected = await repository.variant(d.variantId, tx);
        if (
          !selected ||
          selected.accessoryId !== d.accessoryId ||
          selected.revision !== d.variantRevision ||
          selected.accessory.revision !== d.accessoryRevision ||
          selected.archivedAt ||
          selected.accessory.archivedAt
        )
          throw new AccessoryCopyError("STALE");
        if (
          d.locationId &&
          !(await repository.locationExists(d.locationId, tx))
        )
          throw new AccessoryCopyError(
            "INVALID_INPUT",
            "This location is no longer available. Choose another location or leave it unassigned.",
          );
        return (
          await repository.insertCopy(
            {
              id: d.id,
              type: "ACCESSORY",
              serialNumber: d.serialNumber,
              observedMarkings: d.observedMarkings,
              hasBox: d.hasBox,
              locationId: d.locationId,
              notes: d.notes,
              publicationStatus: "PRIVATE",
              createdById: actor.userId,
              updatedById: actor.userId,
              ownedAccessory: { create: { accessoryVariantId: d.variantId } },
              defects: {
                create: d.defects.map((x) => ({
                  ...x,
                  status: "ACTIVE" as const,
                })),
              },
            },
            tx,
          )
        ).id;
      },
      { isolationLevel: "ReadCommitted" },
    );
  } catch (e) {
    fail(e);
  }
}
function requireCopy(row: Awaited<ReturnType<typeof repository.ownedCopy>>) {
  if (!row || row.type !== "ACCESSORY" || !row.ownedAccessory)
    throw new AccessoryCopyError("NOT_FOUND");
  return { ...row, ownedAccessory: row.ownedAccessory };
}
function copyLocations(
  rows: Awaited<ReturnType<typeof repository.copyLocations>>,
) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return rows.map((row) => {
    const names: string[] = [],
      seen = new Set<string>();
    let current: typeof row | undefined = row;
    while (current) {
      if (seen.has(current.id)) throw new AccessoryCopyError("UNAVAILABLE");
      seen.add(current.id);
      names.unshift(current.name);
      if (current.parentId && !byId.has(current.parentId))
        throw new AccessoryCopyError("UNAVAILABLE");
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return { id: row.id, label: names.join(" / ") };
  });
}
export async function getOwnedAccessoryCopy(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(
      async (tx) => {
        const actor = await requirePermission(context, "private.read", tx);
        const p = accessoryCopyDetail.safeParse(input);
        if (!p.success) throw new AccessoryCopyError("NOT_FOUND");
        const item = requireCopy(await repository.ownedCopy(p.data.id, tx));
        const selected = item.ownedAccessory.accessoryVariant;
        const locations = copyLocations(await repository.copyLocations(tx));
        const detail: AccessoryCopyDetail = {
          id: item.id,
          revision: item.revision,
          publicationStatus: item.publicationStatus,
          fields: {
            serialNumber: item.serialNumber ?? "",
            observedMarkings: item.observedMarkings ?? "",
            notes: item.notes ?? "",
            locationId: item.locationId ?? "",
            hasBox:
              item.hasBox === null ? "unknown" : item.hasBox ? "yes" : "no",
          },
          location:
            locations.find((l) => l.id === item.locationId)?.label ?? null,
          accessory: familyDto(selected.accessory),
          variant: variantDto(selected),
          defects: item.defects,
          defectCount: item._count.defects,
        };
        const rows = await repository.models(item.id, p.data.modelPage, tx),
          primary = await repository.primaryModel(item.id, tx);
        const model = (r: (typeof rows)[number]) => ({
          id: r.id,
          name: r.asset.originalFilename ?? "Custom 3D model",
          primary: r.isPrimary,
          url: `/api/media/private/${r.asset.id}`,
        });
        const canManage = canPerform(actor.role, "collection.manage");
        return {
          detail,
          presentation: await readAccessoryPresentation(
            item.id,
            selected.id,
            p.data.galleryPage,
            tx,
          ),
          canManage,
          locations: canManage ? locations : [],
          models: {
            items: rows.slice(0, 25).map(model),
            hasMore: rows.length > 25,
            page: p.data.modelPage,
            selected: primary ? model(primary) : null,
          },
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  } catch (e) {
    fail(e);
  }
}
export async function mutateAccessoryCopy(
  context: PrivateAccessContext,
  input: unknown,
): Promise<void> {
  try {
    await withTransaction(
      async (tx) => {
        await requirePermission(context, "collection.manage", tx);
        const p = accessoryCopyMutation.safeParse(input);
        if (!p.success) throw new AccessoryCopyError("INVALID_INPUT");
        const d = p.data;
        await lockCatalogWrites(tx);
        await lockLocationHierarchy(tx);
        await lockCollectionItem(d.id, tx);
        const actor = await requirePermission(context, "collection.manage", tx);
        const item = requireCopy(await repository.ownedCopy(d.id, tx));
        if (item.revision !== d.expectedRevision)
          throw new AccessoryCopyError("COPY_STALE");
        if (d.operation !== "update") {
          const assets = await repository.mediaAssets(item.id, tx);
          await lockAssets(
            assets.flatMap((a) => [
              a.assetId,
              ...(a.publicDisplayAssetId ? [a.publicDisplayAssetId] : []),
            ]),
            tx,
          );
          if (d.operation === "delete") {
            await repository.deleteCopy(item.id, tx);
            return;
          }
          const chosen = d.useId
            ? await repository.findModel(item.id, d.useId, tx)
            : null;
          if (d.useId && !chosen)
            throw new AccessoryCopyError(
              "INVALID_INPUT",
              "This custom model is no longer available for this copy.",
            );
          if (d.operation === "removeModel")
            await repository.removeModel(d.useId, tx);
          else {
            const current = await repository.primaryModel(item.id, tx);
            if ((current?.id ?? null) === d.useId) return;
            await repository.chooseModel(item.id, d.useId, tx);
          }
          await advanceCollectionItem(
            item.id,
            item.revision,
            actor.userId,
            item.publicationStatus === "PUBLISHED",
            tx,
          );
          return;
        }
        const selected = await repository.variant(d.variantId, tx);
        const retained =
          d.variantId === item.ownedAccessory.accessoryVariant.id;
        if (
          !selected ||
          selected.accessoryId !== d.accessoryId ||
          selected.revision !== d.variantRevision ||
          selected.accessory.revision !== d.accessoryRevision ||
          (!retained && (selected.archivedAt || selected.accessory.archivedAt))
        )
          throw new AccessoryCopyError("STALE");
        if (
          d.locationId &&
          !(await repository.locationExists(d.locationId, tx))
        )
          throw new AccessoryCopyError(
            "INVALID_INPUT",
            "This location is no longer available. Choose another location or leave it unassigned.",
          );
        const fields = {
          serialNumber: d.serialNumber,
          observedMarkings: d.observedMarkings,
          hasBox: d.hasBox,
          locationId: d.locationId,
          notes: d.notes,
        };
        if (retained && fieldKeys.every((k) => item[k] === fields[k])) return;
        await repository.updateCopy(
          item.id,
          {
            ...fields,
            revision: { increment: 1 },
            updatedById: actor.userId,
            ...(item.publicationStatus === "PUBLISHED"
              ? {
                  publicationStatus: "PRIVATE",
                  publishedAt: null,
                  publishedById: null,
                }
              : {}),
          },
          d.variantId,
          tx,
        );
      },
      { isolationLevel: "ReadCommitted" },
    );
  } catch (e) {
    fail(e);
  }
}
