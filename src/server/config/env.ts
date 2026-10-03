import "server-only";

import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]),
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
