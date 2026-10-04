import "server-only";

import {
  github,
  google,
  verifyGoogleIdToken,
} from "better-auth/social-providers";
import type { OAuthProvider } from "better-auth";
import type { AuthEnvironment } from "../config/auth-env";
import type { PrismaClient } from "../db/generated/client";
import { normalizeVerifiedEmail } from "./email";

// Delegate token exchange/profile retrieval to the built-in providers. This
// seam runs before first-user creation AND before a returning session is issued.
function guardProvider<Profile extends object>(
  database: PrismaClient,
  provider: Pick<
    OAuthProvider<Profile>,
    "id" | "accountSubject" | "getUserInfo"
  >,
) {
  return async (tokens: Parameters<typeof provider.getUserInfo>[0]) => {
    const result = await provider.getUserInfo(tokens);
    if (!result) return null;
    const subject = await provider.accountSubject({
      tokens,
      profile: result.data,
    });
    if (
      !["string", "number"].includes(typeof subject) ||
      (typeof subject === "number" && !Number.isFinite(subject)) ||
      !String(subject).trim()
    )
      return null;
    const binding = await database.account.findUnique({
      where: {
        providerId_accountId: {
          providerId: provider.id,
          accountId: String(subject),
        },
      },
      select: {
        userId: true,
        user: { select: { email: true, emailVerified: true } },
      },
    });
    const email = normalizeVerifiedEmail(result.user.email);
    if (
      result.user.emailVerified !== true ||
      !email ||
      (binding && (!binding.user.emailVerified || binding.user.email !== email))
    ) {
      if (binding)
        await database.session.deleteMany({
          where: { userId: binding.userId },
        });
      return null;
    }
    return { ...result, user: { ...result.user, email } };
  };
}

export function createSocialProviders(
  database: PrismaClient,
  env: AuthEnvironment,
) {
  const googleOptions = env.google && {
    ...env.google,
    disableIdTokenSignIn: true,
    requireEmailVerification: true,
    overrideUserInfoOnSignIn: false,
    accessType: "online" as const,
    includeGrantedScopes: false,
  };
  const githubOptions = env.github && {
    ...env.github,
    disableIdTokenSignIn: true,
    requireEmailVerification: true,
    overrideUserInfoOnSignIn: false,
  };
  const googleProvider = googleOptions && google(googleOptions);
  const guardedGoogle =
    googleProvider && guardProvider(database, googleProvider);
  return {
    ...(googleOptions && guardedGoogle
      ? {
          google: {
            ...googleOptions,
            getUserInfo: async (
              tokens: Parameters<typeof guardedGoogle>[0],
            ) => {
              // The redirect provider decodes the token returned by Google's HTTPS
              // endpoint. Invoke the exported library verifier as well, so this
              // boundary explicitly checks signature, issuer, audience and expiry.
              if (
                !tokens.idToken ||
                !(await verifyGoogleIdToken({
                  token: tokens.idToken,
                  audience: googleOptions.clientId,
                  nonce: tokens.expectedIdTokenNonce,
                }))
              )
                return null;
              return guardedGoogle(tokens);
            },
          },
        }
      : {}),
    ...(githubOptions
      ? {
          github: {
            ...githubOptions,
            getUserInfo: guardProvider(database, github(githubOptions)),
          },
        }
      : {}),
  };
}
