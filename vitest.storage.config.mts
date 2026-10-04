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
    name: "storage",
    environment: "node",
    include: ["tests/storage/**/*.test.ts"],
    globalSetup: ["./tests/helpers/setup-minio.ts"],
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 15_000,
  },
});
