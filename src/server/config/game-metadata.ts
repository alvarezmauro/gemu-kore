import "server-only";

import { z } from "zod";

const credential = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z
    .string()
    .min(1)
    .max(1024)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
);

export const gameMetadataEnvironmentSchema = z
  .object({ IGDB_CLIENT_ID: credential, IGDB_CLIENT_SECRET: credential })
  .superRefine((env, context) => {
    if (Boolean(env.IGDB_CLIENT_ID) !== Boolean(env.IGDB_CLIENT_SECRET)) {
      context.addIssue({
        code: "custom",
        path: [env.IGDB_CLIENT_ID ? "IGDB_CLIENT_SECRET" : "IGDB_CLIENT_ID"],
        message: "Configure both metadata provider credentials together.",
      });
    }
  });

export type GameMetadataConfiguration = {
  clientId: string;
  clientSecret: string;
};

// Optional capability: invalid provider configuration must not disable manual flows.
// Validate on explicit use, and report field names without credential values.
export function getGameMetadataConfiguration(): GameMetadataConfiguration | null {
  const result = gameMetadataEnvironmentSchema.safeParse(process.env);
  if (!result.success)
    throw new Error(
      `Invalid metadata environment: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}.`,
    );
  return result.data.IGDB_CLIENT_ID && result.data.IGDB_CLIENT_SECRET
    ? {
        clientId: result.data.IGDB_CLIENT_ID,
        clientSecret: result.data.IGDB_CLIENT_SECRET,
      }
    : null;
}
