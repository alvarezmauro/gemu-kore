import "server-only";
import type { TransactionClient } from "@/server/db/transaction";
const metadataSourceSelect = {
  origin: true,
  sourceSnapshot: true,
  snapshotSchemaVersion: true,
  createdAt: true,
} as const;
export function latestFieldSources(
  kind: "game" | "release",
  id: string,
  fields: string[],
  tx: TransactionClient,
) {
  return tx.metadataChange.findMany({
    where: {
      ...(kind === "game" ? { gameId: id } : { gameReleaseId: id }),
      fieldPath: { in: fields },
    },
    select: { ...metadataSourceSelect, fieldPath: true, after: true },
    distinct: ["fieldPath"],
    orderBy: [{ rootRevision: "desc" }, { fieldPath: "asc" }],
    take: fields.length,
  });
}
export const assetSourceSelect = {
  sourceType: true,
  provider: true,
  sourceUrl: true,
  author: true,
  licenseName: true,
  licenseUrl: true,
  attribution: true,
  usageRestrictions: true,
  retrievedAt: true,
} as const;
