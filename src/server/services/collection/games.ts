import "server-only";
import {
  PrivateAccessError,
  type PrivateAccessContext,
} from "@/server/auth/access";
import { PermissionError, requirePermission } from "@/server/auth/permissions";
import { withTransaction } from "@/server/db/transaction";
import { lockCatalogWrites } from "@/server/repositories/catalog/management";
import { lockLocationHierarchy } from "@/server/repositories/locations";
import * as repository from "@/server/repositories/collection/games";
import {
  consolePlatform,
  consoleLocationExists,
} from "@/server/repositories/collection/consoles";
import { platform as platformDto } from "./consoles";
import { findConsolePlatforms } from "./consoles";
import { getLocations } from "@/server/services/locations";
import {
  gameSearch,
  releaseSearch,
  releaseSelection,
  gameCopyCreate,
} from "@/features/games/creation-validation";
import type { ReleaseChoice } from "@/features/games/creation-contracts";
export class GameCreationError extends Error {
  constructor(
    public readonly code:
      "INVALID_INPUT" | "STALE" | "CONFLICT" | "UNAVAILABLE",
    message?: string,
  ) {
    super(
      message ??
        {
          INVALID_INPUT: "Check your game and copy details and try again.",
          STALE:
            "The selected platform, game or release changed. Go back and use Find matches to select the latest records. Your copy details are still here.",
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
    error instanceof GameCreationError ||
    error instanceof PrivateAccessError ||
    error instanceof PermissionError
  )
    throw error;
  throw new GameCreationError("UNAVAILABLE");
}
export function releaseDto(
  row: NonNullable<Awaited<ReturnType<typeof repository.release>>>,
): ReleaseChoice {
  return {
    id: row.id,
    revision: row.revision,
    gameId: row.gameId,
    platformId: row.platformId,
    name: row.editionName ?? row.editionType.toLowerCase().replaceAll("_", " "),
    slug: row.slug,
    editionType: row.editionType,
    editionName: row.editionName,
    printingLabel: row.printingLabel,
    markets: row.regions.map((r) => ({
      id: r.region.id,
      name: r.region.name,
      year: r.releaseYear,
      month: r.releaseMonth,
      day: r.releaseDay,
    })),
    languages: row.languages,
    description: row.descriptionOverride,
    identificationStatus: row.identificationStatus,
    regionLock: row.regionLock,
    regionLockNote: row.regionLockNote,
    components: row.includedItems,
  };
}
export async function findGames(context: PrivateAccessContext, input: unknown) {
  try {
    return await withTransaction(
      async (tx) => {
        await requirePermission(context, "collection.manage", tx);
        const parsed = gameSearch.safeParse(input);
        if (!parsed.success) throw new GameCreationError("INVALID_INPUT");
        const { query, page } = parsed.data;
        const rows = await repository.games(query, page, tx);
        return {
          items: rows.slice(0, 25).map(({ archivedAt, ...r }) => {
            void archivedAt;
            return r;
          }),
          hasMore: rows.length > 25,
          page,
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  } catch (e) {
    fail(e);
  }
}
export async function findGameReleases(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(
      async (tx) => {
        await requirePermission(context, "collection.manage", tx);
        const parsed = releaseSearch.safeParse(input);
        if (!parsed.success) throw new GameCreationError("INVALID_INPUT");
        const rows = await repository.releases(parsed.data, tx);
        return {
          items: rows.slice(0, 25).map(releaseDto),
          hasMore: rows.length > 25,
          page: parsed.data.page,
          markets: await repository.releaseMarkets(
            parsed.data.platformId,
            parsed.data.gameId,
            tx,
          ),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  } catch (e) {
    fail(e);
  }
}
export async function selectGameRelease(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(
      async (tx) => {
        await requirePermission(context, "collection.manage", tx);
        const p = releaseSelection.safeParse(input);
        if (!p.success) throw new GameCreationError("INVALID_INPUT");
        const row = await repository.release(p.data.id, tx);
        const game = await repository.game(p.data.gameId, tx);
        const platform = await consolePlatform(p.data.platformId, tx);
        if (
          !row ||
          !game ||
          !platform ||
          row.archivedAt ||
          game.archivedAt ||
          platform.archivedAt ||
          row.gameId !== game.id ||
          row.platformId !== platform.id
        )
          throw new GameCreationError("STALE");
        return releaseDto(row);
      },
      { isolationLevel: "RepeatableRead" },
    );
  } catch (e) {
    fail(e);
  }
}
export async function getGameCreation(context: PrivateAccessContext) {
  const [platforms, games, locations, actor] = await Promise.all([
    findConsolePlatforms(context, {}),
    findGames(context, {}),
    getLocations(context),
    requirePermission(context, "collection.manage"),
  ]);
  return {
    platforms,
    games,
    locations: locations.locations.map((l) => ({
      id: l.id,
      label: l.path.map((p) => p.name).join(" / "),
    })),
    canManageCatalog: actor.role === "ADMIN",
  };
}
export async function createGameCopy(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(
      async (tx) => {
        await requirePermission(context, "collection.manage", tx);
        const p = gameCopyCreate.safeParse(input);
        if (!p.success) throw new GameCreationError("INVALID_INPUT");
        const d = p.data;
        await lockCatalogWrites(tx);
        await lockLocationHierarchy(tx);
        const actor = await requirePermission(context, "collection.manage", tx);
        const existing = await repository.createdGame(d.id, tx);
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
            existing.type !== "GAME" ||
            existing.createdById !== actor.userId ||
            existing.ownedGame?.gameReleaseId !== d.releaseId ||
            fields.some((k) => existing[k] !== d[k]) ||
            existing.defects.some((x) => x.status !== "ACTIVE") ||
            JSON.stringify(defects(existing.defects)) !==
              JSON.stringify(defects(d.defects))
          )
            throw new GameCreationError("CONFLICT");
          // A retry must still describe the same canonical relationship, even if its revision advanced.
          const selected = await repository.release(d.releaseId, tx);
          if (
            !selected ||
            selected.gameId !== d.gameId ||
            selected.platformId !== d.platformId
          )
            throw new GameCreationError("CONFLICT");
          return existing.id;
        }
        const release = await repository.release(d.releaseId, tx);
        const game = await repository.game(d.gameId, tx);
        const platform = await consolePlatform(d.platformId, tx);
        if (
          !release ||
          !game ||
          !platform ||
          release.archivedAt ||
          game.archivedAt ||
          platform.archivedAt ||
          release.gameId !== game.id ||
          release.platformId !== platform.id ||
          release.revision !== d.releaseRevision ||
          game.revision !== d.gameRevision ||
          platform.revision !== d.platformRevision
        )
          throw new GameCreationError("STALE");
        if (d.locationId && !(await consoleLocationExists(d.locationId, tx)))
          throw new GameCreationError(
            "INVALID_INPUT",
            "This location is no longer available. Choose another location or leave it unassigned.",
          );
        return (
          await repository.insertGame(
            {
              id: d.id,
              type: "GAME",
              serialNumber: d.serialNumber,
              observedMarkings: d.observedMarkings,
              hasBox: d.hasBox,
              locationId: d.locationId,
              notes: d.notes,
              publicationStatus: "PRIVATE",
              createdById: actor.userId,
              updatedById: actor.userId,
              ownedGame: { create: { gameReleaseId: d.releaseId } },
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

export async function refreshGameSelection(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(
      async (tx) => {
        await requirePermission(context, "collection.manage", tx);
        const p = releaseSelection.safeParse(input);
        if (!p.success) throw new GameCreationError("INVALID_INPUT");
        const [release, game, platform] = await Promise.all([
          repository.release(p.data.id, tx),
          repository.game(p.data.gameId, tx),
          consolePlatform(p.data.platformId, tx),
        ]);
        if (
          !release ||
          !game ||
          !platform ||
          release.archivedAt ||
          game.archivedAt ||
          platform.archivedAt ||
          release.gameId !== game.id ||
          release.platformId !== platform.id
        )
          throw new GameCreationError("STALE");
        const { archivedAt, ...choice } = game;
        void archivedAt;
        return {
          game: choice,
          platform: platformDto(platform),
          release: releaseDto(release),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  } catch (error) {
    fail(error);
  }
}
