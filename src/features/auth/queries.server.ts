import "server-only";

import { headers } from "next/headers";
import { getAuthEnv } from "@/server/config/env";
import { getAuthenticatedIdentity } from "@/server/auth/session";

export function getLoginProviders() {
  const env = getAuthEnv();
  return { google: Boolean(env?.google), github: Boolean(env?.github) };
}

export async function hasAuthenticatedIdentity() {
  return Boolean(await getAuthenticatedIdentity(await headers()));
}
