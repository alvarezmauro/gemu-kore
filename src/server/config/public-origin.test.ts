import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { publicOrigin } from "./public-origin";
afterEach(() => vi.unstubAllEnvs());
it("uses only the fixed configured origin and does not require live OAuth credentials", () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("BETTER_AUTH_URL", "https://collection.example");
  for (const k of [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "BETTER_AUTH_SECRET",
  ])
    vi.stubEnv(k, "");
  expect(publicOrigin()).toBe("https://collection.example");
});
it.each([
  "",
  "https://user:password@example.com",
  "https://example.com/?secret=signed",
  "https://example.com/internal",
  "http://remote.example",
])("fails closed for absent/invalid canonical origin %s", (value) => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("BETTER_AUTH_URL", value);
  expect(publicOrigin()).toBeNull();
});
