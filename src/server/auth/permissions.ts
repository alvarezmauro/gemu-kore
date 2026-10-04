import "server-only";

import { getDatabase } from "../db/client";
import type { TransactionClient } from "../db/transaction";
import {
  canPerform,
  isFreshLogin,
  type Permission,
} from "../policies/permissions";
import { findCurrentAccessIdentity } from "../repositories/access";
import {
  PrivateAccessError,
  revalidatePrivateAccess,
  type PrivateAccessContext,
} from "./access";

export class PermissionError extends Error {
  constructor(public readonly code: "FORBIDDEN" | "REAUTHENTICATION_REQUIRED") {
    super(
      code === "REAUTHENTICATION_REQUIRED"
        ? "Sign in again before changing access grants."
        : "This operation is not permitted.",
    );
    this.name = "PermissionError";
  }
}

// The context must originate from request identity on the server. Reload policy
// here, including within the outer mutation transaction, rather than using its
// captured role. Never accept a context/role assembled from action input.
export async function requirePermission(
  context: PrivateAccessContext,
  permission: Permission,
  database?: TransactionClient,
): Promise<PrivateAccessContext> {
  try {
    const current = await revalidatePrivateAccess(context, database);
    if (!canPerform(current.role, permission))
      throw new PermissionError("FORBIDDEN");
    if (permission === "access.manage") {
      const session = await findCurrentAccessIdentity(
        current.userId,
        current.sessionId,
        database ?? getDatabase(),
      );
      if (!session) throw new PrivateAccessError("UNAUTHENTICATED");
      if (!isFreshLogin(session.createdAt, new Date()))
        throw new PermissionError("REAUTHENTICATION_REQUIRED");
    }
    return current;
  } catch (error) {
    if (error instanceof PrivateAccessError || error instanceof PermissionError)
      throw error;
    throw new PrivateAccessError("UNAVAILABLE");
  }
}
