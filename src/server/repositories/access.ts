import "server-only";

import { getDatabase } from "../db/client";
import type { TransactionClient } from "../db/transaction";

export function findGrantByEmail(
  email: string,
  database: TransactionClient = getDatabase(),
) {
  return database.accessGrant.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, enabled: true },
  });
}

export function findCurrentAccessIdentity(
  userId: string,
  sessionId: string,
  database: TransactionClient,
) {
  return database.session.findFirst({
    where: { id: sessionId, userId, expiresAt: { gt: new Date() } },
    select: {
      user: { select: { id: true, email: true, emailVerified: true } },
    },
  });
}

export async function lockAccessGrantPolicy(transaction: TransactionClient) {
  // Stable two-int namespace: ASCII GEMU / ACCS. Use this lock for every
  // application grant write, before reading the current policy.
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(1195724117, 1094927187)`;
}

export function countEnabledAdministrators(transaction: TransactionClient) {
  return transaction.accessGrant.count({
    where: { role: "ADMIN", enabled: true },
  });
}

export function createAdministratorGrant(
  email: string,
  transaction: TransactionClient,
) {
  return transaction.accessGrant.create({
    data: { email, role: "ADMIN", enabled: true },
    select: { id: true },
  });
}

export function restoreAdministratorGrant(
  email: string,
  transaction: TransactionClient,
) {
  return transaction.accessGrant.upsert({
    where: { email },
    create: { email, role: "ADMIN", enabled: true },
    update: { role: "ADMIN", enabled: true },
    select: { id: true },
  });
}

export function disableGrant(email: string, transaction: TransactionClient) {
  return transaction.accessGrant.updateMany({
    where: { email },
    data: { enabled: false },
  });
}

export function revokeSessionsForEmails(
  emails: string[],
  transaction: TransactionClient,
) {
  return transaction.session.deleteMany({
    where: { user: { email: { in: emails } } },
  });
}

export function findRecoveryUser(
  userId: string,
  transaction: TransactionClient,
) {
  return transaction.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, emailVerified: true },
  });
}

export function findUserByEmail(email: string, transaction: TransactionClient) {
  return transaction.user.findUnique({
    where: { email },
    select: { id: true },
  });
}

export function rebindRecoveryUserEmail(
  userId: string,
  email: string,
  transaction: TransactionClient,
) {
  // Retain verification state and stable User/Account IDs; never create proof.
  return transaction.user.update({
    where: { id: userId },
    data: { email },
    select: { id: true },
  });
}
