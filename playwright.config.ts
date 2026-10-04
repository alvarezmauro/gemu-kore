import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "pnpm build && pnpm start --hostname 127.0.0.1 --port 3100",
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    // Current smoke tests require no database; never use the personal database.
    env: {
      DATABASE_URL: "postgresql://test:test@127.0.0.1:1/gemukore_e2e",
      NEXT_TELEMETRY_DISABLED: "1",
      // Explicitly isolate unconfigured-login checks from local OAuth secrets.
      BETTER_AUTH_URL: "",
      BETTER_AUTH_SECRET: "",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      GITHUB_CLIENT_ID: "",
      GITHUB_CLIENT_SECRET: "",
      S3_ENDPOINT: "",
      S3_REGION: "",
      S3_BUCKET: "",
      S3_ACCESS_KEY_ID: "",
      S3_SECRET_ACCESS_KEY: "",
    },
  },
});
