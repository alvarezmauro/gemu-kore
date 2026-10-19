import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  gameMetadataEnvironmentSchema,
  getGameMetadataConfiguration,
} from "./game-metadata";

afterEach(() => vi.unstubAllEnvs());

it("keeps empty provider configuration optional", () => {
  vi.stubEnv("IGDB_CLIENT_ID", "");
  vi.stubEnv("IGDB_CLIENT_SECRET", "");
  expect(getGameMetadataConfiguration()).toBeNull();
});
it("accepts a complete server credential pair", () => {
  vi.stubEnv("IGDB_CLIENT_ID", "test-client");
  vi.stubEnv("IGDB_CLIENT_SECRET", "test-secret");
  expect(getGameMetadataConfiguration()).toEqual({
    clientId: "test-client",
    clientSecret: "test-secret",
  });
});
it.each([
  { IGDB_CLIENT_ID: "client" },
  { IGDB_CLIENT_SECRET: "secret" },
  { IGDB_CLIENT_ID: "client\r\n", IGDB_CLIENT_SECRET: "secret" },
  { IGDB_CLIENT_ID: "client", IGDB_CLIENT_SECRET: " " },
])(
  "rejects incomplete or unsafe credentials on explicit capability validation",
  (value) => {
    expect(gameMetadataEnvironmentSchema.safeParse(value).success).toBe(false);
  },
);
it("reports field names without values", () => {
  vi.stubEnv("IGDB_CLIENT_ID", "");
  vi.stubEnv("IGDB_CLIENT_SECRET", "private-value");
  expect(() => getGameMetadataConfiguration()).toThrow("IGDB_CLIENT_ID");
  try {
    getGameMetadataConfiguration();
  } catch (error) {
    expect(String(error)).not.toContain("private-value");
  }
});
