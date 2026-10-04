import "server-only";

import { getDatabase } from "@/server/db/client";
import type { TransactionClient } from "@/server/db/transaction";

// Server-local identity records, not form options or public projections.
// Preserve archived identities so services can resolve existing copy references.
export function findConsoleModelIdentity(
  id: string,
  database: TransactionClient = getDatabase(),
) {
  return database.consoleModel.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      revision: true,
      archivedAt: true,
      identificationStatus: true,
      platform: { select: { id: true, name: true, archivedAt: true } },
    },
  });
}

export function findGameReleaseIdentity(
  id: string,
  database: TransactionClient = getDatabase(),
) {
  return database.gameRelease.findUnique({
    where: { id },
    select: {
      id: true,
      revision: true,
      archivedAt: true,
      identificationStatus: true,
      game: { select: { id: true, name: true, archivedAt: true } },
      platform: { select: { id: true, name: true, archivedAt: true } },
    },
  });
}

export function findAccessoryVariantIdentity(
  id: string,
  database: TransactionClient = getDatabase(),
) {
  return database.accessoryVariant.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      revision: true,
      archivedAt: true,
      identificationStatus: true,
      accessory: { select: { id: true, name: true, archivedAt: true } },
    },
  });
}
