import "server-only";

import { isAccessRole, type AccessRole } from "@/features/auth/contracts";
import { getDatabase } from "../db/client";
import type { TransactionClient } from "../db/transaction";
import {
  findCurrentAccessIdentity,
  findGrantByEmail,
} from "../repositories/access";
import { normalizeVerifiedEmail } from "./email";
import { getAuthenticatedIdentity } from "./session";

const trustedAccess = Symbol("server-created private access");

export type PrivateAccessContext = Readonly<{
  userId: string;
  sessionId: string;
  grantId: string;
  email: string;
  role: AccessRole;
  [trustedAccess]: true;
}>;

export class PrivateAccessError extends Error {
  constructor(
    public readonly code: "UNAUTHENTICATED" | "DENIED" | "UNAVAILABLE",
  ) {
    super("Private access is unavailable.");
    this.name = "PrivateAccessError";
  }
}

async function resolveGrant(
  identity: { userId: string; sessionId: string; email: string },
  database?: TransactionClient,
): Promise<PrivateAccessContext> {
  const grant = await findGrantByEmail(identity.email, database);
  if (!grant?.enabled || !isAccessRole(grant.role))
    throw new PrivateAccessError("DENIED");
  return Object.freeze({
    ...identity,
    grantId: grant.id,
    role: grant.role,
    [trustedAccess]: true as const,
  });
}

export async function requirePrivateAccess(
  requestHeaders: Headers,
): Promise<PrivateAccessContext> {
  try {
    const identity = await getAuthenticatedIdentity(requestHeaders);
    if (!identity) throw new PrivateAccessError("UNAUTHENTICATED");
    return await resolveGrant(identity);
  } catch (error) {
    if (error instanceof PrivateAccessError) throw error;
    // Database/provider internals must never become a private-access DTO.
    throw new PrivateAccessError("UNAVAILABLE");
  }
}

// Future mutation services call this using their transaction before any write.
// An earlier render's role, enablement or session lifetime is not authority.
export async function revalidatePrivateAccess(
  context: PrivateAccessContext,
  database?: TransactionClient,
): Promise<PrivateAccessContext> {
  try {
    if (context?.[trustedAccess] !== true)
      throw new PrivateAccessError("DENIED");
    const current = await findCurrentAccessIdentity(
      context.userId,
      context.sessionId,
      database ?? getDatabase(),
    );
    const email = normalizeVerifiedEmail(current?.user.email);
    if (
      !current?.user.emailVerified ||
      !email ||
      email !== current.user.email ||
      email !== context.email
    )
      throw new PrivateAccessError("UNAUTHENTICATED");
    return await resolveGrant(
      { userId: context.userId, sessionId: context.sessionId, email },
      database,
    );
  } catch (error) {
    if (error instanceof PrivateAccessError) throw error;
    throw new PrivateAccessError("UNAVAILABLE");
  }
}
