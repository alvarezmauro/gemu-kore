import "server-only";

import { getDatabase } from "./client";
import type { Prisma } from "./generated/client";
import {
  failureCode,
  operationalFailure,
  withLogContext,
} from "../observability/events";

export type TransactionClient = Prisma.TransactionClient;

export function withTransaction<T>(
  operation: (transaction: TransactionClient) => Promise<T>,
  options: {
    isolationLevel?: Prisma.TransactionIsolationLevel;
    timeout?: number;
    maxWait?: number;
    publicationPolicy?: "shared" | "exclusive" | "read";
  } = {},
) {
  const { publicationPolicy = "shared", ...transactionOptions } = options;
  return withLogContext(async () => {
    try {
      return await getDatabase().$transaction(
        async (tx) => {
          // Enter before domain locks in every application transaction. Centralizing
          // this also covers catalog, location, upload attachment and future writers.
          // Public snapshot-only reads opt out; settings writes use the exclusive side.
          if (publicationPolicy === "exclusive")
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(1195724117, 1347764802)::text`;
          else if (publicationPolicy === "shared")
            await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(1195724117, 1347764802)::text`;
          else await tx.$executeRaw`SET TRANSACTION READ ONLY`;
          return operation(tx);
        },
        {
          maxWait: 5_000,
          timeout: 10_000,
          ...transactionOptions,
        },
      );
    } catch (error) {
      if (["UNEXPECTED", "DATABASE_QUERY_FAILED"].includes(failureCode(error)))
        operationalFailure("database.transaction", error);
      throw error;
    }
  });
}
