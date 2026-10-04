import { inject, vi } from "vitest";
const config = inject("storageConfig");
vi.stubEnv("S3_ENDPOINT", config.endpoint);
vi.stubEnv("S3_REGION", config.region);
vi.stubEnv("S3_BUCKET", config.bucket);
vi.stubEnv("S3_ACCESS_KEY_ID", config.accessKeyId);
vi.stubEnv("S3_SECRET_ACCESS_KEY", config.secretAccessKey);
vi.stubEnv("S3_FORCE_PATH_STYLE", "true");
vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3002");
vi.stubEnv(
  "BETTER_AUTH_SECRET",
  "asset-integration-only-secret-longer-than-thirty-two-characters",
);
vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
vi.stubEnv("GITHUB_CLIENT_ID", "");
vi.stubEnv("GITHUB_CLIENT_SECRET", "");
