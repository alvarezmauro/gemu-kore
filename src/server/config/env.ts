import "server-only";

import { z } from "zod";

import { databaseUrlSchema } from "./database-env";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]),
  DATABASE_URL: databaseUrlSchema.optional(),
});

export function getServerEnv() {
  // Read runtime values instead of a build-time-inlined NODE_ENV expression.
  const result = environmentSchema.safeParse(process.env);

  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join("."));
    throw new Error(`Invalid server environment: ${fields.join(", ")}.`);
  }

  return result.data;
}

export function getDatabaseEnv() {
  const result = databaseUrlSchema.safeParse(process.env.DATABASE_URL);

  if (!result.success) {
    throw new Error("Invalid server environment: DATABASE_URL.");
  }

  return { DATABASE_URL: result.data };
}
