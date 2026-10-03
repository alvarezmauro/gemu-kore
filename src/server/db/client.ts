import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { getDatabaseEnv } from "../config/env";
import { PrismaClient } from "./generated/client";

const databaseGlobal = globalThis as typeof globalThis & {
  gemukorePrisma?: PrismaClient;
};

export function getDatabase() {
  if (!databaseGlobal.gemukorePrisma) {
    const { DATABASE_URL } = getDatabaseEnv();
    const adapter = new PrismaPg(
      {
        connectionString: DATABASE_URL,
        max: 5,
        connectionTimeoutMillis: 5_000,
        idleTimeoutMillis: 10_000,
        statement_timeout: 10_000,
      },
      {
        schema: new URL(DATABASE_URL).searchParams.get("schema") ?? "public",
        onPoolError: () => console.error("Database pool connection failed."),
        onConnectionError: () => console.error("Database connection failed."),
      },
    );

    // Reuse the pool across requests and development hot reloads.
    databaseGlobal.gemukorePrisma = new PrismaClient({ adapter, log: [] });
  }

  return databaseGlobal.gemukorePrisma;
}

// For short-lived operational commands, never per-request cleanup.
export async function disconnectDatabase() {
  const client = databaseGlobal.gemukorePrisma;
  if (client) {
    await client.$disconnect();
    delete databaseGlobal.gemukorePrisma;
  }
}
