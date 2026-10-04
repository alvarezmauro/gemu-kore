import { isAccessRole } from "@/features/auth/contracts";

// Pure policy only. A role value is never proof of authenticated access;
// services must use the server auth guard before invoking repositories.
export const permissions = [
  "private.read",
  "collection.manage",
  "media.manage",
  "enrichment.suggest",
  "catalog.manage",
  "enrichment.accept",
  "publication.manage",
  "settings.manage",
  "access.read",
  "access.manage",
] as const;
export type Permission = (typeof permissions)[number];

const editorPermissions: readonly Permission[] = [
  "private.read",
  "collection.manage",
  "media.manage",
  "enrichment.suggest",
];

export function canPerform(role: unknown, permission: unknown): boolean {
  if (
    !isAccessRole(role) ||
    !permissions.some((allowed) => allowed === permission)
  )
    return false;
  if (role === "ADMIN") return true;
  if (role === "VIEWER") return permission === "private.read";
  return editorPermissions.some((allowed) => allowed === permission);
}

export const freshLoginWindowMs = 5 * 60 * 1000;

export function isFreshLogin(createdAt: Date, now: Date): boolean {
  const age = now.getTime() - createdAt.getTime();
  return Number.isFinite(age) && age >= 0 && age <= freshLoginWindowMs;
}
