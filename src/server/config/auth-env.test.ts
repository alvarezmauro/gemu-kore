import { describe, expect, it } from "vitest";
import { authEnvironmentSchema, configuredAuthEnvironment } from "./auth-env";

const configured = {
  NODE_ENV: "test",
  BETTER_AUTH_URL: "http://localhost:3002",
  BETTER_AUTH_SECRET: "test-only-secret-longer-than-thirty-two-characters",
  GOOGLE_CLIENT_ID: "test-google",
  GOOGLE_CLIENT_SECRET: "test-google-secret",
};

describe("auth configuration", () => {
  it("leaves authentication unavailable without provider credentials", () => {
    const env = authEnvironmentSchema.parse({
      NODE_ENV: "development",
      BETTER_AUTH_URL: "http://localhost:3002",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
    });
    expect(configuredAuthEnvironment(env)).toBeNull();
  });
  it("accepts a complete provider pair and fixed origin", () => {
    expect(
      configuredAuthEnvironment(authEnvironmentSchema.parse(configured)),
    ).toMatchObject({
      baseURL: "http://localhost:3002",
      google: { clientId: "test-google" },
    });
  });
  it.each([
    { ...configured, GOOGLE_CLIENT_SECRET: "" },
    { ...configured, BETTER_AUTH_SECRET: "short" },
    { ...configured, BETTER_AUTH_URL: "not-a-url" },
    { ...configured, BETTER_AUTH_URL: "http://example.com" },
    { ...configured, BETTER_AUTH_URL: "https://example.com/login" },
    { ...configured, BETTER_AUTH_URL: "https://user:password@example.com" },
    { ...configured, BETTER_AUTH_URL: "https://example.com?origin=other" },
    { ...configured, NODE_ENV: "production" },
  ])("rejects incomplete or unsafe auth configuration", (env) => {
    expect(authEnvironmentSchema.safeParse(env).success).toBe(false);
  });
  it("accepts HTTPS in production", () => {
    expect(
      authEnvironmentSchema.safeParse({
        ...configured,
        NODE_ENV: "production",
        BETTER_AUTH_URL: "https://collection.example",
      }).success,
    ).toBe(true);
  });
});
