import "server-only";

import { getAuthEnv } from "../config/env";
import { getDatabase } from "../db/client";
import { createAuth } from "./config";

let auth: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  const env = getAuthEnv();
  if (!env) return null;
  auth ??= createAuth(getDatabase(), env);
  return auth;
}
