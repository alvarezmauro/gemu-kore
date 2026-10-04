import "server-only";

import { z } from "zod";
import type { PrivateWelcome } from "@/features/auth/contracts";
import { requirePrivateAccess } from "../auth/access";
import { normalizeVerifiedEmail } from "../auth/email";
import { withTransaction, type TransactionClient } from "../db/transaction";
import {
  countEnabledAdministrators,
  createAdministratorGrant,
  disableGrant,
  findGrantByEmail,
  findRecoveryUser,
  findUserByEmail,
  lockAccessGrantPolicy,
  rebindRecoveryUserEmail,
  restoreAdministratorGrant,
  revokeSessionsForEmails,
} from "../repositories/access";

export class GrantSetupError extends Error {
  constructor(
    public readonly code:
      "INVALID_INPUT" | "ADMIN_EXISTS" | "GRANT_CONFLICT" | "IDENTITY_CONFLICT",
  ) {
    const messages = {
      INVALID_INPUT:
        "Invalid setup input. Supply a valid email and the required operator details.",
      ADMIN_EXISTS:
        "An enabled administrator already exists. Bootstrap cannot add another administrator.",
      GRANT_CONFLICT:
        "This email already has a disabled or differently roled grant. Use explicit operator recovery.",
      IDENTITY_CONFLICT:
        "Identity recovery does not match the previous verified user, or the target email belongs to another user.",
    };
    super(messages[code]);
    this.name = "GrantSetupError";
  }
}

const emailInput = z.unknown().transform((value, context) => {
  const email = normalizeVerifiedEmail(value);
  if (!email) {
    context.addIssue({ code: "custom", message: "Invalid email." });
    return z.NEVER;
  }
  return email;
});
const operatorInput = z.string().trim().min(1).max(200);
const bootstrapInput = z
  .object({ email: emailInput, operator: operatorInput })
  .strict();
const recoveryInput = z
  .object({
    email: emailInput,
    previousEmail: emailInput.optional(),
    rebindUserId: z.uuid().optional(),
    operator: operatorInput,
    reason: z.string().trim().min(1).max(500),
  })
  .strict()
  .refine(
    (input) =>
      !input.rebindUserId ||
      (input.previousEmail && input.previousEmail !== input.email),
  );

export function withAccessGrantTransaction<T>(
  operation: (transaction: TransactionClient) => Promise<T>,
) {
  return withTransaction(
    async (transaction) => {
      await lockAccessGrantPolicy(transaction);
      return operation(transaction);
    },
    { isolationLevel: "ReadCommitted" },
  );
}

export async function getPrivateWelcome(
  requestHeaders: Headers,
): Promise<PrivateWelcome> {
  const context = await requirePrivateAccess(requestHeaders);
  return { role: context.role };
}

// Local operator use only. No route or Server Action exports these operations.
export async function bootstrapAdministrator(input: unknown) {
  const parsed = bootstrapInput.safeParse(input);
  if (!parsed.success) throw new GrantSetupError("INVALID_INPUT");
  const { email, operator } = parsed.data;
  const result = await withAccessGrantTransaction(async (transaction) => {
    const existing = await findGrantByEmail(email, transaction);
    if (existing?.enabled && existing.role === "ADMIN")
      return { grantId: existing.id, outcome: "unchanged" as const };
    if (await countEnabledAdministrators(transaction))
      throw new GrantSetupError("ADMIN_EXISTS");
    if (existing) throw new GrantSetupError("GRANT_CONFLICT");
    const created = await createAdministratorGrant(email, transaction);
    return { grantId: created.id, outcome: "created" as const };
  });
  return {
    action: "bootstrap-admin",
    ...result,
    email,
    role: "ADMIN",
    enabled: true,
    operator,
    performedAt: new Date().toISOString(),
  };
}

export async function recoverAdministrator(input: unknown) {
  const parsed = recoveryInput.safeParse(input);
  if (!parsed.success) throw new GrantSetupError("INVALID_INPUT");
  const { email, previousEmail, rebindUserId, operator, reason } = parsed.data;
  const result = await withAccessGrantTransaction(async (transaction) => {
    if (rebindUserId) {
      const user = await findRecoveryUser(rebindUserId, transaction);
      const targetUser = await findUserByEmail(email, transaction);
      if (
        !user?.emailVerified ||
        user.email !== previousEmail ||
        (targetUser && targetUser.id !== user.id)
      )
        throw new GrantSetupError("IDENTITY_CONFLICT");
    }
    const grant = await restoreAdministratorGrant(email, transaction);
    if (previousEmail && previousEmail !== email)
      await disableGrant(previousEmail, transaction);
    const revoked = await revokeSessionsForEmails(
      previousEmail ? [email, previousEmail] : [email],
      transaction,
    );
    if (rebindUserId)
      await rebindRecoveryUserEmail(rebindUserId, email, transaction);
    return { grantId: grant.id, revokedSessions: revoked.count };
  });
  return {
    action: "recover-admin",
    ...result,
    outcome: "restored",
    email,
    previousEmail: previousEmail ?? null,
    reboundUserId: rebindUserId ?? null,
    role: "ADMIN",
    enabled: true,
    operator,
    reason,
    performedAt: new Date().toISOString(),
  };
}
