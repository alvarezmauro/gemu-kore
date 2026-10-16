import "server-only";
import type { PrivateAccessContext } from "@/server/auth/access";
import { PrivateAccessError } from "@/server/auth/access";
import { PermissionError, requirePermission } from "@/server/auth/permissions";
import { withTransaction } from "@/server/db/transaction";
import { lockCatalogWrites } from "@/server/repositories/catalog/management";
import { lockLocationHierarchy } from "@/server/repositories/locations";
import * as repository from "@/server/repositories/collection/consoles";
import {
  consoleCreate,
  consoleLookup,
  consoleOverride,
} from "@/features/consoles/validation";
import {
  lockCollectionItem,
  findCollectionItem,
  advanceCollectionItem,
} from "@/server/repositories/collection/items";
import type {
  ConsoleModelOption,
  ConsolePlatformOption,
} from "@/features/consoles/contracts";
import { getLocations } from "@/server/services/locations";

export class ConsoleError extends Error {
  constructor(
    public readonly code:
      | "INVALID_INPUT"
      | "STALE"
      | "CONFLICT"
      | "UNAVAILABLE"
      | "NOT_FOUND"
      | "COPY_STALE",
    message?: string,
  ) {
    super(
      message ??
        {
          NOT_FOUND: "This console copy no longer exists.",
          COPY_STALE:
            "This copy changed while you were editing. Your entries are still here. Close this form and refresh to review the latest copy before trying again.",
          INVALID_INPUT: "Check your console details and try again.",
          STALE:
            "The selected console or model changed. Go back, use Find matches to refresh the console and model choices, then select them again. Your physical details are still here.",
          CONFLICT:
            "This save reference is already in use. Check your collection before starting another copy.",
          UNAVAILABLE:
            "We couldn't confirm this save. Keep this page open and try Save again to check the same copy.",
        }[code],
    );
  }
}
function fail(error: unknown): never {
  if (
    error instanceof ConsoleError ||
    error instanceof PrivateAccessError ||
    error instanceof PermissionError
  )
    throw error;
  throw new ConsoleError("UNAVAILABLE");
}
function logo(assets: { role: string; assetId: string }[]) {
  const asset = assets.find((a) => a.role === "LOGO");
  return asset ? `/api/media/private/${asset.assetId}` : null;
}
export function platform(
  row: NonNullable<Awaited<ReturnType<typeof repository.consolePlatform>>>,
): ConsolePlatformOption {
  return {
    id: row.id,
    revision: row.revision,
    name: row.name,
    manufacturer: row.manufacturer?.name ?? null,
    generation: row.generation,
    releaseYear: row.originalReleaseYear,
    logoUrl: logo(row.assets),
  };
}
export function model(
  row: NonNullable<Awaited<ReturnType<typeof repository.consoleModel>>>,
): ConsoleModelOption {
  const image = ["PREVIEW", "COVER", "GALLERY"]
    .map((role) => row.assets.find((a) => a.role === role))
    .find(Boolean);
  return {
    id: row.id,
    revision: row.revision,
    name: row.name,
    platformId: row.platformId,
    modelNumber: row.modelNumber,
    manufacturer: row.manufacturer?.name ?? null,
    releaseYear: row.releaseYear,
    description: row.description,
    identificationStatus: row.identificationStatus,
    markets: row.regions.map((r) => r.region.name),
    regionLock: row.regionLock,
    logoUrl: logo(row.assets),
    imageUrl: image ? `/api/media/private/${image.assetId}` : null,
  };
}
export async function findConsolePlatforms(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(
      async (tx) => {
        await requirePermission(context, "collection.manage", tx);
        const parsed = consoleLookup.safeParse(input);
        if (!parsed.success || parsed.data.platformId)
          throw new ConsoleError("INVALID_INPUT");
        const { query, page } = parsed.data;
        const rows = await repository.consolePlatforms(query, page, tx);
        return {
          items: rows.slice(0, 25).map(platform),
          hasMore: rows.length > 25,
          page,
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  } catch (error) {
    fail(error);
  }
}
export async function findConsoleModels(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(
      async (tx) => {
        await requirePermission(context, "collection.manage", tx);
        const parsed = consoleLookup.safeParse(input);
        if (!parsed.success || !parsed.data.platformId)
          throw new ConsoleError("INVALID_INPUT");
        const { query, page, platformId } = parsed.data;
        const rows = await repository.consoleModels(
          platformId,
          query,
          page,
          tx,
        );
        return {
          items: rows.slice(0, 25).map(model),
          hasMore: rows.length > 25,
          page,
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  } catch (error) {
    fail(error);
  }
}
export async function getConsoleCreation(context: PrivateAccessContext) {
  const [platforms, locations] = await Promise.all([
    findConsolePlatforms(context, {}),
    getLocations(context),
  ]);
  return {
    platforms,
    locations: locations.locations.map((l) => ({
      id: l.id,
      label: l.path.map((p) => p.name).join(" / "),
    })),
  };
}
export async function createConsole(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(
      async (tx) => {
        await requirePermission(context, "collection.manage", tx);
        const parsed = consoleCreate.safeParse(input);
        if (!parsed.success) throw new ConsoleError("INVALID_INPUT");
        const data = parsed.data;
        await lockCatalogWrites(tx);
        await lockLocationHierarchy(tx);
        const current = await requirePermission(
          context,
          "collection.manage",
          tx,
        );
        const existing = await repository.createdConsole(data.id, tx);
        if (existing) {
          const fields = [
            "serialNumber",
            "observedMarkings",
            "hasBox",
            "locationId",
            "notes",
          ] as const;
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
            existing.type !== "CONSOLE" ||
            existing.createdById !== current.userId ||
            existing.ownedConsole?.consoleModelId !== data.modelId ||
            fields.some((key) => existing[key] !== data[key]) ||
            existing.defects.some((d) => d.status !== "ACTIVE") ||
            JSON.stringify(defects(existing.defects)) !==
              JSON.stringify(defects(data.defects))
          )
            throw new ConsoleError("CONFLICT");
          return existing.id;
        }
        const selected = await repository.consoleModel(data.modelId, tx);
        const parent = await repository.consolePlatform(data.platformId, tx);
        if (
          !selected ||
          !parent ||
          selected.archivedAt ||
          parent.archivedAt ||
          selected.platformId !== parent.id ||
          selected.revision !== data.modelRevision ||
          parent.revision !== data.platformRevision
        )
          throw new ConsoleError("STALE");
        if (
          data.locationId &&
          !(await repository.consoleLocationExists(data.locationId, tx))
        )
          throw new ConsoleError(
            "INVALID_INPUT",
            "This location is no longer available. Choose another location or leave it unknown.",
          );
        return (
          await repository.insertConsole(
            {
              id: data.id,
              type: "CONSOLE",
              serialNumber: data.serialNumber,
              observedMarkings: data.observedMarkings,
              hasBox: data.hasBox,
              locationId: data.locationId,
              notes: data.notes,
              publicationStatus: "PRIVATE",
              createdById: current.userId,
              updatedById: current.userId,
              ownedConsole: { create: { consoleModelId: data.modelId } },
              defects: {
                create: data.defects.map((d) => ({
                  ...d,
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
  } catch (error) {
    fail(error);
  }
}
// Activates a newly uploaded override; replacement/editing belongs to console CRUD.
// Never demote someone else's existing choice or modify an approved public use.
export async function activateNewConsoleOverride(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    await withTransaction(async (tx) => {
      await requirePermission(context, "collection.manage", tx);
      const parsed = consoleOverride.safeParse(input);
      if (!parsed.success) throw new ConsoleError("INVALID_INPUT");
      const data = parsed.data;
      await lockCollectionItem(data.collectionItemId, tx);
      const actor = await requirePermission(context, "media.manage", tx);
      const item = await findCollectionItem(data.collectionItemId, tx);
      const use = await repository.findConsoleOverride(
        data.collectionItemId,
        data.useId,
        tx,
      );
      if (
        !item ||
        item.type !== "CONSOLE" ||
        !use ||
        use.type !== data.type ||
        use.asset.state !== "READY" ||
        use.asset.kind !== (data.type === "CUSTOM_LOGO" ? "IMAGE" : "MODEL_3D")
      )
        throw new ConsoleError("INVALID_INPUT");
      if (use.isPrimary) return;
      if (use.publicApproved || item.publicationStatus !== "PRIVATE")
        throw new ConsoleError(
          "CONFLICT",
          "This copy needs a separate review before changing its artwork.",
        );
      if (await repository.primaryConsoleOverride(item.id, data.type, tx))
        throw new ConsoleError(
          "CONFLICT",
          "Another override is already selected for this copy. Your uploaded file is retained; refresh before changing that choice.",
        );
      await repository.activateConsoleOverride(use.id, tx);
      const advanced = await advanceCollectionItem(
        item.id,
        item.revision,
        actor.userId,
        false,
        tx,
      );
      if (advanced.count !== 1) throw new ConsoleError("CONFLICT");
    });
  } catch (error) {
    fail(error);
  }
}
