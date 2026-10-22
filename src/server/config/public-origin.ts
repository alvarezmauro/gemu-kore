import "server-only";
import { authEnvironmentSchema } from "./auth-env";
// Canonical output trusts the configured application origin, never request Host
// or forwarding headers. Publication does not depend on provider credentials.
export function publicOrigin(): string | null {
  const p = authEnvironmentSchema.safeParse(process.env);
  return p.success && p.data.BETTER_AUTH_URL
    ? new URL(p.data.BETTER_AUTH_URL).origin
    : null;
}
