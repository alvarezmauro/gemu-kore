import { z } from "zod";

const optionalValue = (schema: z.ZodString) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    schema.optional(),
  );

export const authEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]),
    BETTER_AUTH_URL: optionalValue(z.string().url()),
    BETTER_AUTH_SECRET: optionalValue(z.string().min(32)),
    GOOGLE_CLIENT_ID: optionalValue(z.string().trim().min(1)),
    GOOGLE_CLIENT_SECRET: optionalValue(z.string().min(1)),
    GITHUB_CLIENT_ID: optionalValue(z.string().trim().min(1)),
    GITHUB_CLIENT_SECRET: optionalValue(z.string().min(1)),
  })
  .superRefine((env, context) => {
    for (const [id, secret] of [
      ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
      ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
    ] as const) {
      if (Boolean(env[id]) !== Boolean(env[secret])) {
        context.addIssue({
          code: "custom",
          path: [env[id] ? secret : id],
          message: "Provider credentials must be configured together.",
        });
      }
    }
    if (env.GOOGLE_CLIENT_ID || env.GITHUB_CLIENT_ID) {
      for (const key of ["BETTER_AUTH_URL", "BETTER_AUTH_SECRET"] as const) {
        if (!env[key])
          context.addIssue({
            code: "custom",
            path: [key],
            message: "Required for OAuth.",
          });
      }
    }
    if (env.BETTER_AUTH_URL && URL.canParse(env.BETTER_AUTH_URL)) {
      const url = new URL(env.BETTER_AUTH_URL);
      if (
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== "/" ||
        (url.protocol !== "https:" &&
          !(
            url.protocol === "http:" &&
            env.NODE_ENV !== "production" &&
            ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
          ))
      ) {
        context.addIssue({
          code: "custom",
          path: ["BETTER_AUTH_URL"],
          message:
            "Use an HTTPS origin, or a loopback HTTP origin for development.",
        });
      }
    }
  });

export type AuthEnvironment = {
  baseURL: string;
  secret: string;
  production: boolean;
  google?: { clientId: string; clientSecret: string };
  github?: { clientId: string; clientSecret: string };
};

export function configuredAuthEnvironment(
  env: z.infer<typeof authEnvironmentSchema>,
): AuthEnvironment | null {
  if (
    !env.BETTER_AUTH_URL ||
    !env.BETTER_AUTH_SECRET ||
    !(env.GOOGLE_CLIENT_ID || env.GITHUB_CLIENT_ID)
  )
    return null;
  return {
    baseURL: new URL(env.BETTER_AUTH_URL).origin,
    secret: env.BETTER_AUTH_SECRET,
    production: env.NODE_ENV === "production",
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
    ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
          },
        }
      : {}),
  };
}
