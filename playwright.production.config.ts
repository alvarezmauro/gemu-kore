import { defineConfig, devices } from "@playwright/test";

if (
  !process.env.PRODUCTION_TEST_PROJECT?.startsWith(
    "gemukore-production-test-",
  ) ||
  !process.env.PRODUCTION_TEST_ENV ||
  !process.env.PRODUCTION_TEST_OVERRIDE
)
  throw new Error(
    "Run through pnpm test:production for disposable Docker services.",
  );

export default defineConfig({
  testDir: "./tests/production-e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
  timeout: 120000,
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
});
