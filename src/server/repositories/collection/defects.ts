import "server-only";

import { getDatabase } from "../../db/client";
import type { TransactionClient } from "../../db/transaction";
import type { DefectSeverity, DefectStatus } from "../../db/generated/client";

const defectSelect = {
  id: true,
  collectionItemId: true,
  title: true,
  description: true,
  severity: true,
  status: true,
  resolvedAt: true,
  repairNote: true,
  createdAt: true,
  updatedAt: true,
} as const;
export function listItemDefects(
  collectionItemId: string,
  database: TransactionClient = getDatabase(),
) {
  return database.defect.findMany({
    where: { collectionItemId },
    select: defectSelect,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}
export function findItemDefect(
  id: string,
  collectionItemId: string,
  transaction: TransactionClient,
) {
  return transaction.defect.findFirst({
    where: { id, collectionItemId },
    select: defectSelect,
  });
}
type DefectFields = {
  title: string;
  description: string | null;
  severity: DefectSeverity;
  status: DefectStatus;
  resolvedAt: Date | null;
  repairNote: string | null;
};
export function insertDefect(
  collectionItemId: string,
  data: DefectFields,
  transaction: TransactionClient,
) {
  return transaction.defect.create({
    data: { collectionItemId, ...data },
    select: defectSelect,
  });
}
export function updateDefectRecord(
  id: string,
  data: DefectFields,
  transaction: TransactionClient,
) {
  return transaction.defect.update({
    where: { id },
    data,
    select: defectSelect,
  });
}
export function removeDefectRecord(id: string, transaction: TransactionClient) {
  return transaction.defect.delete({ where: { id }, select: { id: true } });
}
export function readDefectPublicationPolicy(transaction: TransactionClient) {
  return transaction.publicSettings.findUniqueOrThrow({
    where: { id: 1 },
    select: { showDefects: true },
  });
}

export {
  listCollectionItemOptions as listDefectItemOptions,
  findCollectionItem as findDefectItem,
  lockCollectionItem as lockDefectItem,
  advanceCollectionItem as advanceDefectItem,
} from "./items";
