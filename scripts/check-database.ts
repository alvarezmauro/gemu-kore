import { loadEnvConfig } from "@next/env";

import { disconnectDatabase } from "../src/server/db/client";
import { checkDatabase } from "../src/server/db/health";

async function main() {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  try {
    await checkDatabase();
    console.info("Database connection is healthy.");
  } catch {
    console.error(
      "Database health check failed. Check configuration and connectivity.",
    );
    process.exitCode = 1;
  } finally {
    try {
      await disconnectDatabase();
    } catch {
      console.error("Database connection cleanup failed.");
      process.exitCode = 1;
    }
  }
}

void main();
