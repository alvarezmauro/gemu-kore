import { inject, vi } from "vitest";

// Never inherit the developer's DATABASE_URL for integration tests.
vi.stubEnv("DATABASE_URL", inject("databaseUrl"));
