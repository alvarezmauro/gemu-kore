import "server-only";
import {
  withTransaction,
  type TransactionClient,
} from "@/server/db/transaction";
import {
  readPolicy,
  type Policy,
} from "@/server/repositories/public-collection/policy";
export class PublicCollectionError extends Error {
  constructor(
    public readonly code:
      "NOT_FOUND" | "INVALID_INPUT" | "UNAVAILABLE" | "STALE",
  ) {
    super(
      {
        NOT_FOUND: "This page is unavailable.",
        INVALID_INPUT: "Check the public collection request.",
        UNAVAILABLE: "The collection is unavailable right now.",
        STALE: "The reviewed content changed. Review it again before saving.",
      }[code],
    );
    this.name = "PublicCollectionError";
  }
}
export function publicRead<T>(
  operation: (tx: TransactionClient, policy: Policy | null) => Promise<T>,
) {
  return withTransaction(async (tx) => operation(tx, await readPolicy(tx)), {
    isolationLevel: "RepeatableRead",
    publicationPolicy: "read",
  }).catch((error: unknown) => {
    if (error instanceof PublicCollectionError) throw error;
    throw new PublicCollectionError("UNAVAILABLE");
  });
}
export function enabled(policy: Policy | null): asserts policy is Policy {
  if (!policy?.publicCollectionEnabled)
    throw new PublicCollectionError("NOT_FOUND");
}
export function count(value: bigint) {
  if (value < BigInt(0) || value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new PublicCollectionError("UNAVAILABLE");
  return Number(value);
}
