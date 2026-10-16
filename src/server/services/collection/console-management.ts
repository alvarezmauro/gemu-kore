import "server-only";
import type { PrivateAccessContext } from "@/server/auth/access";
import { PrivateAccessError } from "@/server/auth/access";
import { PermissionError, requirePermission } from "@/server/auth/permissions";
import { canPerform } from "@/server/policies/permissions";
import { withTransaction } from "@/server/db/transaction";
import { lockCatalogWrites } from "@/server/repositories/catalog/management";
import {
  lockLocationHierarchy,
  listLocationRecords,
} from "@/server/repositories/locations";
import {
  lockCollectionItem,
  advanceCollectionItem,
} from "@/server/repositories/collection/items";
import { lockAssets } from "@/server/repositories/assets";
import * as repository from "@/server/repositories/collection/console-management";
import {
  consoleModel,
  consolePlatform,
  consoleLocationExists,
} from "@/server/repositories/collection/consoles";
import {
  consoleDetailInput,
  consoleMutation,
} from "@/features/consoles/validation";
import type {
  ConsoleDetail,
  ConsoleOverrideEntry,
  ConsoleImage,
} from "@/features/consoles/contracts";
import { locationEntries } from "@/features/locations/contracts";
import {
  ConsoleError,
  model as modelOption,
  platform as platformOption,
} from "./consoles";

function fail(error: unknown): never {
  if (
    error instanceof ConsoleError ||
    error instanceof PrivateAccessError ||
    error instanceof PermissionError
  )
    throw error;
  throw new ConsoleError(
    "UNAVAILABLE",
    "We couldn't load or save this console. Refresh to check the latest copy before trying again.",
  );
}
type Owned = NonNullable<Awaited<ReturnType<typeof repository.ownedConsole>>>;
function requireConsole(row: Owned | null) {
  if (!row || row.type !== "CONSOLE" || !row.ownedConsole)
    throw new ConsoleError("NOT_FOUND");
  return { ...row, ownedConsole: row.ownedConsole };
}
function override(
  row: Awaited<ReturnType<typeof repository.consoleOverrides>>[number],
): ConsoleOverrideEntry {
  return {
    id: row.id,
    type: row.type as ConsoleOverrideEntry["type"],
    name:
      row.asset.originalFilename ??
      row.asset.inputs[0]?.sourceAsset.originalFilename ??
      (row.type === "CUSTOM_LOGO" ? "Custom logo" : "Custom 3D model"),
    primary: row.isPrimary,
    url: `/api/media/private/${row.asset.id}`,
    width: row.asset.width ?? 1,
    height: row.asset.height ?? 1,
  };
}
function image(
  row: Awaited<ReturnType<typeof repository.consolePhotos>>[number],
): ConsoleImage {
  return {
    url: `/api/media/private/${row.asset.id}`,
    alt: row.altText ?? row.caption ?? "Console image",
    caption: row.caption,
    width: row.asset.width ?? 1,
    height: row.asset.height ?? 1,
  };
}
const label = (name: string) =>
  name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ");
