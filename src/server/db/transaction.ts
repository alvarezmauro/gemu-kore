import "server-only";

import { getDatabase } from "./client";
import type { Prisma } from "./generated/client";

export type TransactionClient = Prisma.TransactionClient;

export function withTransaction<T>(
  operation: (transaction: TransactionClient) => Promise<T>,
) {
  return getDatabase().$transaction(operation, {
    maxWait: 5_000,
    timeout: 10_000,
  });
}
