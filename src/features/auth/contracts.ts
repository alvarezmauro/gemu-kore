export const accessRoles = ["ADMIN", "EDITOR", "VIEWER"] as const;
export type AccessRole = (typeof accessRoles)[number];

export function isAccessRole(value: unknown): value is AccessRole {
  return accessRoles.some((role) => role === value);
}

export type PrivateWelcome = { role: AccessRole };

export type AccessGrantSummary = {
  id: string;
  email: string;
  role: AccessRole;
  enabled: boolean;
};
