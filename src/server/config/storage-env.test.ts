import { describe, expect, it, vi, afterEach } from "vitest";
import {
  configuredStorageEnvironment,
  storageEnvironmentSchema,
} from "./storage-env";

vi.mock("server-only", () => ({}));
import { getServerEnv, getStorageEnv } from "./env";

const configured = {
  NODE_ENV: "test",
  S3_ENDPOINT: "http://127.0.0.1:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "gemukore-test",
  S3_ACCESS_KEY_ID: "test-key",
  S3_SECRET_ACCESS_KEY: "test-secret",
  S3_FORCE_PATH_STYLE: "true",
};

afterEach(() => vi.unstubAllEnvs());
describe("storage configuration", () => {
  it("permits completely absent storage and parses false without truthiness", () => {
    expect(
      configuredStorageEnvironment(
        storageEnvironmentSchema.parse({
          NODE_ENV: "production",
          S3_ENDPOINT: "",
          S3_FORCE_PATH_STYLE: "false",
        }),
      ),
    ).toBeNull();
    expect(
      configuredStorageEnvironment(
        storageEnvironmentSchema.parse({
          ...configured,
          S3_FORCE_PATH_STYLE: "false",
        }),
      ),
    ).toMatchObject({ forcePathStyle: false });
    expect(
      configuredStorageEnvironment(
        storageEnvironmentSchema.parse({
          ...configured,
          S3_FORCE_PATH_STYLE: undefined,
        }),
      ),
    ).toMatchObject({ forcePathStyle: true });
  });
  it.each([
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ])("requires %s when other fields are set", (field) => {
    expect(
      storageEnvironmentSchema.safeParse({ ...configured, [field]: "" })
        .success,
    ).toBe(false);
  });
  it.each([
    { S3_ENDPOINT: "https://user:secret@example.com" },
    { S3_ENDPOINT: "https://example.com/bucket" },
    { S3_ENDPOINT: "https://example.com?secret=value" },
    { S3_ENDPOINT: "https://example.com/#secret" },
    { S3_ENDPOINT: "ftp://example.com" },
    { S3_ENDPOINT: "http://example.com" },
    { NODE_ENV: "production" },
    { S3_FORCE_PATH_STYLE: "yes" },
    { S3_FORCE_PATH_STYLE: "1" },
    { S3_BUCKET: "Bad Bucket" },
    { S3_BUCKET: "192.168.0.1" },
    { S3_REGION: "us-east-1\n" },
    { S3_ACCESS_KEY_ID: " " },
    { S3_SECRET_ACCESS_KEY: "secret\nheader" },
    { S3_SECRET_ACCESS_KEY: " " },
  ])("rejects unsafe configuration", (change) => {
    expect(
      storageEnvironmentSchema.safeParse({ ...configured, ...change }).success,
    ).toBe(false);
  });
  it.each([
    ["https://account.r2.cloudflarestorage.com", "auto", "true"],
    ["https://nyc3.digitaloceanspaces.com", "us-east-1", "false"],
    ["https://s3.us-west-004.backblazeb2.com", "us-west-004", "true"],
    ["https://s3.us-east-1.amazonaws.com", "us-east-1", "false"],
  ])(
    "accepts the cloud configuration for %s",
    (endpoint, region, pathStyle) => {
      expect(
        configuredStorageEnvironment(
          storageEnvironmentSchema.parse({
            ...configured,
            NODE_ENV: "production",
            S3_ENDPOINT: endpoint,
            S3_REGION: region,
            S3_FORCE_PATH_STYLE: pathStyle,
          }),
        ),
      ).toMatchObject({
        endpoint,
        region,
        forcePathStyle: pathStyle === "true",
      });
    },
  );
  it("reports fields without revealing rejected credentials or endpoint values", () => {
    for (const [field, value] of Object.entries(configured))
      vi.stubEnv(field, value);
    vi.stubEnv("S3_ENDPOINT", "https://secret:super-secret@example.com");
    expect(() => getServerEnv()).toThrow(
      /^Invalid server environment: S3_ENDPOINT\.$/,
    );
    vi.stubEnv("S3_ENDPOINT", configured.S3_ENDPOINT);
    expect(getStorageEnv()).toMatchObject({ bucket: "gemukore-test" });
  });
});
