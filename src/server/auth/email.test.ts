import { describe, expect, it } from "vitest";
import { normalizeVerifiedEmail } from "./email";

describe("verified-email normalization", () => {
  it.each([
    [" Collector@EXAMPLE.COM ", "collector@example.com"],
    [
      "  Collector.Name+games@EXAMPLE.com  ",
      "collector.name+games@example.com",
    ],
    ["collector@sub.example.com", "collector@sub.example.com"],
  ])("normalizes %s idempotently", (input, normalized) => {
    expect(normalizeVerifiedEmail(input)).toBe(normalized);
    expect(normalizeVerifiedEmail(normalized)).toBe(normalized);
  });
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
    "\tuser@example.com",
    "user@example.com\r\n",
    "user@example.com\u007f",
    "user name@example.com",
    "User <user@example.com>",
    "user@@example.com",
    { email: "user@example.com", verified: true },
  ])("rejects malformed identity: %s", (email) => {
    expect(normalizeVerifiedEmail(email)).toBeNull();
  });
});
