import "server-only";
import { assetAttribution } from "./provenance";
import { Prisma } from "@/server/db/generated/client";
import {
  PrivateAccessError,
  type PrivateAccessContext,
} from "@/server/auth/access";
import { PermissionError, requirePermission } from "@/server/auth/permissions";
import {
  withTransaction,
  type TransactionClient,
} from "@/server/db/transaction";
import { lockAssets } from "@/server/repositories/assets";
import {
  lockCatalogWrites,
  appendCatalogHistory,
} from "@/server/repositories/catalog/management";
import * as repository from "@/server/repositories/catalog/screenshots";
import {
  screenshotPage,
  screenshotMutation,
} from "@/features/games/screenshot-validation";
import type {
  Screenshot,
  ScreenshotGalleryData,
} from "@/features/games/screenshot-contracts";
export class ScreenshotError extends Error {
  constructor(
    public readonly code:
      "INVALID_INPUT" | "NOT_FOUND" | "STALE" | "UNAVAILABLE",
  ) {
    super(
      {
        INVALID_INPUT:
          "Check the screenshot details. Restore archived releases before changing screenshots.",
        NOT_FOUND: "This release or screenshot is unavailable.",
        STALE:
          "This release changed. Your entries are still here. Refresh before trying again.",
        UNAVAILABLE:
          "We couldn't confirm this screenshot change. Refresh to check the saved gallery before trying again.",
      }[code],
    );
  }
}
function fail(e: unknown): never {
  if (
    e instanceof ScreenshotError ||
    e instanceof PermissionError ||
    e instanceof PrivateAccessError
  )
    throw e;
  throw new ScreenshotError("UNAVAILABLE");
}
function dto(
  row: Awaited<ReturnType<typeof repository.screenshots>>[number],
): Screenshot {
  const a = row.asset;
  return {
    id: row.id,
    caption: row.caption,
    altText: row.altText,
    url: `/api/media/private/${a.id}`,
    width: a.width ?? 1,
    height: a.height ?? 1,
    source: assetAttribution(a),
  };
}
export async function readScreenshotGallery(
  releaseId: string,
  gameId: string,
  page: number,
  canManage: boolean,
  tx: TransactionClient,
): Promise<ScreenshotGalleryData> {
  const scope = (await repository.hasReleaseScreenshots(releaseId, tx))
    ? "release"
    : "game";
  const rows = await repository.screenshots(
    scope === "release" ? releaseId : gameId,
    scope,
    page,
    tx,
  );
  return {
    items: rows.slice(0, 16).map(dto),
    page,
    hasNext: rows.length > 16,
    scope,
    canManage,
  };
}
export async function getScreenshotGallery(
  context: PrivateAccessContext,
  input: unknown,
  manage = false,
) {
  try {
    return await withTransaction(
      async (tx) => {
        const actor = await requirePermission(
          context,
          manage ? "catalog.manage" : "private.read",
          tx,
        );
        const p = screenshotPage.safeParse(input);
        if (!p.success) throw new ScreenshotError("NOT_FOUND");
        const release = await repository.screenshotRelease(
          p.data.releaseId,
          tx,
        );
        if (!release) throw new ScreenshotError("NOT_FOUND");
        const scope =
          manage || (await repository.hasReleaseScreenshots(release.id, tx))
            ? "release"
            : "game";
        const rows = await repository.screenshots(
          scope === "release" ? release.id : release.gameId,
          scope,
          p.data.page,
          tx,
        );
        const gallery: ScreenshotGalleryData = {
          items: rows.slice(0, 16).map(dto),
          page: p.data.page,
          hasNext: rows.length > 16,
          scope,
          canManage: actor.role === "ADMIN",
        };
        return {
          gallery,
          release: {
            id: release.id,
            name: `${release.game.name} · ${release.platform.name} · ${release.slug}`,
            revision: release.revision,
            archived: release.archivedAt !== null,
          },
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  } catch (e) {
    fail(e);
  }
}
export async function recordScreenshotUpload(
  releaseId: string,
  useId: string,
  actorId: string,
  tx: TransactionClient,
) {
  const row = await repository.screenshotRelease(releaseId, tx);
  if (!row || row.archivedAt) throw new ScreenshotError("INVALID_INPUT");
  const next = await repository.advanceRelease(releaseId, tx);
  await appendCatalogHistory(
    "release",
    releaseId,
    next.revision,
    actorId,
    [
      {
        fieldPath: `screenshots.${useId}`,
        before: Prisma.JsonNull,
        after: { operation: "upload" },
      },
    ],
    tx,
  );
}
export async function mutateScreenshot(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    await withTransaction(
      async (tx) => {
        await requirePermission(context, "catalog.manage", tx);
        const p = screenshotMutation.safeParse(input);
        if (!p.success) throw new ScreenshotError("INVALID_INPUT");
        const d = p.data;
        await lockCatalogWrites(tx);
        const actor = await requirePermission(context, "catalog.manage", tx);
        const release = await repository.screenshotRelease(d.releaseId, tx);
        if (!release) throw new ScreenshotError("NOT_FOUND");
        if (release.revision !== d.expectedRevision)
          throw new ScreenshotError("STALE");
        if (release.archivedAt) throw new ScreenshotError("INVALID_INPUT");
        const row = await repository.screenshotUse(d.id, d.releaseId, tx);
        if (!row) throw new ScreenshotError("NOT_FOUND");
        await lockAssets(
          [
            row.assetId,
            ...(row.publicDisplayAssetId ? [row.publicDisplayAssetId] : []),
          ],
          tx,
        );
        if (d.operation === "update") {
          if (row.caption === d.caption && row.altText === d.altText) return;
          await repository.editScreenshot(
            row.id,
            { caption: d.caption, altText: d.altText },
            tx,
          );
        } else if (d.operation === "delete")
          await repository.removeScreenshot(row.id, tx);
        else {
          await repository.normalizeScreenshotOrder(d.releaseId, tx);
          const current = await repository.screenshotUse(
            row.id,
            d.releaseId,
            tx,
          );
          if (!current) throw new ScreenshotError("NOT_FOUND");
          const other = await repository.neighbor(
            d.releaseId,
            current,
            d.direction,
            tx,
          );
          if (!other) return;
          await repository.editScreenshot(
            row.id,
            { sortOrder: other.sortOrder },
            tx,
          );
          await repository.editScreenshot(
            other.id,
            { sortOrder: current.sortOrder },
            tx,
          );
        }
        const next = await repository.advanceRelease(d.releaseId, tx);
        const json = (value: unknown) =>
          JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
        await appendCatalogHistory(
          "release",
          d.releaseId,
          next.revision,
          actor.userId,
          [
            {
              fieldPath: `screenshots.${row.id}`,
              before: json({
                caption: row.caption,
                altText: row.altText,
                sortOrder: row.sortOrder,
              }),
              after: d.operation === "delete" ? Prisma.JsonNull : json(d),
            },
          ],
          tx,
        );
      },
      { isolationLevel: "ReadCommitted" },
    );
  } catch (e) {
    fail(e);
  }
}
