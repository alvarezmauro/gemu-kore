import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  requirePrivateAccess,
  revalidatePrivateAccess,
  type PrivateAccessContext,
} from "@/server/auth/access";
import { disconnectDatabase, getDatabase } from "@/server/db/client";
import { withTransaction } from "@/server/db/transaction";
import {
  bootstrapAdministrator,
  recoverAdministrator,
  getPrivateWelcome,
} from "@/server/services/access";
import * as repository from "@/server/repositories/access";
import { signedSessionCookie } from "../helpers/access-session";

const exec = promisify(execFile);
const secret =
  "access-integration-only-secret-longer-than-thirty-two-characters";

async function identity(email = "collector@example.com", verified = true) {
  const user = await getDatabase().user.create({
    data: { name: "Test collector", email, emailVerified: verified },
  });
  const session = await getDatabase().session.create({
    data: {
      userId: user.id,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  return {
    user,
    session,
    headers: new Headers({
      Cookie: `gemukore.session_token=${signedSessionCookie(session.token, secret)}`,
    }),
  };
}

beforeEach(async () => {
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3002");
  vi.stubEnv("BETTER_AUTH_SECRET", secret);
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("GITHUB_CLIENT_ID", "");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "");
  await getDatabase().accessGrant.deleteMany();
  await getDatabase().user.deleteMany();
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await getDatabase().accessGrant.deleteMany();
  await getDatabase().user.deleteMany();
  await disconnectDatabase();
  vi.unstubAllEnvs();
});

it("rejects absent or forged cookie identity even when a grant exists", async () => {
  await bootstrapAdministrator({
    email: "collector@example.com",
    operator: "test",
  });
  await expect(requirePrivateAccess(new Headers())).rejects.toMatchObject({
    code: "UNAUTHENTICATED",
  });
  await expect(
    requirePrivateAccess(
      new Headers({
        "x-email": "collector@example.com",
        "x-role": "ADMIN",
        Cookie: "gemukore.session_token=forged",
      }),
    ),
  ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
});

it.each(["ADMIN", "EDITOR", "VIEWER"] as const)(
  "resolves the current enabled %s grant from verified session identity",
  async (role) => {
    const { user, session, headers } = await identity();
    const grant = await getDatabase().accessGrant.create({
      data: { email: user.email, role, enabled: true },
    });
    const context = await requirePrivateAccess(headers);
    expect(context).toMatchObject({
      userId: user.id,
      sessionId: session.id,
      grantId: grant.id,
      email: user.email,
      role,
    });
    expect(Object.isFrozen(context)).toBe(true);
    expect(await getPrivateWelcome(headers)).toEqual({ role });
  },
);

it("denies authenticated users with absent or disabled grants", async () => {
  const { user, headers } = await identity();
  await expect(getPrivateWelcome(headers)).rejects.toMatchObject({
    code: "DENIED",
  });
  await getDatabase().accessGrant.create({
    data: { email: user.email, role: "ADMIN" },
  });
  await expect(getPrivateWelcome(headers)).rejects.toMatchObject({
    code: "DENIED",
  });
});

it("denies locally unverified email even when an enabled grant exists", async () => {
  const { user, headers } = await identity("unverified@example.com", false);
  await bootstrapAdministrator({ email: user.email, operator: "test" });
  await expect(requirePrivateAccess(headers)).rejects.toMatchObject({
    code: "UNAUTHENTICATED",
  });
});

it("does not merge plus aliases or trust a grant email/role from the request", async () => {
  const { headers } = await identity("collector+games@example.com");
  await bootstrapAdministrator({
    email: "collector@example.com",
    operator: "test",
  });
  headers.set("x-email", "collector@example.com");
  headers.set("x-role", "ADMIN");
  await expect(requirePrivateAccess(headers)).rejects.toMatchObject({
    code: "DENIED",
  });
});

it("observes role changes, disable, re-enable and deletion with the same session", async () => {
  const { user, session, headers } = await identity();
  await bootstrapAdministrator({ email: user.email, operator: "test" });
  const captured = await requirePrivateAccess(headers);
  await getDatabase().accessGrant.update({
    where: { email: user.email },
    data: { role: "VIEWER" },
  });
  expect(await getPrivateWelcome(headers)).toEqual({ role: "VIEWER" });
  expect(
    (await withTransaction((tx) => revalidatePrivateAccess(captured, tx))).role,
  ).toBe("VIEWER");
  await getDatabase().accessGrant.update({
    where: { email: user.email },
    data: { enabled: false },
  });
  await expect(getPrivateWelcome(headers)).rejects.toMatchObject({
    code: "DENIED",
  });
  await expect(
    withTransaction((tx) => revalidatePrivateAccess(captured, tx)),
  ).rejects.toMatchObject({ code: "DENIED" });
  await getDatabase().accessGrant.update({
    where: { email: user.email },
    data: { enabled: true },
  });
  expect(await getPrivateWelcome(headers)).toEqual({ role: "VIEWER" });
  await getDatabase().accessGrant.delete({ where: { email: user.email } });
  await expect(getPrivateWelcome(headers)).rejects.toMatchObject({
    code: "DENIED",
  });
  expect(
    await getDatabase().user.findUnique({ where: { id: user.id } }),
  ).not.toBeNull();
  expect(
    await getDatabase().session.findUnique({ where: { id: session.id } }),
  ).not.toBeNull();
});

it.each(["expiry", "revocation", "lost verification"])(
  "rejects a captured context after session %s",
  async (change) => {
    const { user, session, headers } = await identity();
    await bootstrapAdministrator({ email: user.email, operator: "test" });
    const captured = await requirePrivateAccess(headers);
    if (change === "expiry")
      await getDatabase().session.update({
        where: { id: session.id },
        data: { expiresAt: new Date(0) },
      });
    if (change === "revocation")
      await getDatabase().session.delete({ where: { id: session.id } });
    if (change === "lost verification")
      await getDatabase().user.update({
        where: { id: user.id },
        data: { emailVerified: false },
      });
    await expect(
      withTransaction((tx) => revalidatePrivateAccess(captured, tx)),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(requirePrivateAccess(headers)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  },
);

it("rejects a deserialized client context without server provenance", async () => {
  const { user, headers } = await identity();
  await bootstrapAdministrator({ email: user.email, operator: "test" });
  const captured = await requirePrivateAccess(headers);
  const forged = JSON.parse(JSON.stringify(captured)) as PrivateAccessContext;
  await expect(
    withTransaction((tx) => revalidatePrivateAccess(forged, tx)),
  ).rejects.toMatchObject({ code: "DENIED" });
});

it("fails closed and hides database error details", async () => {
  const { headers } = await identity();
  vi.spyOn(repository, "findGrantByEmail").mockRejectedValueOnce(
    new Error("private-database-details"),
  );
  await expect(getPrivateWelcome(headers)).rejects.toMatchObject({
    code: "UNAVAILABLE",
    message: "Private access is unavailable.",
  });
});

it("normalizes first-admin input, is idempotent and creates no auth identity/session", async () => {
  const first = await bootstrapAdministrator({
    email: " Collector@EXAMPLE.com ",
    operator: "test",
  });
  const repeated = await bootstrapAdministrator({
    email: "collector@example.com",
    operator: "test",
  });
  expect(first).toMatchObject({
    email: "collector@example.com",
    outcome: "created",
    role: "ADMIN",
  });
  expect(repeated).toMatchObject({
    grantId: first.grantId,
    outcome: "unchanged",
  });
  expect(await getDatabase().accessGrant.count()).toBe(1);
  expect(await getDatabase().user.count()).toBe(0);
  expect(await getDatabase().account.count()).toBe(0);
  expect(await getDatabase().session.count()).toBe(0);
});

it("cannot bootstrap another admin or silently promote a disabled/editor grant", async () => {
  await getDatabase().accessGrant.create({
    data: { email: "collector@example.com", role: "EDITOR" },
  });
  await expect(
    bootstrapAdministrator({
      email: "collector@example.com",
      operator: "test",
    }),
  ).rejects.toMatchObject({ code: "GRANT_CONFLICT" });
  await bootstrapAdministrator({
    email: "first@example.com",
    operator: "test",
  });
  await expect(
    bootstrapAdministrator({ email: "second@example.com", operator: "test" }),
  ).rejects.toMatchObject({ code: "ADMIN_EXISTS" });
  expect(
    await getDatabase().accessGrant.count({
      where: { role: "ADMIN", enabled: true },
    }),
  ).toBe(1);
});

it("serializes competing bootstrap attempts", async () => {
  const results = await Promise.allSettled(
    ["first@example.com", "second@example.com"].map((email) =>
      bootstrapAdministrator({ email, operator: "test" }),
    ),
  );
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(
    1,
  );
  expect(await getDatabase().accessGrant.count()).toBe(1);
});

it("enforces normalized unique emails and defaults grants to disabled", async () => {
  const grant = await getDatabase().accessGrant.create({
    data: { email: "collector@example.com", role: "VIEWER" },
  });
  expect(grant.enabled).toBe(false);
  await expect(
    getDatabase().accessGrant.create({
      data: { email: grant.email, role: "ADMIN" },
    }),
  ).rejects.toMatchObject({ code: "P2002" });
  await expect(
    getDatabase().accessGrant.create({
      data: { email: "Collector@example.com", role: "VIEWER" },
    }),
  ).rejects.toThrow();
});

it("restores a grant explicitly, disables the old grant and revokes both users' sessions", async () => {
  const old = await identity("old@example.com");
  const replacement = await identity("new@example.com");
  await bootstrapAdministrator({ email: old.user.email, operator: "test" });
  await getDatabase().accessGrant.create({
    data: { email: replacement.user.email, role: "EDITOR" },
  });
  const receipt = await recoverAdministrator({
    email: replacement.user.email,
    previousEmail: old.user.email,
    operator: "local owner",
    reason: "Lost old provider",
  });
  expect(receipt).toMatchObject({
    action: "recover-admin",
    operator: "local owner",
    reason: "Lost old provider",
    revokedSessions: 2,
  });
  expect(await getDatabase().session.count()).toBe(0);
  expect(await getDatabase().user.count()).toBe(2);
  expect(
    await getDatabase().accessGrant.findUnique({
      where: { email: old.user.email },
    }),
  ).toMatchObject({ enabled: false });
  expect(
    await getDatabase().accessGrant.findUnique({
      where: { email: replacement.user.email },
    }),
  ).toMatchObject({ enabled: true, role: "ADMIN" });
});

it("explicitly rebinds a verified user's email while preserving its stable identity and account", async () => {
  const { user } = await identity("old@example.com");
  const account = await getDatabase().account.create({
    data: {
      userId: user.id,
      providerId: "google",
      accountId: "stable-provider-id",
    },
  });
  await bootstrapAdministrator({ email: user.email, operator: "test" });
  await recoverAdministrator({
    email: "new@example.com",
    previousEmail: user.email,
    rebindUserId: user.id,
    operator: "local owner",
    reason: "Provider verified-email change checked manually",
  });
  expect(
    await getDatabase().user.findUnique({ where: { id: user.id } }),
  ).toMatchObject({ email: "new@example.com", emailVerified: true });
  expect(
    await getDatabase().account.findUnique({ where: { id: account.id } }),
  ).toMatchObject({ userId: user.id, accountId: "stable-provider-id" });
  expect(await getDatabase().session.count()).toBe(0);
});

it("rejects a conflicting recovery identity without changing grants or sessions", async () => {
  const original = await identity("old@example.com");
  await identity("new@example.com");
  await bootstrapAdministrator({
    email: original.user.email,
    operator: "test",
  });
  await expect(
    recoverAdministrator({
      email: "new@example.com",
      previousEmail: original.user.email,
      rebindUserId: original.user.id,
      operator: "local owner",
      reason: "Conflicting identity",
    }),
  ).rejects.toMatchObject({ code: "IDENTITY_CONFLICT" });
  expect(await getDatabase().accessGrant.count()).toBe(1);
  expect(await getDatabase().session.count()).toBe(2);
  expect(
    (
      await getDatabase().user.findUniqueOrThrow({
        where: { id: original.user.id },
      })
    ).email,
  ).toBe(original.user.email);
});

it.each([
  { email: "invalid", operator: "test" },
  { email: "valid@example.com", operator: "" },
  { email: "valid@example.com", operator: "test", role: "ADMIN" },
])("validates setup input server-side", async (input) => {
  await expect(bootstrapAdministrator(input)).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  expect(await getDatabase().accessGrant.count()).toBe(0);
});

it("requires recovery operator, reason and previous email for explicit rebinding", async () => {
  await expect(
    recoverAdministrator({ email: "valid@example.com" }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    recoverAdministrator({
      email: "valid@example.com",
      rebindUserId: randomUUID(),
      operator: "test",
      reason: "test",
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(await getDatabase().accessGrant.count()).toBe(0);
});

it("runs the actual bootstrap/recovery commands against only the isolated test database", async () => {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "test" };
  const run = async (command: string, args: string[]) => {
    const { stdout } = await exec(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "scripts/access-admin.ts",
        command,
        ...args,
      ],
      { env, timeout: 10000 },
    );
    return JSON.parse(stdout.trim().split("\n").at(-1)!);
  };
  expect(
    await run("bootstrap", [
      "--email",
      "CLI@example.com",
      "--operator",
      "test",
    ]),
  ).toMatchObject({ email: "cli@example.com", outcome: "created" });
  expect(
    await run("bootstrap", [
      "--email",
      "cli@example.com",
      "--operator",
      "test",
    ]),
  ).toMatchObject({ outcome: "unchanged" });
  expect(
    await run("recover", [
      "--email",
      "new-cli@example.com",
      "--previous-email",
      "cli@example.com",
      "--operator",
      "test",
      "--reason",
      "Test recovery",
    ]),
  ).toMatchObject({ action: "recover-admin", email: "new-cli@example.com" });
});
