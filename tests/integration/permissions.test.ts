import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { accessRoles, type AccessRole } from "@/features/auth/contracts";
import {
  requirePrivateAccess,
  type PrivateAccessContext,
} from "@/server/auth/access";
import { requirePermission } from "@/server/auth/permissions";
import { disconnectDatabase, getDatabase } from "@/server/db/client";
import { withTransaction } from "@/server/db/transaction";
import { permissions, type Permission } from "@/server/policies/permissions";
import {
  createAccessGrant,
  updateAccessGrant,
  deleteAccessGrant,
  listAccessGrants,
} from "@/server/services/access";
import { signedSessionCookie } from "../helpers/access-session";

const secret = "rbac-integration-only-secret-longer-than-thirty-two-characters";

async function actor(
  role: AccessRole,
  email = `${role.toLowerCase()}@example.com`,
) {
  const user = await getDatabase().user.create({
    data: { name: "Role fixture", email, emailVerified: true },
  });
  const session = await getDatabase().session.create({
    data: {
      userId: user.id,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  const grant = await getDatabase().accessGrant.create({
    data: { email, role, enabled: true },
  });
  const context = await requirePrivateAccess(
    new Headers({
      Cookie: `gemukore.session_token=${signedSessionCookie(session.token, secret)}`,
    }),
  );
  return { user, session, grant, context };
}

beforeAll(async () => {
  await getDatabase()
    .$executeRaw`CREATE TABLE rbac_probe (id UUID PRIMARY KEY, kind TEXT NOT NULL)`;
});
beforeEach(async () => {
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3002");
  vi.stubEnv("BETTER_AUTH_SECRET", secret);
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("GITHUB_CLIENT_ID", "");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "");
  await getDatabase().accessGrant.deleteMany();
  await getDatabase().user.deleteMany();
  await getDatabase().$executeRaw`DELETE FROM rbac_probe`;
});
afterAll(async () => {
  await getDatabase().accessGrant.deleteMany();
  await getDatabase().user.deleteMany();
  await getDatabase().$executeRaw`DROP TABLE rbac_probe`;
  await disconnectDatabase();
  vi.unstubAllEnvs();
});

const editorPermissions = [
  "private.read",
  "collection.manage",
  "media.manage",
  "enrichment.suggest",
];
for (const role of accessRoles) {
  it.each(permissions)(
    `${role} enforces %s directly at the server boundary`,
    async (permission) => {
      const { context } = await actor(role);
      const allowed =
        role === "ADMIN" ||
        (role === "EDITOR"
          ? editorPermissions.includes(permission)
          : permission === "private.read");
      const result = withTransaction((transaction) =>
        requirePermission(context, permission, transaction),
      );
      if (allowed) await expect(result).resolves.toMatchObject({ role });
      else await expect(result).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
  );
}

it.each(accessRoles)(
  "protects compound copy/catalog writes for %s",
  async (role) => {
    const { context } = await actor(role);
    // Test-only transaction probe: no future domain tables or endpoints exist yet.
    const operation = withTransaction(async (transaction) => {
      await requirePermission(context, "collection.manage", transaction);
      await transaction.$executeRaw`INSERT INTO rbac_probe VALUES (${randomUUID()}::uuid, 'owned copy')`;
      // Inline canonical creation must separately require canonical authority.
      await requirePermission(context, "catalog.manage", transaction);
      await transaction.$executeRaw`INSERT INTO rbac_probe VALUES (${randomUUID()}::uuid, 'canonical release')`;
    });
    if (role === "ADMIN") await operation;
    else await expect(operation).rejects.toMatchObject({ code: "FORBIDDEN" });
    const [{ count }] = await getDatabase().$queryRaw<
      [{ count: bigint }]
    >`SELECT count(*) FROM rbac_probe`;
    expect(Number(count)).toBe(role === "ADMIN" ? 2 : 0);
  },
);

it("ignores a captured admin role after demotion and recognizes a new current role", async () => {
  const { context, grant } = await actor("ADMIN");
  await getDatabase().accessGrant.update({
    where: { id: grant.id },
    data: { role: "EDITOR" },
  });
  await expect(
    requirePermission(context, "catalog.manage"),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    createAccessGrant(context, {
      email: "other@example.com",
      role: "ADMIN",
      enabled: true,
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    requirePermission(context, "collection.manage"),
  ).resolves.toMatchObject({ role: "EDITOR" });
  await getDatabase().accessGrant.update({
    where: { id: grant.id },
    data: { role: "ADMIN" },
  });
  await expect(
    requirePermission(context, "catalog.manage"),
  ).resolves.toMatchObject({ role: "ADMIN" });
});

it("rejects browser-serialized context, forged role and unknown permission", async () => {
  const { context } = await actor("VIEWER");
  await expect(
    requirePermission(
      JSON.parse(JSON.stringify({ ...context, role: "ADMIN" })),
      "catalog.manage",
    ),
  ).rejects.toMatchObject({ code: "DENIED" });
  await expect(
    requirePermission(context, "*" as Permission),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it.each(["disabled", "deleted", "expired", "revoked", "unverified"] as const)(
  "rechecks %s identity/grant before a direct service mutation",
  async (state) => {
    const { context, grant, session, user } = await actor("ADMIN");
    if (state === "disabled")
      await getDatabase().accessGrant.update({
        where: { id: grant.id },
        data: { enabled: false },
      });
    if (state === "deleted")
      await getDatabase().accessGrant.delete({ where: { id: grant.id } });
    if (state === "expired")
      await getDatabase().session.update({
        where: { id: session.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
    if (state === "revoked")
      await getDatabase().session.delete({ where: { id: session.id } });
    if (state === "unverified")
      await getDatabase().user.update({
        where: { id: user.id },
        data: { emailVerified: false },
      });
    await expect(
      createAccessGrant(context, {
        email: "never-created@example.com",
        role: "ADMIN",
        enabled: true,
      }),
    ).rejects.toMatchObject({
      code:
        state === "disabled" || state === "deleted"
          ? "DENIED"
          : "UNAUTHENTICATED",
    });
    expect(
      await getDatabase().accessGrant.findUnique({
        where: { email: "never-created@example.com" },
      }),
    ).toBeNull();
  },
);

it.each(["EDITOR", "VIEWER"] as const)(
  "denies all direct grant services to %s",
  async (role) => {
    const { context, grant } = await actor(role);
    for (const operation of [
      () => listAccessGrants(context),
      () =>
        createAccessGrant(context, {
          email: "new@example.com",
          role: "ADMIN",
          enabled: true,
        }),
      () =>
        updateAccessGrant(context, {
          id: grant.id,
          role: "ADMIN",
          enabled: true,
        }),
      () => deleteAccessGrant(context, { id: grant.id }),
    ])
      await expect(operation()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      await getDatabase().accessGrant.findUnique({ where: { id: grant.id } }),
    ).toMatchObject({ role, enabled: true });
  },
);

it("creates, lists, updates and deletes a normalized grant without creating identity", async () => {
  const { context } = await actor("ADMIN");
  const created = await createAccessGrant(context, {
    email: " New+copy@EXAMPLE.COM ",
    role: "EDITOR",
  });
  expect(created).toEqual({
    id: expect.any(String),
    email: "new+copy@example.com",
    role: "EDITOR",
    enabled: false,
  });
  expect(await listAccessGrants(context)).toContainEqual(created);
  expect(
    await updateAccessGrant(context, {
      id: created.id,
      role: "VIEWER",
      enabled: true,
    }),
  ).toEqual({ ...created, role: "VIEWER", enabled: true });
  expect(await deleteAccessGrant(context, { id: created.id })).toEqual({
    id: created.id,
  });
  expect(await getDatabase().user.count()).toBe(1);
  expect(await getDatabase().session.count()).toBe(1);
});

it.each(["old", "future"] as const)(
  "requires fresh session creation for %s sessions, not a refreshed updatedAt",
  async (state) => {
    const { context, session, grant } = await actor("ADMIN");
    await getDatabase().session.update({
      where: { id: session.id },
      data: {
        createdAt: new Date(Date.now() + (state === "old" ? -360000 : 60000)),
        updatedAt: new Date(),
      },
    });
    await expect(
      requirePermission(context, "private.read"),
    ).resolves.toMatchObject({ role: "ADMIN" });
    await expect(listAccessGrants(context)).resolves.toHaveLength(1);
    for (const operation of [
      () =>
        createAccessGrant(context, {
          email: "other@example.com",
          role: "VIEWER",
        }),
      () =>
        updateAccessGrant(context, {
          id: grant.id,
          role: "ADMIN",
          enabled: true,
        }),
      () => deleteAccessGrant(context, { id: grant.id }),
    ])
      await expect(operation()).rejects.toMatchObject({
        code: "REAUTHENTICATION_REQUIRED",
      });
  },
);

it.each(["disable", "demote", "delete"] as const)(
  "cannot %s the last enabled admin, including self",
  async (action) => {
    const { context, grant } = await actor("ADMIN");
    // A disabled ADMIN is not a backup administrator.
    await createAccessGrant(context, {
      email: "disabled-admin@example.com",
      role: "ADMIN",
    });
    const operation =
      action === "delete"
        ? deleteAccessGrant(context, { id: grant.id })
        : updateAccessGrant(context, {
            id: grant.id,
            role: action === "demote" ? "EDITOR" : "ADMIN",
            enabled: action !== "disable",
          });
    await expect(operation).rejects.toMatchObject({ code: "LAST_ADMIN" });
    expect(
      await getDatabase().accessGrant.findUnique({ where: { id: grant.id } }),
    ).toMatchObject({ role: "ADMIN", enabled: true });
  },
);

it("permits self demotion when a backup admin exists and denies subsequent stale-context administration", async () => {
  const { context, grant } = await actor("ADMIN");
  await createAccessGrant(context, {
    email: "backup@example.com",
    role: "ADMIN",
    enabled: true,
  });
  await updateAccessGrant(context, {
    id: grant.id,
    role: "VIEWER",
    enabled: true,
  });
  await expect(listAccessGrants(context)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(
    requirePermission(context, "private.read"),
  ).resolves.toMatchObject({ role: "VIEWER" });
});

it.each(["self", "other"] as const)(
  "serializes concurrent %s-admin removal and rechecks the waiting actor",
  async (target) => {
    const first = await actor("ADMIN", "first@example.com");
    const second = await actor("ADMIN", "second@example.com");
    const results = await Promise.allSettled([
      updateAccessGrant(first.context, {
        id: target === "self" ? first.grant.id : second.grant.id,
        role: "ADMIN",
        enabled: false,
      }),
      updateAccessGrant(second.context, {
        id: target === "self" ? second.grant.id : first.grant.id,
        role: "ADMIN",
        enabled: false,
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find(
      (result) => result.status === "rejected",
    ) as PromiseRejectedResult;
    expect(rejected.reason.code).toBe(
      target === "self" ? "LAST_ADMIN" : "DENIED",
    );
    expect(
      await getDatabase().accessGrant.count({
        where: { role: "ADMIN", enabled: true },
      }),
    ).toBe(1);
  },
);

it("rejects duplicate, invalid and unexpected authority fields without changing grants", async () => {
  const { context, grant } = await actor("ADMIN");
  await expect(
    createAccessGrant(context, { email: " ADMIN@EXAMPLE.COM ", role: "ADMIN" }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  for (const input of [
    { email: "bad", role: "ADMIN" },
    { email: "valid@example.com", role: "OWNER" },
    { email: "valid@example.com", role: "VIEWER", actorRole: "ADMIN" },
  ])
    await expect(createAccessGrant(context, input)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  await expect(
    updateAccessGrant(context, {
      id: grant.id,
      role: "ADMIN",
      enabled: true,
      email: "rename@example.com",
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    deleteAccessGrant(context, { id: "bad-id" }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    updateAccessGrant(context, {
      id: randomUUID(),
      role: "VIEWER",
      enabled: true,
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    deleteAccessGrant(context, { id: randomUUID() }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await getDatabase().accessGrant.count()).toBe(1);
});

it("rejects a completely fabricated direct-service actor", async () => {
  await expect(
    createAccessGrant({ role: "ADMIN" } as PrivateAccessContext, {
      email: "fake@example.com",
      role: "ADMIN",
      enabled: true,
    }),
  ).rejects.toMatchObject({ code: "DENIED" });
  expect(await getDatabase().accessGrant.count()).toBe(0);
});
