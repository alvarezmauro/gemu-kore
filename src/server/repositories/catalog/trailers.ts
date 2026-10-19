import "server-only";
import type { TransactionClient } from "@/server/db/transaction";
import type { TrailerProvider } from "@/server/db/generated/client";
export const trailerSelect = {
  trailerProvider: true,
  trailerId: true,
  trailerUrl: true,
  trailerPublicApproved: true,
} as const;
type Kind = "game" | "release";
export async function trailerRecord(
  kind: Kind,
  id: string,
  tx: TransactionClient,
) {
  const select = {
    id: true,
    revision: true,
    archivedAt: true,
    slug: true,
    ...trailerSelect,
  } as const;
  if (kind === "game") {
    const row = await tx.game.findUnique({
      where: { id },
      select: { ...select, name: true },
    });
    return row && { ...row, label: `${row.name} · ${row.slug}` };
  }
  const row = await tx.gameRelease.findUnique({
    where: { id },
    select: {
      ...select,
      game: { select: { name: true } },
      platform: { select: { name: true } },
    },
  });
  return (
    row && {
      ...row,
      label: `${row.game.name} · ${row.platform.name} · ${row.slug}`,
    }
  );
}
export async function saveTrailer(
  kind: Kind,
  id: string,
  trailer: {
    trailerProvider: TrailerProvider | null;
    trailerId: string | null;
    trailerUrl: string | null;
  },
  tx: TransactionClient,
) {
  const data = {
    ...trailer,
    trailerPublicApproved: false,
    revision: { increment: 1 },
  };
  return kind === "game"
    ? tx.game.update({ where: { id }, data, select: { revision: true } })
    : tx.gameRelease.update({
        where: { id },
        data,
        select: { revision: true },
      });
}
