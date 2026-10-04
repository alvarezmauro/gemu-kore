import { describe, expect, it } from "vitest";
import { normalizeVerifiedEmail } from "./email";

describe("verified-email normalization", () => {
  it("trims and lowercases without merging aliases", () => {
    expect(normalizeVerifiedEmail(" Collector.Name+games@EXAMPLE.com ")).toBe(
      "collector.name+games@example.com",
    );
    expect(normalizeVerifiedEmail("collectorname@example.com")).not.toBe(
      normalizeVerifiedEmail("collector.name@example.com"),
    );
  });
  it.each([
    null,
    undefined,
    42,
    "",
    "user",
    "user@",
    "user@example.com\n",
    "user\u0000@example.com",
  ])("rejects malformed identity: %s", (email) => {
    expect(normalizeVerifiedEmail(email)).toBeNull();
  });
});
