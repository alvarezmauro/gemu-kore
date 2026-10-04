import { createHmac } from "node:crypto";

// Test fixture credential for a real database session, never an app auth bypass.
export function signedSessionCookie(token: string, secret: string) {
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return encodeURIComponent(`${token}.${signature}`);
}
