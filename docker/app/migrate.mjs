import { spawnSync } from "node:child_process";
import { getDatabase, disconnectDatabase } from "../../src/server/db/client.ts";

const result = spawnSync("pnpm", ["db:deploy"], { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
try {
  // Runtime DML grants cover domain tables, never Prisma's migration ledger.
  await getDatabase().$executeRawUnsafe(
    'REVOKE ALL ON TABLE "_prisma_migrations" FROM gemukore_app',
  );
} catch {
  console.error("Migration access setup failed. Check database configuration.");
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
