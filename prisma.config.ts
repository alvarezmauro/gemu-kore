import { loadEnvConfig } from "@next/env";
import { defineConfig } from "prisma/config";

import { databaseUrlSchema } from "./src/server/config/database-env";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

const url = process.env.DATABASE_URL;
if (url !== undefined && !databaseUrlSchema.safeParse(url).success) {
  throw new Error("Invalid server environment: DATABASE_URL.");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Generating the client needs no credentials or live database.
  datasource: { url },
});
