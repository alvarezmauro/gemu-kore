import { describe, expect, it } from "vitest";
import { databaseUrlSchema } from "./database-env";

describe("database URL validation", () => {
  it.each([
    "postgresql://user:password@localhost:5432/gemukore",
    "postgres://user:password@postgres/gemukore?schema=catalog",
  ])("accepts a PostgreSQL URL: %s", (url) => {
    expect(databaseUrlSchema.safeParse(url).success).toBe(true);
  });

  it.each([
    "",
    "not a URL",
    "https://localhost/gemukore",
    "postgresql:///gemukore",
    "postgresql://localhost/",
    "postgresql://localhost/gemukore?schema=",
  ])("rejects an invalid database URL: %s", (url) => {
    expect(databaseUrlSchema.safeParse(url).success).toBe(false);
  });
});
