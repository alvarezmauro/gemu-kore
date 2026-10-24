import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  failureCode,
  operationalEvent,
  operationalFailure,
  withLogContext,
} from "./events";
afterEach(() => vi.restoreAllMocks());
it("allows only defined event fields and codes while keeping one async correlation", async () => {
  const output = vi.spyOn(console, "info").mockImplementation(() => {});
  const uploadId = "11111111-1111-4111-8111-111111111111";
  await withLogContext(async () => {
    operationalEvent("asset.upload", "started", {
      uploadId,
      filename: "PRIVATE-SENTINEL",
      cookie: "SECRET-SENTINEL",
    } as { uploadId: string });
    await Promise.resolve();
    withLogContext(() =>
      operationalEvent("asset.upload", "succeeded", { uploadId }),
    );
  });
  const events = output.mock.calls.map(([line]) => JSON.parse(String(line)));
  expect(events).toHaveLength(2);
  expect(events[0]).toMatchObject({
    operation: "asset.upload",
    outcome: "started",
    uploadId,
  });
  expect(events[1].correlationId).toBe(events[0].correlationId);
  expect(Object.keys(events[0]).sort()).toEqual([
    "correlationId",
    "operation",
    "outcome",
    "timestamp",
    "uploadId",
  ]);
  expect(JSON.stringify(events)).not.toMatch(
    /PRIVATE-SENTINEL|SECRET-SENTINEL|cookie|filename/,
  );
});
it("isolates parallel operations and does not accept supplied correlation IDs or arbitrary identifiers", async () => {
  const output = vi.spyOn(console, "info").mockImplementation(() => {});
  await Promise.all(
    [1, 2].map(() =>
      withLogContext(async () => {
        await Promise.resolve();
        operationalEvent("asset.complete", "succeeded", {
          uploadId: "SECRET-SENTINEL",
          correlationId: "SECRET-SENTINEL",
        } as { uploadId: string });
      }),
    ),
  );
  const events = output.mock.calls.map(([line]) => JSON.parse(String(line)));
  expect(events[0].correlationId).not.toBe(events[1].correlationId);
  expect(JSON.stringify(events)).not.toContain("SECRET-SENTINEL");
});
it("deduplicates propagated failures and ignores raw errors, causes and hostile getters", () => {
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  const error = Object.assign(new Error("SECRET-SENTINEL"), {
    code: "FORBIDDEN",
    cause: { password: "SECRET-SENTINEL" },
  });
  withLogContext(() => {
    operationalFailure("auth.permission", error, {
      permission: "catalog.manage",
    });
    operationalFailure("database.transaction", error);
  });
  expect(output).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(output.mock.calls[0][0]))).toMatchObject({
    operation: "auth.permission",
    outcome: "denied",
    code: "FORBIDDEN",
    permission: "catalog.manage",
  });
  expect(output.mock.calls.flat().join()).not.toContain("SECRET-SENTINEL");
  expect(failureCode({ code: "SECRET-SENTINEL" })).toBe("UNEXPECTED");
  expect(failureCode({ code: "COPY_STALE" })).toBe("COPY_STALE");
  expect(
    failureCode({
      get code() {
        throw new Error("SECRET-SENTINEL");
      },
    }),
  ).toBe("UNEXPECTED");
  expect(failureCode({ code: "P2010", message: "SECRET-SENTINEL" })).toBe(
    "DATABASE_QUERY_FAILED",
  );
});
it("never changes work results when a logging sink throws", () => {
  vi.spyOn(console, "info").mockImplementation(() => {
    throw new Error("sink down");
  });
  vi.spyOn(console, "error").mockImplementation(() => {
    throw new Error("sink down");
  });
  expect(
    withLogContext(() => {
      operationalEvent("asset.upload", "started");
      operationalFailure("asset.upload", new Error("SECRET-SENTINEL"));
      return "saved";
    }),
  ).toBe("saved");
});
it("records one SDK failure per request despite multiple SDK error callbacks", () => {
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  withLogContext(() => {
    operationalEvent("auth.request", "failed", {}, "UNAVAILABLE");
    operationalEvent("auth.request", "failed", {}, "UNAVAILABLE");
  });
  withLogContext(() =>
    operationalEvent("auth.request", "failed", {}, "UNAVAILABLE"),
  );
  expect(output).toHaveBeenCalledTimes(2);
});