function specification(value: unknown): string {
  if (value === null) return "Unknown";
  if (Array.isArray(value)) return value.map(specification).join(", ");
  if (typeof value === "object")
    return Object.entries(value)
      .map(([key, v]) => `${label(key)}: ${specification(v)}`)
      .join(" · ");
  return String(value);
}
export async function getOwnedConsole(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(
      async (tx) => {
        const current = await requirePermission(context, "private.read", tx);
        const parsed = consoleDetailInput.safeParse(input);
        if (!parsed.success) throw new ConsoleError("NOT_FOUND");
        const { id, overridePage } = parsed.data;
        const item = requireConsole(await repository.ownedConsole(id, tx));
        const model = item.ownedConsole.consoleModel;
        const platform = model.platform;
        const rows = await listLocationRecords(tx);
        const locations = locationEntries(
          rows.map(({ _count, updatedAt, ...l }) => ({
            ...l,
            updatedAt: updatedAt.toISOString(),
            childCount: _count.children,
            itemCount: _count.items,
          })),
        ).map((l) => ({
          id: l.id,
          label: l.path.map((p) => p.name).join(" / "),
        }));
        const photos = await repository.consolePhotos(id, tx);
        const gallery = await repository.consoleCatalogGallery(
          model.id,
          platform.id,
          tx,
        );
        const overrides = await repository.consoleOverrides(
          id,
          overridePage,
          tx,
        );
        const primary = await repository.consolePrimaryOverrides(id, tx);
        const modelFile = await repository.consoleCatalogModel(
          model.id,
          platform.id,
          tx,
        );
        const customLogo = primary.find(
          (u) =>
            u.type === "CUSTOM_LOGO" &&
            u.asset.kind === "IMAGE" &&
            u.asset.deliveryClass === "DISPLAY",
        );
        const customModel = primary.find(
          (u) => u.type === "CUSTOM_MODEL" && u.asset.kind === "MODEL_3D",
        );
        const modelDto = modelOption(model),
          platformDto = platformOption(platform);
        const facts: { label: string; value: string }[] = [
          ...(
            [
              ["Width (mm)", model.widthMm],
              ["Height (mm)", model.heightMm],
              ["Depth (mm)", model.depthMm],
              ["Weight (g)", model.weightGrams],
              ["Discontinued year", model.discontinuedYear],
            ] as const
          ).flatMap(([key, value]) =>
            value === null ? [] : [{ label: key, value: value.toString() }],
          ),
        ];
        const spec = model.specifications;
        if (
          spec &&
          typeof spec === "object" &&
          !Array.isArray(spec) &&
          spec.schemaVersion === 1 &&
          spec.data &&
          typeof spec.data === "object" &&
          !Array.isArray(spec.data)
        )
          facts.push(
            ...Object.entries(spec.data).map(([key, value]) => ({
              label: label(key),
              value: specification(value),
            })),
          );
        const detail: ConsoleDetail = {
          id,
          revision: item.revision,
          publicationStatus: item.publicationStatus,
          fields: {
            serialNumber: item.serialNumber ?? "",
            observedMarkings: item.observedMarkings ?? "",
            notes: item.notes ?? "",
            hasBox:
              item.hasBox === null ? "unknown" : item.hasBox ? "yes" : "no",
            locationId: item.locationId ?? "",
          },
          location:
            locations.find((l) => l.id === item.locationId)?.label ?? null,
          model: { ...modelDto, archived: model.archivedAt !== null },
          platform: { ...platformDto, archived: platform.archivedAt !== null },
          description: platform.description,
          history: platform.history,
          facts,
          photos: photos.map(image),
          catalogImages: gallery.map(image),
          defects: item.defects,
          defectCount: item._count.defects,
          overrides: overrides.slice(0, 25).map(override),
          primaryOverrides: primary.map(override),
          overridePage,
          moreOverrides: overrides.length > 25,
          logo: customLogo
            ? {
                url: `/api/media/private/${customLogo.asset.id}`,
                source: "Your copy's custom logo",
              }
            : modelDto.logoUrl
              ? { url: modelDto.logoUrl, source: "Catalog model logo" }
              : platformDto.logoUrl
                ? {
                    url: platformDto.logoUrl,
                    source: "Inherited platform logo",
                  }
                : null,
          modelFile: customModel
            ? {
                url: `/api/media/private/${customModel.asset.id}`,
                source: "Your copy's custom 3D file",
              }
            : modelFile
              ? {
                  url: `/api/media/private/${modelFile.assetId}`,
                  source: modelFile.consoleModelId
                    ? "Catalog model 3D file"
                    : "Inherited platform 3D file",
                }
              : null,
        };
        const canManage = canPerform(current.role, "collection.manage");
        return { detail, canManage, locations: canManage ? locations : [] };
      },
      { isolationLevel: "RepeatableRead" },
    );
  } catch (error) {
    fail(error);
  }
}
export async function mutateOwnedConsole(
  context: PrivateAccessContext,
  input: unknown,
): Promise<void> {
  try {
    await withTransaction(
      async (tx) => {
        await requirePermission(context, "collection.manage", tx);
        const parsed = consoleMutation.safeParse(input);
        if (!parsed.success) throw new ConsoleError("INVALID_INPUT");
        const data = parsed.data;
        // Same order as creation; root/media locks follow the dependency locks.
        await lockCatalogWrites(tx);
        await lockLocationHierarchy(tx);
        await lockCollectionItem(data.id, tx);
        const actor = await requirePermission(context, "collection.manage", tx);
        const item = requireConsole(await repository.ownedConsole(data.id, tx));
        if (item.revision !== data.expectedRevision)
          throw new ConsoleError("COPY_STALE");
        if (data.operation === "update") {
          const selected = await consoleModel(data.modelId, tx);
          const parent = await consolePlatform(data.platformId, tx);
          const retained = data.modelId === item.ownedConsole.consoleModel.id;
          if (
            !selected ||
            !parent ||
            selected.platformId !== parent.id ||
            selected.revision !== data.modelRevision ||
            parent.revision !== data.platformRevision ||
            (!retained && (selected.archivedAt || parent.archivedAt))
          )
            throw new ConsoleError(
              "STALE",
              "This catalog identity changed or is no longer available. Refresh the console and model choices, then review them again. Your copy details are still here.",
            );
          if (
            data.locationId &&
            !(await consoleLocationExists(data.locationId, tx))
          )
            throw new ConsoleError(
              "INVALID_INPUT",
              "This location is no longer available. Choose another location or leave it unassigned.",
            );
          const fields = {
            serialNumber: data.serialNumber,
            observedMarkings: data.observedMarkings,
            hasBox: data.hasBox,
            locationId: data.locationId,
            notes: data.notes,
          };
          if (
            retained &&
            Object.entries(fields).every(
              ([key, value]) => Reflect.get(item, key) === value,
            )
          )
            return;
          await repository.updateConsole(
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
            data.modelId,
            tx,
          );
          return;
        }
        const assets = await repository.consoleMediaAssets(item.id, tx);
        await lockAssets(
          assets.flatMap((m) => [
            m.assetId,
            ...(m.publicDisplayAssetId ? [m.publicDisplayAssetId] : []),
          ]),
          tx,
        );
        if (data.operation === "delete") {
          await repository.deleteConsole(item.id, tx);
          return;
        }
        const primary = await repository.consolePrimaryOverrides(item.id, tx);
        if (data.operation === "override") {
          const selected = data.useId
            ? await repository.findOverride(item.id, data.useId, tx)
            : null;
          if (
            data.useId &&
            (!selected ||
              selected.type !== data.type ||
              selected.asset.state !== "READY" ||
              selected.asset.kind !==
                (data.type === "CUSTOM_LOGO" ? "IMAGE" : "MODEL_3D") ||
              (data.type === "CUSTOM_LOGO" &&
                selected.asset.deliveryClass !== "DISPLAY"))
          )
            throw new ConsoleError("INVALID_INPUT");
          const before = primary.find((u) => u.type === data.type);
          if ((before?.id ?? null) === data.useId) return;
          await repository.setConsoleOverride(
            item.id,
            data.type,
            data.useId,
            tx,
          );
        } else {
          const selected = await repository.findOverride(
            item.id,
            data.useId,
            tx,
          );
          if (
            !selected ||
            !["CUSTOM_LOGO", "CUSTOM_MODEL"].includes(selected.type)
          )
            throw new ConsoleError("NOT_FOUND");
          await repository.removeConsoleOverride(selected.id, tx);
        }
        const advanced = await advanceCollectionItem(
          item.id,
          item.revision,
          actor.userId,
          item.publicationStatus === "PUBLISHED",
          tx,
        );
        if (advanced.count !== 1) throw new ConsoleError("COPY_STALE");
      },
      { isolationLevel: "ReadCommitted" },
    );
  } catch (error) {
    fail(error);
  }
}
