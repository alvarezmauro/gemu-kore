import { randomUUID } from "node:crypto";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import { disconnectDatabase, getDatabase } from "@/server/db/client";
import { withTransaction } from "@/server/db/transaction";
import { requirePrivateAccess } from "@/server/auth/access";
import { requirePermission } from "@/server/auth/permissions";
import { ConsoleError } from "@/server/services/collection/consoles";
import { signedSessionCookie } from "../helpers/access-session";
const db = getDatabase();
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(disconnectDatabase);
it("classifies actual database failures without emitting query parameters or errors", async () => {
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(
    withTransaction(
      (tx) => tx.$queryRaw`SELECT ${"PRIVATE-SECRET-SENTINEL"}::integer`,
    ),
  ).rejects.toThrow();
  expect(output).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(output.mock.calls[0][0]))).toMatchObject({
    operation: "database.transaction",
    outcome: "failed",
    code: "DATABASE_QUERY_FAILED",
  });
  expect(output.mock.calls.flat().join()).not.toMatch(
    /PRIVATE-SECRET-SENTINEL|SELECT|stack|message|query/,
  );
});
it("preserves rollback and classifies an unexpected failure before a service can redact it", async () => {
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  const slug = randomUUID();
  await expect(
    withTransaction(async (tx) => {
      await tx.game.create({ data: { name: "Private title", slug } });
      throw new Error("PRIVATE-SECRET-SENTINEL");
    }),
  ).rejects.toThrow("PRIVATE-SECRET-SENTINEL");
  expect(await db.game.findUnique({ where: { slug } })).toBeNull();
  expect(JSON.parse(String(output.mock.calls[0][0]))).toMatchObject({
    operation: "database.transaction",
    code: "UNEXPECTED",
  });
  expect(output.mock.calls.flat().join()).not.toContain(
    "PRIVATE-SECRET-SENTINEL",
  );
  output.mockClear();
  await expect(
    withTransaction(async (tx) => {
      await tx.game.create({ data: { name: "Private title", slug } });
      throw new ConsoleError("COPY_STALE");
    }),
  ).rejects.toMatchObject({ code: "COPY_STALE" });
  expect(await db.game.findUnique({ where: { slug } })).toBeNull();
  expect(output).not.toHaveBeenCalled();
});
it("records authorization denial once and keeps permission decisions intact when logging fails", async () => {
  const secret = "event-test-secret-with-at-least-thirty-two-characters";
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3002");
  vi.stubEnv("BETTER_AUTH_SECRET", secret);
  vi.stubEnv("GOOGLE_CLIENT_ID", "fixture");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "fixture");
  vi.stubEnv("GITHUB_CLIENT_ID", "");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "");
  const user = await db.user.create({
    data: {
      email: `${randomUUID()}@example.com`,
      name: "PRIVATE-SECRET-SENTINEL",
      emailVerified: true,
    },
  });
  const session = await db.session.create({
    data: {
      token: randomUUID(),
      userId: user.id,
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  const grant = await db.accessGrant.create({
    data: { email: user.email, role: "VIEWER", enabled: true },
  });
  try {
    const actor = await requirePrivateAccess(
      new Headers({
        Cookie: `gemukore.session_token=${signedSessionCookie(session.token, secret)}`,
      }),
    );
    const output = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      withTransaction((tx) => requirePermission(actor, "catalog.manage", tx)),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(output).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(output.mock.calls[0][0]))).toMatchObject({
      operation: "auth.permission",
      outcome: "denied",
      code: "FORBIDDEN",
    });
    expect(output.mock.calls.flat().join()).not.toMatch(
      /PRIVATE-SECRET-SENTINEL|@example|session_token/,
    );
    output.mockImplementation(() => {
      throw new Error("sink down");
    });
    await expect(
      requirePermission(actor, "catalog.manage"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await requirePermission(actor, "private.read")).role).toBe(
      "VIEWER",
    );
  } finally {
    await db.accessGrant.delete({ where: { id: grant.id } });
    await db.user.delete({ where: { id: user.id } });
  }
});
