import "server-only";

import { getAuth } from "./index";
import { normalizeVerifiedEmail } from "./email";

export async function getAuthenticatedIdentity(requestHeaders: Headers) {
  const auth = getAuth();
  if (!auth) return null;
  const result = await auth.api.getSession({
    headers: requestHeaders,
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (
    !result ||
    !result.user.emailVerified ||
    result.session.expiresAt.getTime() <= Date.now()
  )
    return null;
  const email = normalizeVerifiedEmail(result.user.email);
  if (!email || email !== result.user.email) return null;
  // Identity only. Never use this result as permission to read collection data.
  return { userId: result.user.id, sessionId: result.session.id, email };
}
