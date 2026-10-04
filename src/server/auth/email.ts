import { z } from "zod";

const emailSchema = z.email();

export function normalizeVerifiedEmail(value: unknown): string | null {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/.test(value))
    return null;
  const result = emailSchema.safeParse(value.trim().toLowerCase());
  return result.success ? result.data : null;
}
