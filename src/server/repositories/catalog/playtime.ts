import "server-only";
import type { TransactionClient } from "@/server/db/transaction";
import type { PlaytimeSourceType } from "@/server/db/generated/client";
export const playtimeSelect = {
  mainMinutes: true,
  mainExtrasMinutes: true,
  completionistMinutes: true,
  sourceType: true,
  sourceName: true,
  sourceUrl: true,
  observedAt: true,
  updatedAt: true,
} as const;
type Kind = "game" | "release";
export async function playtimeRecord(
  kind: Kind,
  id: string,
  tx: TransactionClient,
) {
  const select = {
    id: true,
    revision: true,
    archivedAt: true,
    slug: true,
    playtime: { select: playtimeSelect },
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
export async function savePlaytime(
  kind: Kind,
  id: string,
  estimates: {
    mainMinutes: number | null;
    mainExtrasMinutes: number | null;
    completionistMinutes: number | null;
    sourceType: PlaytimeSourceType;
    sourceName: string;
    sourceUrl: string | null;
    observedAt: Date;
  } | null,
  tx: TransactionClient,
) {
  const where = kind === "game" ? { gameId: id } : { gameReleaseId: id };
  if (estimates)
    await tx.gamePlaytime.upsert({
      where,
      create: { ...where, ...estimates },
      update: estimates,
    });
  else await tx.gamePlaytime.deleteMany({ where });
  return kind === "game"
    ? tx.game.update({
        where: { id },
        data: { revision: { increment: 1 } },
        select: { revision: true },
      })
    : tx.gameRelease.update({
        where: { id },
        data: { revision: { increment: 1 } },
        select: { revision: true },
      });
}
