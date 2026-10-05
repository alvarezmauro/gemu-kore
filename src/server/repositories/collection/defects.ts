import "server-only";

import { getDatabase } from "../../db/client";
import type { TransactionClient } from "../../db/transaction";
import type { DefectSeverity, DefectStatus } from "../../db/generated/client";

const identity = {
  id: true,
  type: true,
  ownedConsole: {
    select: {
      consoleModel: {
        select: { name: true, platform: { select: { name: true } } },
      },
    },
  },
  ownedGame: {
    select: {
      gameRelease: {
        select: {
          editionName: true,
          game: { select: { name: true } },
          platform: { select: { name: true } },
        },
      },
    },
  },
  ownedAccessory: {
    select: {
      accessoryVariant: {
        select: { name: true, accessory: { select: { name: true } } },
      },
    },
  },
} as const;
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
export function listDefectItemOptions(
  database: TransactionClient = getDatabase(),
) {
  return database.collectionItem.findMany({
    select: identity,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}
export function findDefectItem(
  id: string,
  database: TransactionClient = getDatabase(),
) {
  return database.collectionItem.findUnique({
    where: { id },
    select: { ...identity, revision: true, publicationStatus: true },
  });
}
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
export async function lockDefectItem(
  id: string,
  transaction: TransactionClient,
) {
  await transaction.$queryRaw`SELECT id FROM collection_item WHERE id = ${id}::uuid FOR UPDATE`;
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
export function advanceDefectItem(
  id: string,
  revision: number,
  actorId: string,
  unpublish: boolean,
  transaction: TransactionClient,
) {
  return transaction.collectionItem.updateMany({
    where: { id, revision },
    data: {
      revision: { increment: 1 },
      updatedById: actorId,
      ...(unpublish
        ? {
            publicationStatus: "PRIVATE",
            publishedAt: null,
            publishedById: null,
          }
        : {}),
    },
  });
}
