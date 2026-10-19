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
  trailerRecord,
  saveTrailer,
} from "@/server/repositories/catalog/trailers";
import {
  storedTrailer,
  trailerMutation,
  trailerTarget,
} from "@/features/games/trailer-validation";
export class TrailerError extends Error {
  constructor(
    public readonly code:
      "INVALID_INPUT" | "NOT_FOUND" | "STALE" | "ARCHIVED" | "UNAVAILABLE",
  ) {
    super(
      {
        INVALID_INPUT:
          "Check the trailer. Use a YouTube video or an HTTPS video URL.",
        NOT_FOUND: "This catalog record is unavailable.",
        STALE:
          "This catalog record changed. Your entries are still here. Refresh before trying again.",
        ARCHIVED: "Restore this catalog record before changing its trailer.",
        UNAVAILABLE:
          "We couldn't confirm this trailer change. Refresh to check the saved trailer before trying again.",
      }[code],
    );
  }
}
function fail(error: unknown): never {
  if (
    error instanceof TrailerError ||
    error instanceof PermissionError ||
    error instanceof PrivateAccessError
  )
    throw error;
  throw new TrailerError("UNAVAILABLE");
}
export async function getTrailerEditor(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(async (tx) => {
      await requirePermission(context, "catalog.manage", tx);
      const parsed = trailerTarget.safeParse(input);
      if (!parsed.success) throw new TrailerError("NOT_FOUND");
      const row = await trailerRecord(parsed.data.kind, parsed.data.id, tx);
      if (!row) throw new TrailerError("NOT_FOUND");
      return {
        ...parsed.data,
        label: row.label,
        revision: row.revision,
        archived: row.archivedAt !== null,
        trailer: storedTrailer(row),
      };
    });
  } catch (error) {
    fail(error);
  }
}
export async function changeCatalogTrailer(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    await withTransaction(
      async (tx) => {
        await requirePermission(context, "catalog.manage", tx);
        const parsed = trailerMutation.safeParse(input);
        if (!parsed.success) throw new TrailerError("INVALID_INPUT");
        const d = parsed.data;
        await lockCatalogWrites(tx);
        const actor = await requirePermission(context, "catalog.manage", tx);
        const row = await trailerRecord(d.kind, d.id, tx);
        if (!row) throw new TrailerError("NOT_FOUND");
        if (row.revision !== d.expectedRevision)
          throw new TrailerError("STALE");
        if (row.archivedAt) throw new TrailerError("ARCHIVED");
        const before = storedTrailer(row);
        if (
          JSON.stringify(before) === JSON.stringify(d.trailer) &&
          (before !== null || row.trailerProvider === null)
        )
          return;
        const next = await saveTrailer(
          d.kind,
          d.id,
          {
            trailerProvider: d.trailer?.provider ?? null,
            trailerId: d.trailer?.provider === "YOUTUBE" ? d.trailer.id : null,
            trailerUrl:
              d.trailer?.provider === "DIRECT_URL" ? d.trailer.url : null,
          },
          tx,
        );
        await appendCatalogHistory(
          d.kind,
          d.id,
          next.revision,
          actor.userId,
          [
            {
              fieldPath: "trailer",
              before: before
                ? { ...before, publicApproved: row.trailerPublicApproved }
                : row.trailerProvider !== null
                  ? {
                      provider: row.trailerProvider,
                      id: row.trailerId,
                      url: row.trailerUrl,
                      publicApproved: row.trailerPublicApproved,
                    }
                  : Prisma.JsonNull,
              after: d.trailer
                ? { ...d.trailer, publicApproved: false }
                : Prisma.JsonNull,
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
