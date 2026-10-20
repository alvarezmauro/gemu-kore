import "server-only";
import { readPackagingComponents } from "./game-presentation";
import { assetAttribution, readGameProvenance } from "../catalog/provenance";
import { playtimeDto } from "../catalog/playtime";
import { storedTrailer } from "@/features/games/trailer-validation";
import { readScreenshotGallery } from "../catalog/screenshots";
import {
  PrivateAccessError,
  type PrivateAccessContext,
} from "@/server/auth/access";
import { PermissionError, requirePermission } from "@/server/auth/permissions";
import { canPerform } from "@/server/policies/permissions";
import { withTransaction } from "@/server/db/transaction";
import { lockCatalogWrites } from "@/server/repositories/catalog/management";
import { lockLocationHierarchy } from "@/server/repositories/locations";
import { lockCollectionItem } from "@/server/repositories/collection/items";
import { lockAssets } from "@/server/repositories/assets";
import * as repository from "@/server/repositories/collection/game-management";
import { game, release } from "@/server/repositories/collection/games";
import {
  consolePlatform,
  consoleLocationExists,
} from "@/server/repositories/collection/consoles";
import { platform as platformDto } from "./consoles";
import { releaseDto } from "./games";
import {
  gameDetailInput,
  gameMutation,
} from "@/features/games/management-validation";
import type { GameCopyDetail } from "@/features/games/management-contracts";
export class GameError extends Error {
  constructor(
    public readonly code:
      "NOT_FOUND" | "INVALID_INPUT" | "COPY_STALE" | "STALE" | "UNAVAILABLE",
    message?: string,
  ) {
    super(
      message ??
        {
          NOT_FOUND: "This game copy no longer exists.",
          INVALID_INPUT: "Check your game copy details and try again.",
          COPY_STALE:
            "This copy changed while you were editing. Your entries are still here. Close this form and refresh to review the latest copy before trying again.",
          STALE:
            "This catalog identity changed or is no longer available. Refresh the platform, game and release choices and review them again. Your copy details are still here.",
          UNAVAILABLE:
            "We couldn't load or save this game. Refresh to check the latest copy before trying again.",
        }[code],
    );
  }
}
function fail(e: unknown): never {
  if (
    e instanceof GameError ||
    e instanceof PrivateAccessError ||
    e instanceof PermissionError
  )
    throw e;
  throw new GameError("UNAVAILABLE");
}
function requireGame(row: Awaited<ReturnType<typeof repository.ownedGame>>) {
  if (!row || row.type !== "GAME" || !row.ownedGame)
    throw new GameError("NOT_FOUND");
  return { ...row, ownedGame: row.ownedGame };
}
function locations(rows: Awaited<ReturnType<typeof repository.copyLocations>>) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return rows.map((row) => {
    const names: string[] = [],
      seen = new Set<string>();
    let current: typeof row | undefined = row;
    while (current) {
      if (seen.has(current.id)) throw new GameError("UNAVAILABLE");
      seen.add(current.id);
      names.unshift(current.name);
      if (current.parentId && !byId.has(current.parentId))
        throw new GameError("UNAVAILABLE");
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return { id: row.id, label: names.join(" / ") };
  });
}
function image(row: Awaited<ReturnType<typeof repository.gamePhotos>>[number]) {
  return {
    url: `/api/media/private/${row.asset.id}`,
    alt: row.altText ?? row.caption ?? "Game image",
    caption: row.caption,
    source: assetAttribution(row.asset),
    width: row.asset.width ?? 1,
    height: row.asset.height ?? 1,
  };
}
export async function getOwnedGame(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(
      async (tx) => {
        const actor = await requirePermission(context, "private.read", tx);
        const p = gameDetailInput.safeParse(input);
        if (!p.success) throw new GameError("NOT_FOUND");
        const item = requireGame(await repository.ownedGame(p.data.id, tx));
        const selected = item.ownedGame.gameRelease;
        const choices = locations(await repository.copyLocations(tx));
        const photos = await repository.gamePhotos(item.id, tx);
        const cover = await repository.gameCover(
          selected.gameId,
          selected.id,
          tx,
        );
        const detail: GameCopyDetail = {
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
            choices.find((l) => l.id === item.locationId)?.label ?? null,
          game: {
            id: selected.game.id,
            name: selected.game.name,
            slug: selected.game.slug,
            revision: selected.game.revision,
            description: selected.game.description,
            archived: selected.game.archivedAt !== null,
          },
          platform: {
            ...platformDto(selected.platform),
            archived: selected.platform.archivedAt !== null,
          },
          release: {
            ...releaseDto(selected),
            archived: selected.archivedAt !== null,
          },
          firstReleaseYear: selected.firstReleaseYear,
          developers: selected.game.companies.map((c) => c.company.name),
          credits: selected.companies.map((c) => ({
            company: c.company.name,
            role: c.role,
            label: c.creditLabel,
            market: c.releaseRegion?.region.name ?? null,
          })),
          cover: cover
            ? {
                ...image(cover),
                scope: cover.gameReleaseId ? "release" : "game",
              }
            : null,
          photos: photos.map(image),
          defects: item.defects,
          defectCount: item._count.defects,
        };
        const canManage = canPerform(actor.role, "collection.manage");
        return {
          detail,
          packaging: await readPackagingComponents(selected.id, tx),
          provenance: await readGameProvenance(
            selected.gameId,
            selected.id,
            tx,
          ),
          canManage,
          locations: canManage ? choices : [],
          playtime: {
            estimates: playtimeDto(selected.playtime ?? selected.game.playtime),
            scope:
              selected.playtime !== null
                ? ("release" as const)
                : ("game" as const),
            canManage: actor.role === "ADMIN",
          },
          trailer: {
            reference: storedTrailer(
              selected.trailerProvider !== null ? selected : selected.game,
            ),
            scope:
              selected.trailerProvider !== null
                ? ("release" as const)
                : ("game" as const),
          },
          screenshots: await readScreenshotGallery(
            selected.id,
            selected.gameId,
            p.data.screenshotsPage,
            actor.role === "ADMIN",
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
export async function mutateOwnedGame(
  context: PrivateAccessContext,
  input: unknown,
): Promise<void> {
  try {
    await withTransaction(
      async (tx) => {
        await requirePermission(context, "collection.manage", tx);
        const p = gameMutation.safeParse(input);
        if (!p.success) throw new GameError("INVALID_INPUT");
        const data = p.data;
        await lockCatalogWrites(tx);
        await lockLocationHierarchy(tx);
        await lockCollectionItem(data.id, tx);
        const actor = await requirePermission(context, "collection.manage", tx);
        const item = requireGame(await repository.ownedGame(data.id, tx));
        if (item.revision !== data.expectedRevision)
          throw new GameError("COPY_STALE");
        if (data.operation === "delete") {
          const assets = await repository.gameMediaAssets(item.id, tx);
          await lockAssets(
            assets.flatMap((a) => [
              a.assetId,
              ...(a.publicDisplayAssetId ? [a.publicDisplayAssetId] : []),
            ]),
            tx,
          );
          await repository.deleteGame(item.id, tx);
          return;
        }
        const selected = await release(data.releaseId, tx),
          parent = await game(data.gameId, tx),
          platform = await consolePlatform(data.platformId, tx);
        const retained = data.releaseId === item.ownedGame.gameRelease.id;
        if (
          !selected ||
          !parent ||
          !platform ||
          selected.gameId !== parent.id ||
          selected.platformId !== platform.id ||
          selected.revision !== data.releaseRevision ||
          parent.revision !== data.gameRevision ||
          platform.revision !== data.platformRevision ||
          (!retained &&
            (selected.archivedAt || parent.archivedAt || platform.archivedAt))
        )
          throw new GameError("STALE");
        if (
          data.locationId &&
          !(await consoleLocationExists(data.locationId, tx))
        )
          throw new GameError(
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
        await repository.updateGame(
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
          data.releaseId,
          tx,
        );
      },
      { isolationLevel: "ReadCommitted" },
    );
  } catch (e) {
    fail(e);
  }
}
