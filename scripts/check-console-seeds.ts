import { fileURLToPath } from "node:url";
import { loadConsoleSeeds } from "./console-seeds/load";
async function main() {
  if (process.argv.length > 2)
    throw new Error("This read-only check accepts no arguments.");
  const data = await loadConsoleSeeds(
    fileURLToPath(new URL("../prisma/seed-data/", import.meta.url)),
  );
  console.info(
    `Console seeds valid (format v${data.schemaVersion}): ${data.companies.length} companies, ${data.regions.length} markets, ${data.platforms.length} platforms, ${data.models.length} models. No database changes.`,
  );
}
void main().catch((error) => {
  console.error(
    `Console seed validation failed: ${error instanceof Error && !("code" in error) ? error.message : "A required seed file could not be read."}`,
  );
  process.exitCode = 1;
});
