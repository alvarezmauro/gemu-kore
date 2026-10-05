import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import {
  requirePrivateAccess,
  type PrivateAccessContext,
} from "@/server/auth/access";
import { disconnectDatabase, getDatabase } from "@/server/db/client";
import {
  getDefectManagement,
  mutateDefect,
} from "@/server/services/collection/defects";
import { withTransaction } from "@/server/db/transaction";
import type { AccessRole } from "@/features/auth/contracts";
import type { DefectSeverity } from "@/features/defects/contracts";
import { signedSessionCookie } from "../helpers/access-session";
import * as defectRepository from "@/server/repositories/collection/defects";

const db = getDatabase();
const secret = "defect-integration-secret-longer-than-thirty-two-characters";
async function actor(role: AccessRole = "EDITOR") {
  const email = `${randomUUID()}@example.com`;
  const user = await db.user.create({
    data: { name: "Defect fixture", email, emailVerified: true },
  });
  const session = await db.session.create({
    data: {
      userId: user.id,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  const grant = await db.accessGrant.create({
    data: { email, role, enabled: true },
  });
  const context = await requirePrivateAccess(
    new Headers({
      Cookie: `gemukore.session_token=${signedSessionCookie(session.token, secret)}`,
    }),
  );
  return { context, grant, user, session };
}
async function copies() {
  const platform = await db.consolePlatform.create({
    data: { name: "PlayStation", slug: randomUUID() },
  });
  const model = await db.consoleModel.create({
    data: { name: "SCPH-1001", slug: randomUUID(), platformId: platform.id },
  });
  const game = await db.game.create({
    data: { name: "Chrono Cross", slug: randomUUID() },
  });
  const release = await db.gameRelease.create({
    data: {
      gameId: game.id,
      platformId: platform.id,
      slug: randomUUID(),
      editionName: "Original",
    },
  });
  const accessory = await db.accessory.create({
    data: { name: "Controller", slug: randomUUID() },
  });
  const variant = await db.accessoryVariant.create({
    data: { name: "Gray", accessoryId: accessory.id, slug: randomUUID() },
  });
  const first = await db.collectionItem.create({
    data: {
      type: "GAME",
      notes: "Do not expose",
      serialNumber: "Private serial",
      ownedGame: { create: { gameReleaseId: release.id } },
    },
  });
  const second = await db.collectionItem.create({
    data: {
      type: "GAME",
      ownedGame: { create: { gameReleaseId: release.id } },
    },
  });
  const consoleCopy = await db.collectionItem.create({
    data: {
      type: "CONSOLE",
      ownedConsole: { create: { consoleModelId: model.id } },
    },
  });
  const accessoryCopy = await db.collectionItem.create({
    data: {
      type: "ACCESSORY",
      ownedAccessory: { create: { accessoryVariantId: variant.id } },
    },
  });
  return { first, second, consoleCopy, accessoryCopy, release };
}
async function input(
  context: PrivateAccessContext,
  collectionItemId: string,
  fields: object = {},
) {
  const { selected } = await getDefectManagement(context, collectionItemId);
  return {
    operation: "create",
    collectionItemId,
    expectedRevision: selected!.revision,
    title: "Scratch",
    description: "",
    severity: "COSMETIC",
    status: "ACTIVE",
    repairNote: "",
    ...fields,
  };
}
async function create(
  context: PrivateAccessContext,
  collectionItemId: string,
  fields: object = {},
) {
  await mutateDefect(context, await input(context, collectionItemId, fields));
  return (await getDefectManagement(context, collectionItemId)).defects.at(-1)!;
}
async function reset() {
  await db.$executeRaw`TRUNCATE TABLE collection_item, console_platform, game, accessory CASCADE`;
  await db.publicSettings.update({
    where: { id: 1 },
    data: { showDefects: false, publicCollectionEnabled: false },
  });
  await db.accessGrant.deleteMany();
  await db.user.deleteMany();
}
beforeEach(async () => {
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3002");
  vi.stubEnv("BETTER_AUTH_SECRET", secret);
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
  vi.stubEnv("GITHUB_CLIENT_ID", "");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "");
  await reset();
});
afterAll(async () => {
  await reset();
  await disconnectDatabase();
  vi.unstubAllEnvs();
});

it("returns an honest empty collection without creating placeholder copies", async () => {
  const { context } = await actor();
  expect(await getDefectManagement(context)).toEqual({
    items: [],
    selected: null,
    defects: [],
    canManage: true,
  });
  expect(await db.collectionItem.count()).toBe(0);
});
it.each(["ADMIN", "EDITOR"] as const)(
  "supports %s CRUD and advances the copy revision and actor atomically",
  async (role) => {
    const { context, user } = await actor(role);
    const { first } = await copies();
    const defect = await create(context, first.id, {
      title: " Broken hinge ",
      description: " Right side ",
      severity: "MAJOR",
    });
    expect(defect).toMatchObject({
      collectionItemId: first.id,
      title: "Broken hinge",
      description: "Right side",
      severity: "MAJOR",
      status: "ACTIVE",
      resolvedAt: null,
      repairNote: null,
    });
    expect(
      await db.collectionItem.findUniqueOrThrow({ where: { id: first.id } }),
    ).toMatchObject({ revision: 2, updatedById: user.id });
    await mutateDefect(
      context,
      await input(context, first.id, {
        operation: "update",
        id: defect.id,
        title: "Hinge",
        status: "ACCEPTED",
      }),
    );
    expect(
      (await getDefectManagement(context, first.id)).defects[0],
    ).toMatchObject({ title: "Hinge", status: "ACCEPTED", resolvedAt: null });
    await mutateDefect(context, {
      operation: "delete",
      collectionItemId: first.id,
      expectedRevision: 3,
      id: defect.id,
    });
    expect((await getDefectManagement(context, first.id)).defects).toEqual([]);
    expect(
      (await db.collectionItem.findUniqueOrThrow({ where: { id: first.id } }))
        .revision,
    ).toBe(4);
  },
);
it.each(["COSMETIC", "MINOR", "MAJOR", "CRITICAL"] as const)(
  "retains the specified %s severity",
  async (severity: DefectSeverity) => {
    const { context } = await actor();
    const { first } = await copies();
    expect(await create(context, first.id, { severity })).toMatchObject({
      severity,
    });
  },
);
it("isolates two owned copies of the same canonical release and never edits catalog facts", async () => {
  const { context } = await actor();
  const { first, second, release } = await copies();
  const canonical = await db.gameRelease.findUniqueOrThrow({
    where: { id: release.id },
  });
  await create(context, first.id);
  expect((await getDefectManagement(context, second.id)).defects).toEqual([]);
  expect(
    (await db.collectionItem.findUniqueOrThrow({ where: { id: second.id } }))
      .revision,
  ).toBe(1);
  expect(
    await db.gameRelease.findUniqueOrThrow({ where: { id: release.id } }),
  ).toEqual(canonical);
});
it("returns narrow copy identities for all three types and keeps unneeded personal data out of the DTO", async () => {
  const { context } = await actor();
  const { first } = await copies();
  const result = await getDefectManagement(context, first.id);
  expect(result.items.map((item) => item.label)).toEqual(
    expect.arrayContaining([
      expect.stringContaining("Chrono Cross · PlayStation · Original"),
      expect.stringContaining("PlayStation · SCPH-1001"),
      expect.stringContaining("Controller · Gray"),
    ]),
  );
  expect(new Set(result.items.map((item) => item.label)).size).toBe(4);
  const serialized = JSON.stringify(result);
  expect(serialized).not.toContain("Do not expose");
  expect(serialized).not.toContain("Private serial");
  expect(serialized).not.toContain("normalizedName");
});
it("records repair dates, preserves them on later edits and retains notes when reopened", async () => {
  const { context } = await actor();
  const { first } = await copies();
  const defect = await create(context, first.id);
  const started = Date.now();
  await mutateDefect(
    context,
    await input(context, first.id, {
      operation: "update",
      id: defect.id,
      status: "REPAIRED",
      repairNote: "Replaced the hinge",
    }),
  );
  let saved = (await getDefectManagement(context, first.id)).defects[0];
  const repairDate = saved.resolvedAt;
  expect(Date.parse(repairDate!)).toBeGreaterThanOrEqual(started);
  expect(saved.repairNote).toBe("Replaced the hinge");
  await mutateDefect(
    context,
    await input(context, first.id, {
      operation: "update",
      id: defect.id,
      status: "REPAIRED",
      title: "Repaired hinge",
      repairNote: "Replaced the hinge",
    }),
  );
  expect(
    (await getDefectManagement(context, first.id)).defects[0].resolvedAt,
  ).toBe(repairDate);
  await mutateDefect(
    context,
    await input(context, first.id, {
      operation: "update",
      id: defect.id,
      status: "ACTIVE",
      repairNote: "Replaced the hinge; problem returned",
    }),
  );
  saved = (await getDefectManagement(context, first.id)).defects[0];
  expect(saved).toMatchObject({
    id: defect.id,
    resolvedAt: null,
    repairNote: "Replaced the hinge; problem returned",
  });
});
it("allows already repaired records and keeps accepted defects unresolved", async () => {
  const { context } = await actor();
  const { first } = await copies();
  expect(await create(context, first.id, { status: "REPAIRED" })).toMatchObject(
    { status: "REPAIRED", resolvedAt: expect.any(String) },
  );
  expect(
    await create(context, first.id, {
      title: "Yellowed plastic",
      status: "ACCEPTED",
    }),
  ).toMatchObject({ status: "ACCEPTED", resolvedAt: null });
});
it("rejects a defect ID from another copy for both update and deletion", async () => {
  const { context } = await actor();
  const { first, second } = await copies();
  const defect = await create(context, first.id);
  for (const operation of ["update", "delete"]) {
    const payload =
      operation === "update"
        ? await input(context, second.id, { operation, id: defect.id })
        : {
            operation,
            collectionItemId: second.id,
            expectedRevision: 1,
            id: defect.id,
          };
    await expect(mutateDefect(context, payload)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  }
  expect((await getDefectManagement(context, first.id)).defects).toHaveLength(
    1,
  );
  expect(
    (await getDefectManagement(context, second.id)).selected?.revision,
  ).toBe(1);
});
it("rejects all direct viewer mutations and fabricated authority while allowing private reads", async () => {
  const editor = await actor();
  const { first } = await copies();
  const defect = await create(editor.context, first.id);
  const viewer = await actor("VIEWER");
  expect((await getDefectManagement(viewer.context, first.id)).canManage).toBe(
    false,
  );
  for (const payload of [
    await input(editor.context, first.id),
    await input(editor.context, first.id, {
      operation: "update",
      id: defect.id,
    }),
    {
      operation: "delete",
      collectionItemId: first.id,
      expectedRevision: 2,
      id: defect.id,
    },
  ])
    await expect(mutateDefect(viewer.context, payload)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  await expect(
    mutateDefect(
      JSON.parse(JSON.stringify({ ...viewer.context, role: "ADMIN" })),
      await input(editor.context, first.id),
    ),
  ).rejects.toMatchObject({ code: "DENIED" });
  expect(
    (await getDefectManagement(editor.context, first.id)).selected?.revision,
  ).toBe(2);
});
it.each(["demote", "disable", "expire", "revoke", "unverified"] as const)(
  "rechecks %s identity before a defect change",
  async (state) => {
    const { context, grant, session, user } = await actor();
    const { first } = await copies();
    const payload = await input(context, first.id);
    if (state === "demote")
      await db.accessGrant.update({
        where: { id: grant.id },
        data: { role: "VIEWER" },
      });
    if (state === "disable")
      await db.accessGrant.update({
        where: { id: grant.id },
        data: { enabled: false },
      });
    if (state === "expire")
      await db.session.update({
        where: { id: session.id },
        data: { expiresAt: new Date(0) },
      });
    if (state === "revoke")
      await db.session.delete({ where: { id: session.id } });
    if (state === "unverified")
      await db.user.update({
        where: { id: user.id },
        data: { emailVerified: false },
      });
    await expect(mutateDefect(context, payload)).rejects.toMatchObject({
      code:
        state === "demote"
          ? "FORBIDDEN"
          : state === "disable"
            ? "DENIED"
            : "UNAUTHENTICATED",
    });
    expect(await db.defect.count()).toBe(0);
    expect(
      (await db.collectionItem.findUniqueOrThrow({ where: { id: first.id } }))
        .revision,
    ).toBe(1);
  },
);
it("serializes simultaneous edits so one stale mutation rolls back", async () => {
  const { context } = await actor();
  const { first } = await copies();
  const payload = await input(context, first.id);
  const results = await Promise.allSettled([
    mutateDefect(context, { ...payload, title: "First" }),
    mutateDefect(context, { ...payload, title: "Second" }),
  ]);
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(
    (
      results.find(
        (result) => result.status === "rejected",
      ) as PromiseRejectedResult
    ).reason.code,
  ).toBe("STALE");
  expect(await db.defect.count()).toBe(1);
  expect(
    (await db.collectionItem.findUniqueOrThrow({ where: { id: first.id } }))
      .revision,
  ).toBe(2);
});
it("rejects stale updates and deletions without losing repaired records", async () => {
  const { context } = await actor();
  const { first } = await copies();
  const defect = await create(context, first.id);
  const stale = await input(context, first.id, {
    operation: "update",
    id: defect.id,
  });
  await mutateDefect(context, { ...stale, status: "REPAIRED" });
  await expect(mutateDefect(context, stale)).rejects.toMatchObject({
    code: "STALE",
  });
  await expect(
    mutateDefect(context, {
      operation: "delete",
      collectionItemId: first.id,
      expectedRevision: 2,
      id: defect.id,
    }),
  ).rejects.toMatchObject({ code: "STALE" });
  expect((await getDefectManagement(context, first.id)).defects[0].status).toBe(
    "REPAIRED",
  );
});
it.each([false, true])(
  "preserves private-field approval boundaries when showDefects is %s",
  async (showDefects) => {
    const { context, user } = await actor();
    const { first } = await copies();
    await db.publicSettings.update({ where: { id: 1 }, data: { showDefects } });
    await db.collectionItem.update({
      where: { id: first.id },
      data: {
        publicationStatus: "PUBLISHED",
        publishedAt: new Date(),
        publishedById: user.id,
      },
    });
    await create(context, first.id);
    expect(
      await db.collectionItem.findUniqueOrThrow({ where: { id: first.id } }),
    ).toMatchObject(
      showDefects
        ? {
            publicationStatus: "PRIVATE",
            publishedAt: null,
            publishedById: null,
          }
        : { publicationStatus: "PUBLISHED", publishedById: user.id },
    );
  },
);
it.each([
  { title: " " },
  { severity: "INVALID" },
  { status: "UNKNOWN" },
  { role: "ADMIN" },
  { resolvedAt: "2026-10-05T00:00:00Z" },
  { publicationStatus: "PUBLISHED" },
  { expectedRevision: 0 },
  { description: "x".repeat(4001) },
])("rejects malformed or server-owned fields %j", async (fields) => {
  const { context } = await actor();
  const { first } = await copies();
  await expect(
    mutateDefect(context, await input(context, first.id, fields)),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(await db.defect.count()).toBe(0);
  expect(
    (await getDefectManagement(context, first.id)).selected?.revision,
  ).toBe(1);
});
it("rejects missing and malformed items and non-scalar selection input", async () => {
  const { context } = await actor();
  for (const id of [randomUUID(), "bad", [randomUUID()]])
    await expect(getDefectManagement(context, id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  await expect(
    mutateDefect(context, {
      operation: "create",
      collectionItemId: randomUUID(),
      expectedRevision: 1,
      title: "Scratch",
      description: "",
      severity: "MINOR",
      status: "ACTIVE",
      repairNote: "",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("cascades defect records only with their owned root, preserving other copies and catalog", async () => {
  const { context } = await actor();
  const { first, second, release } = await copies();
  await create(context, first.id);
  await create(context, second.id);
  await db.collectionItem.delete({ where: { id: first.id } });
  expect(await db.defect.count()).toBe(1);
  expect((await getDefectManagement(context, second.id)).defects).toHaveLength(
    1,
  );
  expect(
    await db.gameRelease.findUnique({ where: { id: release.id } }),
  ).not.toBeNull();
});
it("rolls back a defect insert when advancing the owned aggregate fails", async () => {
  const { context } = await actor();
  const { first } = await copies();
  // Test-only trigger in the disposable database verifies the actual outer transaction.
  await db.$executeRaw`CREATE FUNCTION defect_revision_probe() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END; $$`;
  await db.$executeRaw`CREATE TRIGGER defect_revision_probe BEFORE UPDATE ON collection_item FOR EACH ROW EXECUTE FUNCTION defect_revision_probe()`;
  try {
    await expect(
      mutateDefect(context, await input(context, first.id)),
    ).rejects.toThrow();
    expect(await db.defect.count()).toBe(0);
  } finally {
    await db.$executeRaw`DROP TRIGGER defect_revision_probe ON collection_item`;
    await db.$executeRaw`DROP FUNCTION defect_revision_probe()`;
  }
});
it("does not overwrite a concurrent aggregate change from a writer using revision compare-and-swap", async () => {
  const { context } = await actor();
  const { first } = await copies();
  const payload = await input(context, first.id);
  await withTransaction((transaction) =>
    transaction.collectionItem.update({
      where: { id: first.id },
      data: { revision: { increment: 1 }, notes: "Newer private notes" },
    }),
  );
  await expect(mutateDefect(context, payload)).rejects.toMatchObject({
    code: "STALE",
  });
  expect(await db.defect.count()).toBe(0);
});

it("permits absent optional notes and the default active status", async () => {
  const { context } = await actor();
  const { first } = await copies();
  await mutateDefect(context, {
    operation: "create",
    collectionItemId: first.id,
    expectedRevision: 1,
    title: "Scratch",
    severity: "COSMETIC",
  });
  expect(
    (await getDefectManagement(context, first.id)).defects[0],
  ).toMatchObject({
    description: null,
    repairNote: null,
    status: "ACTIVE",
    resolvedAt: null,
  });
});

it.each(["consoleCopy", "accessoryCopy"] as const)(
  "records defects against the owned %s without changing its canonical identity",
  async (key) => {
    const { context } = await actor();
    const fixture = await copies();
    await create(context, fixture[key].id, {
      title: "Intermittent connection",
      severity: "MINOR",
    });
    expect(
      (await getDefectManagement(context, fixture[key].id)).defects[0]
        .collectionItemId,
    ).toBe(fixture[key].id);
    expect(
      (await getDefectManagement(context, fixture.first.id)).defects,
    ).toEqual([]);
  },
);

it.each(["create", "update", "delete"] as const)(
  "resets public defect approval for an administrator's %s operation",
  async (operation) => {
    const { context, user } = await actor("ADMIN");
    const { first } = await copies();
    const defect = await create(context, first.id);
    await db.publicSettings.update({
      where: { id: 1 },
      data: { showDefects: true },
    });
    await db.collectionItem.update({
      where: { id: first.id },
      data: {
        publicationStatus: "PUBLISHED",
        publishedAt: new Date(),
        publishedById: user.id,
      },
    });
    const payload =
      operation === "delete"
        ? {
            operation,
            id: defect.id,
            collectionItemId: first.id,
            expectedRevision: 2,
          }
        : await input(context, first.id, {
            operation,
            ...(operation === "update"
              ? { id: defect.id, status: "REPAIRED" }
              : {}),
          });
    await mutateDefect(context, payload);
    expect(
      await db.collectionItem.findUniqueOrThrow({ where: { id: first.id } }),
    ).toMatchObject({
      revision: 3,
      publicationStatus: "PRIVATE",
      publishedAt: null,
      publishedById: null,
    });
  },
);

it("revalidates the waiting actor after the copy row lock becomes available", async () => {
  const { context, grant } = await actor();
  const { first } = await copies();
  const payload = await input(context, first.id);
  let release!: () => void;
  let locked!: () => void;
  let attempted!: () => void;
  const held = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    attempted = resolve;
  });
  const holder = withTransaction(async (transaction) => {
    await defectRepository.lockDefectItem(first.id, transaction);
    locked();
    await gate;
  });
  await held;
  const original = defectRepository.lockDefectItem;
  const spy = vi
    .spyOn(defectRepository, "lockDefectItem")
    .mockImplementation(async (...arguments_) => {
      attempted();
      return original(...arguments_);
    });
  const mutation = mutateDefect(context, payload);
  const result = expect(mutation).rejects.toMatchObject({ code: "FORBIDDEN" });
  try {
    await waiting;
    await db.accessGrant.update({
      where: { id: grant.id },
      data: { role: "VIEWER" },
    });
    release();
    await holder;
    await result;
    expect(await db.defect.count()).toBe(0);
    expect(
      (await db.collectionItem.findUniqueOrThrow({ where: { id: first.id } }))
        .revision,
    ).toBe(1);
  } finally {
    release();
    await holder;
    spy.mockRestore();
  }
});
