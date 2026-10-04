import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./tests/helpers/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    name: "assets",
    environment: "node",
    include: ["tests/assets/**/*.test.ts"],
    globalSetup: [
      "./tests/helpers/setup-postgres.ts",
      "./tests/helpers/setup-minio.ts",
    ],
    setupFiles: [
      "./tests/helpers/setup-database-env.ts",
      "./tests/helpers/setup-assets-env.ts",
    ],
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
