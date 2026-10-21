import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  accessoryMetadataEnvironment,
  getAccessoryMetadataConfiguration,
} from "./accessory-metadata";
afterEach(() => vi.unstubAllEnvs());
it("defaults to disabled and enables only the explicit source", () => {
  expect(
    accessoryMetadataEnvironment.parse({}).ACCESSORY_METADATA_PROVIDER,
  ).toBe("none");
  vi.stubEnv("ACCESSORY_METADATA_PROVIDER", "none");
  expect(getAccessoryMetadataConfiguration()).toBeNull();
  vi.stubEnv("ACCESSORY_METADATA_PROVIDER", "wikidata");
  vi.stubEnv("WIKIDATA_USER_AGENT", "");
  expect(getAccessoryMetadataConfiguration()).toEqual({
    userAgent: "GemuKore/0.1 (https://github.com/alvarezmauro/gemu-kore)",
  });
});
it("rejects unsupported sources and header injection without echoing submitted configuration", () => {
  for (const value of ["unknown", "wikidata\nsecret"])
    expect(
      accessoryMetadataEnvironment.safeParse({
        ACCESSORY_METADATA_PROVIDER: value,
      }).success,
    ).toBe(false);
  expect(
    accessoryMetadataEnvironment.safeParse({
      WIKIDATA_USER_AGENT: "agent\r\nAuthorization: secret",
    }).success,
  ).toBe(false);
});
