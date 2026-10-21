import "server-only";
import type { TransactionClient } from "@/server/db/transaction";
export const policySelect = {
  publicCollectionEnabled: true,
  allowSearchEngineIndexing: true,
  showSerialNumbers: true,
  showLocations: true,
  showNotes: true,
  showDefects: true,
  showPersonalPhotos: true,
  revision: true,
} as const;
export function readPolicy(tx: TransactionClient) {
  return tx.publicSettings.findUnique({
    where: { id: 1 },
    select: policySelect,
  });
}
export type Policy = NonNullable<Awaited<ReturnType<typeof readPolicy>>>;
export function siteIdentity(tx: TransactionClient) {
  return tx.appSettings.findUnique({
    where: { id: 1 },
    select: { collectionName: true, collectionDescription: true },
  });
}
