import "server-only";

import { z } from "zod";
import {
  accessRoles,
  type PrivateWelcome,
  type AccessGrantSummary,
} from "@/features/auth/contracts";
import {
  requirePrivateAccess,
  type PrivateAccessContext,
} from "../auth/access";
import { requirePermission } from "../auth/permissions";
import { normalizeVerifiedEmail } from "../auth/email";
import { withTransaction, type TransactionClient } from "../db/transaction";
import {
  countEnabledAdministrators,
  createAdministratorGrant,
  deleteGrant,
  disableGrant,
  findGrantByEmail,
  findGrantById,
  findRecoveryUser,
  findUserByEmail,
  lockAccessGrantPolicy,
  listGrants,
  insertGrant,
  rebindRecoveryUserEmail,
  restoreAdministratorGrant,
  revokeSessionsForEmails,
  updateGrant,
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
  const context = await requirePermission(
    await requirePrivateAccess(requestHeaders),
    "private.read",
  );
  return { role: context.role };
}

export class GrantManagementError extends Error {
  constructor(
    public readonly code:
      "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "LAST_ADMIN",
  ) {
    const messages = {
      INVALID_INPUT: "Invalid access grant input.",
      NOT_FOUND: "Access grant not found.",
      CONFLICT: "This email already has an access grant.",
      LAST_ADMIN: "Keep at least one enabled administrator.",
    };
    super(messages[code]);
    this.name = "GrantManagementError";
  }
}

const createGrantInput = z
  .object({
    email: emailInput,
    role: z.enum(accessRoles),
    enabled: z.boolean().default(false),
  })
  .strict();
const updateGrantInput = z
  .object({
    id: z.uuid(),
    role: z.enum(accessRoles),
    enabled: z.boolean(),
  })
  .strict();
const deleteGrantInput = z.object({ id: z.uuid() }).strict();

function grantSummary(grant: AccessGrantSummary): AccessGrantSummary {
  return {
    id: grant.id,
    email: grant.email,
    role: grant.role,
    enabled: grant.enabled,
  };
}

export async function listAccessGrants(
  context: PrivateAccessContext,
): Promise<AccessGrantSummary[]> {
  await requirePermission(context, "access.read");
  return (await listGrants()).map(grantSummary);
}

export async function createAccessGrant(
  context: PrivateAccessContext,
  input: unknown,
): Promise<AccessGrantSummary> {
  return withAccessGrantTransaction(async (transaction) => {
    await requirePermission(context, "access.manage", transaction);
    const parsed = createGrantInput.safeParse(input);
    if (!parsed.success) throw new GrantManagementError("INVALID_INPUT");
    if (await findGrantByEmail(parsed.data.email, transaction))
      throw new GrantManagementError("CONFLICT");
    return grantSummary(await insertGrant(parsed.data, transaction));
  });
}

async function checkAdministratorRemoval(
  existing: AccessGrantSummary,
  replacement: { role: string; enabled: boolean } | null,
  transaction: TransactionClient,
) {
  if (
    existing.enabled &&
    existing.role === "ADMIN" &&
    !(replacement?.enabled && replacement.role === "ADMIN") &&
    (await countEnabledAdministrators(transaction)) <= 1
  )
    throw new GrantManagementError("LAST_ADMIN");
}

export async function updateAccessGrant(
  context: PrivateAccessContext,
  input: unknown,
): Promise<AccessGrantSummary> {
  return withAccessGrantTransaction(async (transaction) => {
    await requirePermission(context, "access.manage", transaction);
    const parsed = updateGrantInput.safeParse(input);
    if (!parsed.success) throw new GrantManagementError("INVALID_INPUT");
    const { id, role, enabled } = parsed.data;
    const existing = await findGrantById(id, transaction);
    if (!existing) throw new GrantManagementError("NOT_FOUND");
    await checkAdministratorRemoval(existing, { role, enabled }, transaction);
    return grantSummary(await updateGrant(id, { role, enabled }, transaction));
  });
}

export async function deleteAccessGrant(
  context: PrivateAccessContext,
  input: unknown,
): Promise<{ id: string }> {
  return withAccessGrantTransaction(async (transaction) => {
    await requirePermission(context, "access.manage", transaction);
    const parsed = deleteGrantInput.safeParse(input);
    if (!parsed.success) throw new GrantManagementError("INVALID_INPUT");
    const existing = await findGrantById(parsed.data.id, transaction);
    if (!existing) throw new GrantManagementError("NOT_FOUND");
    await checkAdministratorRemoval(existing, null, transaction);
    return await deleteGrant(existing.id, transaction);
  });
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
