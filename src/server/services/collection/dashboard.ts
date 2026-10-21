import "server-only";
import {
  PrivateAccessError,
  type PrivateAccessContext,
} from "@/server/auth/access";
import { PermissionError, requirePermission } from "@/server/auth/permissions";
import { canPerform } from "@/server/policies/permissions";
import { withTransaction } from "@/server/db/transaction";
import * as repository from "@/server/repositories/collection/dashboard";
import { listCardSummaries } from "@/server/repositories/collection/cards";
import type { DashboardData, RecentItem } from "@/features/dashboard/contracts";
import { copyLink } from "@/features/collection/copy-links";
export class DashboardError extends Error {
  constructor() {
    super("We couldn't load your collection overview. Please try again.");
  }
}
function identity(row: Awaited<ReturnType<typeof repository.recent>>[number]) {
  if (row.type === "CONSOLE" && row.ownedConsole) {
    const model = row.ownedConsole.consoleModel;
    return { title: model.platform.name, context: model.name };
  }
  if (row.type === "GAME" && row.ownedGame) {
    const release = row.ownedGame.gameRelease;
    return {
      title: release.game.name,
      context: `${release.platform.name} · ${release.editionName ?? "Edition unspecified"}`,
    };
  }
  if (row.type === "ACCESSORY" && row.ownedAccessory) {
    const variant = row.ownedAccessory.accessoryVariant;
    return { title: variant.accessory.name, context: variant.name };
  }
  throw new DashboardError();
}
export async function getDashboard(
  context: PrivateAccessContext,
): Promise<DashboardData> {
  try {
    return await withTransaction(
      async (tx) => {
        const actor = await requirePermission(context, "private.read", tx);
        const counts = await repository.counts(tx);
        const rows = await repository.recent(tx);
        const page = rows.slice(0, 8);
        const thumbnails = new Map(
          (
            await listCardSummaries(
              page.map((r) => r.id),
              tx,
            )
          ).map((r) => [r.id, r.photo]),
        );
        const recent: RecentItem[] = page.map((row) => {
          const item = identity(row),
            photo = thumbnails.get(row.id);
          return {
            id: row.id,
            type: row.type,
            ...item,
            href: copyLink(row.type, row.id).href,
            addedAt: row.createdAt.toISOString(),
            addedLabel: new Intl.DateTimeFormat("en", {
              month: "short",
              day: "numeric",
              year: "numeric",
              timeZone: "UTC",
            }).format(row.createdAt),
            photo: photo
              ? {
                  url: `/api/media/private/${photo.assetId}`,
                  alt: photo.altText ?? `${item.title} copy photo`,
                  width: photo.width,
                  height: photo.height,
                }
              : null,
          };
        });
        return {
          role: actor.role,
          canManage: canPerform(actor.role, "collection.manage"),
          counts,
          recent,
          moreRecent: rows.length > 8,
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  } catch (e) {
    if (
      e instanceof PrivateAccessError ||
      e instanceof PermissionError ||
      e instanceof DashboardError
    )
      throw e;
    throw new DashboardError();
  }
}
