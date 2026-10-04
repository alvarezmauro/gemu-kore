import { defineConfig, devices } from "@playwright/test";

// Refuse direct execution against inherited personal configuration.
if (
  !process.env.DATABASE_URL?.includes("/gemukore_test?schema=public") ||
  process.env.BETTER_AUTH_URL !== "https://127.0.0.1:3111"
) {
  throw new Error(
    "Run this suite through pnpm test:e2e:access for an isolated database and TLS proxy.",
  );
}

export default defineConfig({
  testDir: "./tests/access-e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "https://127.0.0.1:3111",
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "pnpm build && pnpm start --hostname 127.0.0.1 --port 3110",
    url: "http://127.0.0.1:3110/api/health",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
