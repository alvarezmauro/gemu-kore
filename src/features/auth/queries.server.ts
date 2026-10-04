import "server-only";

import { headers } from "next/headers";
import { getAuthEnv } from "@/server/config/env";
import { PrivateAccessError } from "@/server/auth/access";
import { getPrivateWelcome } from "@/server/services/access";

export function getLoginProviders() {
  const env = getAuthEnv();
  return { google: Boolean(env?.google), github: Boolean(env?.github) };
}

export async function getPrivateWelcomePageData() {
  try {
    return {
      status: "authorized" as const,
      welcome: await getPrivateWelcome(await headers()),
    };
  } catch (error) {
    if (error instanceof PrivateAccessError) return { status: error.code };
    throw error;
  }
}
