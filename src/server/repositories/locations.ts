import "server-only";

import { getDatabase } from "../db/client";
import type { TransactionClient } from "../db/transaction";
import type { LocationType } from "../db/generated/client";

const select = {
  id: true,
  parentId: true,
  name: true,
  type: true,
  description: true,
  sortOrder: true,
  updatedAt: true,
  _count: { select: { children: true, items: true } },
} as const;

export function listLocationRecords(
  database: TransactionClient = getDatabase(),
) {
  return database.location.findMany({
    select,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
}
export async function lockLocationHierarchy(transaction: TransactionClient) {
  // ASCII GEMU / LOCA. Every hierarchy write takes this transaction-scoped lock.
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(1195724117, 1280262977)`;
}
export async function normalizeLocationName(
  name: string,
  transaction: TransactionClient,
) {
  // Use the database's own casing rule, including non-ASCII names, to match its constraint.
  const [row] = await transaction.$queryRaw<
    { normalized: string }[]
  >`SELECT lower(btrim(${name}::text)) AS normalized`;
  return row.normalized;
}
type LocationFields = {
  name: string;
  normalizedName: string;
  parentId: string | null;
  type: LocationType;
  description: string | null;
  sortOrder: number;
};
export function insertLocation(
  data: LocationFields,
  transaction: TransactionClient,
) {
  return transaction.location.create({ data, select });
}
export function updateLocationRecord(
  id: string,
  data: Partial<LocationFields> & { updatedAt: Date },
  transaction: TransactionClient,
) {
  return transaction.location.update({ where: { id }, data, select });
}
export function removeLocation(id: string, transaction: TransactionClient) {
  return transaction.location.delete({ where: { id }, select: { id: true } });
}
