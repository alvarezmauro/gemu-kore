import "server-only";
import { Prisma } from "@/server/db/generated/client";
import {
  PrivateAccessError,
  type PrivateAccessContext,
} from "@/server/auth/access";
import { PermissionError, requirePermission } from "@/server/auth/permissions";
import { withTransaction } from "@/server/db/transaction";
import {
  appendCatalogHistory,
  lockCatalogWrites,
} from "@/server/repositories/catalog/management";
import {
  playtimeRecord,
  savePlaytime,
} from "@/server/repositories/catalog/playtime";
import {
  playtimeSet,
  playtimeTarget,
  playtimeMutation,
  type Playtime,
} from "@/features/games/playtime-validation";
export class PlaytimeError extends Error {
  constructor(
    public readonly code:
      "INVALID_INPUT" | "NOT_FOUND" | "STALE" | "ARCHIVED" | "UNAVAILABLE",
  ) {
    super(
      {
        INVALID_INPUT:
          "Check the playtime estimates, source and recorded date, then review the set before saving.",
        NOT_FOUND: "This catalog record is unavailable.",
        STALE:
          "This catalog record changed. Your entries are still here. Close this review and choose Reload saved estimates to compare the latest set before trying again.",
        ARCHIVED:
          "Restore this catalog record before changing playtime estimates.",
        UNAVAILABLE:
          "We couldn't confirm this playtime change. Refresh to check the saved estimates before trying again.",
      }[code],
    );
  }
}
function fail(error: unknown): never {
  if (
    error instanceof PlaytimeError ||
    error instanceof PermissionError ||
    error instanceof PrivateAccessError
  )
    throw error;
  throw new PlaytimeError("UNAVAILABLE");
}
type StoredPlaytime = NonNullable<
  Awaited<ReturnType<typeof playtimeRecord>>
>["playtime"];
export function playtimeDto(row: StoredPlaytime): Playtime | null {
  if (!row) return null;
  const { updatedAt, ...values } = row;
  const parsed = playtimeSet.safeParse({
    ...values,
    observedAt: row.observedAt.toISOString(),
  });
  return parsed.success
    ? { ...parsed.data, updatedAt: updatedAt.toISOString() }
    : null;
}
export async function getPlaytimeEditor(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(async (tx) => {
      await requirePermission(context, "catalog.manage", tx);
      const parsed = playtimeTarget.safeParse(input);
      if (!parsed.success) throw new PlaytimeError("NOT_FOUND");
      const row = await playtimeRecord(parsed.data.kind, parsed.data.id, tx);
      if (!row) throw new PlaytimeError("NOT_FOUND");
      return {
        ...parsed.data,
        label: row.label,
        revision: row.revision,
        archived: row.archivedAt !== null,
        estimates: playtimeDto(row.playtime),
      };
    });
  } catch (error) {
    fail(error);
  }
}
export async function changeCatalogPlaytime(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    await withTransaction(
      async (tx) => {
        await requirePermission(context, "catalog.manage", tx);
        const parsed = playtimeMutation.safeParse(input);
        if (!parsed.success) throw new PlaytimeError("INVALID_INPUT");
        const d = parsed.data;
        await lockCatalogWrites(tx);
        const actor = await requirePermission(context, "catalog.manage", tx);
        const row = await playtimeRecord(d.kind, d.id, tx);
        if (!row) throw new PlaytimeError("NOT_FOUND");
        if (row.revision !== d.expectedRevision)
          throw new PlaytimeError("STALE");
        if (row.archivedAt) throw new PlaytimeError("ARCHIVED");
        const current = playtimeDto(row.playtime);
        const before = current
          ? playtimeSet.parse({
              mainMinutes: current.mainMinutes,
              mainExtrasMinutes: current.mainExtrasMinutes,
              completionistMinutes: current.completionistMinutes,
              sourceType: current.sourceType,
              sourceName: current.sourceName,
              sourceUrl: current.sourceUrl,
              observedAt: current.observedAt,
            })
          : null;
        if (
          JSON.stringify(before) === JSON.stringify(d.estimates) &&
          (before !== null || row.playtime === null)
        )
          return;
        const next = await savePlaytime(
          d.kind,
          d.id,
          d.estimates
            ? { ...d.estimates, observedAt: new Date(d.estimates.observedAt) }
            : null,
          tx,
        );
        await appendCatalogHistory(
          d.kind,
          d.id,
          next.revision,
          actor.userId,
          [
            {
              fieldPath: "playtime",
              before: row.playtime
                ? (JSON.parse(
                    JSON.stringify(row.playtime),
                  ) as Prisma.InputJsonValue)
                : Prisma.JsonNull,
              after: d.estimates ?? Prisma.JsonNull,
            },
          ],
          tx,
        );
      },
      { isolationLevel: "ReadCommitted" },
    );
  } catch (error) {
    fail(error);
  }
}
