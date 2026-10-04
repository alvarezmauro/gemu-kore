import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import type { AuthEnvironment } from "../config/auth-env";
import type { PrismaClient } from "../db/generated/client";
import { createSocialProviders } from "./providers";

export function createAuth(database: PrismaClient, env: AuthEnvironment) {
  return betterAuth({
    appName: "GemuKore",
    baseURL: env.baseURL,
    basePath: "/api/auth",
    secret: env.secret,
    trustedOrigins: [env.baseURL],
    database: prismaAdapter(database, {
      provider: "postgresql",
      transaction: true,
    }),
    socialProviders: createSocialProviders(database, env),
    emailAndPassword: { enabled: false },
    user: { changeEmail: { enabled: false }, deleteUser: { enabled: false } },
    account: {
      encryptOAuthTokens: true,
      storeStateStrategy: "database",
      storeAccountCookie: false,
      accountLinking: {
        enabled: false,
        disableImplicitLinking: true,
        trustedProviders: [],
        allowDifferentEmails: false,
      },
    },
    session: {
      expiresIn: 7 * 24 * 60 * 60,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    advanced: {
      database: { generateId: "uuid" },
      cookiePrefix: "gemukore",
      useSecureCookies: env.production,
      disableOriginCheck: false,
      disableCSRFCheck: false,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
      // No proxy headers are trusted until a deployment proxy is configured.
      ipAddress: { ipAddressHeaders: [] },
    },
    rateLimit: { enabled: env.production, storage: "memory" },
    hooks: {
      before: createAuthMiddleware(async (context) => {
        // Require the exact browser origin even for the first login, when
        // there is no cookie yet. OAuth callbacks retain library state checks.
        if (
          context.request &&
          ["/sign-in/social", "/sign-out"].includes(context.path) &&
          context.request.headers.get("origin") !== env.baseURL
        ) {
          throw new APIError("FORBIDDEN", {
            code: "INVALID_ORIGIN",
            message: "Invalid request origin.",
          });
        }
      }),
    },
    disabledPaths: [
      "/sign-up/email",
      "/sign-in/email",
      "/link-social",
      "/unlink-account",
      "/change-email",
      "/update-user",
      "/delete-user",
      "/delete-user/callback",
      "/change-password",
      "/set-password",
      "/request-password-reset",
      "/reset-password",
      "/send-verification-email",
      "/verify-email",
      "/get-access-token",
      "/refresh-token",
      "/account-info",
      "/get-session",
      "/list-sessions",
      "/list-accounts",
      // No browser session-management UI exists. Keep session mutation and
      // potential additional-field responses behind reviewed server services.
      "/update-session",
      "/revoke-session",
      "/revoke-sessions",
      "/revoke-other-sessions",
    ],
    onAPIError: {
      errorURL: `${env.baseURL}/login`,
      onError: () => console.error("Authentication request failed."),
    },
    // SDK errors may include provider payloads. Keep those out of app logs.
    logger: {
      level: "error",
      log: () => console.error("Authentication operation failed."),
    },
  });
}
