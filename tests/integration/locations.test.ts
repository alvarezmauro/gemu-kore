import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import {
  requirePrivateAccess,
  type PrivateAccessContext,
} from "@/server/auth/access";
import { disconnectDatabase, getDatabase } from "@/server/db/client";
import { getLocations, mutateLocation } from "@/server/services/locations";
import type { AccessRole } from "@/features/auth/contracts";
import type { LocationEntry } from "@/features/locations/contracts";
import { signedSessionCookie } from "../helpers/access-session";

const db = getDatabase();
const secret = "location-integration-secret-longer-than-thirty-two-characters";
async function actor(role: AccessRole = "EDITOR") {
  const email = `${randomUUID()}@example.com`;
  const user = await db.user.create({
    data: { name: "Location fixture", email, emailVerified: true },
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
  return { context, grant, session, user };
}
async function create(
  context: PrivateAccessContext,
  name: string,
  parentId: string | null = null,
) {
  await mutateLocation(context, {
    operation: "create",
    name,
    parentId,
    type: "CUSTOM",
    description: "",
  });
  return (await getLocations(context)).locations.find(
    (location) =>
      location.name === name.trim() && location.parentId === parentId,
  )!;
}
const edit = (location: LocationEntry, fields: object = {}) => ({
  operation: "update",
  id: location.id,
  updatedAt: location.updatedAt,
  name: location.name,
  type: location.type,
  parentId: location.parentId,
  description: location.description ?? "",
  ...fields,
});
const remove = (location: LocationEntry) => ({
  operation: "delete",
  id: location.id,
  updatedAt: location.updatedAt,
});
beforeEach(async () => {
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3002");
  vi.stubEnv("BETTER_AUTH_SECRET", secret);
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
  vi.stubEnv("GITHUB_CLIENT_ID", "");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "");
  await db.$executeRaw`TRUNCATE TABLE location, collection_item, console_platform, game CASCADE`;
  await db.accessGrant.deleteMany();
  await db.user.deleteMany();
});
afterAll(async () => {
  await db.$executeRaw`TRUNCATE TABLE location, collection_item, console_platform, game CASCADE`;
  await db.accessGrant.deleteMany();
  await db.user.deleteMany();
  await disconnectDatabase();
  vi.unstubAllEnvs();
});

it.each(["ADMIN", "EDITOR"] as const)(
  "allows %s CRUD with normalized names and descriptive types",
  async (role) => {
    const { context } = await actor(role);
    const location = await create(context, " Home ");
    expect(location).toMatchObject({
      name: "Home",
      parentId: null,
      childCount: 0,
      itemCount: 0,
    });
    await mutateLocation(
      context,
      edit(location, {
        name: " Studio ",
        type: "ROOM",
        description: " Work room ",
      }),
    );
    const saved = (await getLocations(context)).locations[0];
    expect(saved).toMatchObject({
      id: location.id,
      name: "Studio",
      type: "ROOM",
      description: "Work room",
    });
    expect(saved.updatedAt).not.toBe(location.updatedAt);
    await mutateLocation(context, remove(saved));
    expect((await getLocations(context)).locations).toEqual([]);
  },
);
it("allows viewer reads but rejects every forged mutation and serialized authority", async () => {
  const editor = await actor();
  const location = await create(editor.context, "Private room");
  const viewer = await actor("VIEWER");
  expect(await getLocations(viewer.context)).toMatchObject({
    canManage: false,
    locations: [{ name: "Private room" }],
  });
  for (const input of [
    {
      operation: "create",
      name: "Forged",
      type: "ROOM",
      description: "",
      parentId: null,
    },
    edit(location),
    remove(location),
    {
      operation: "reorder",
      id: location.id,
      updatedAt: location.updatedAt,
      direction: "up",
    },
  ]) {
    await expect(mutateLocation(viewer.context, input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  }
  await expect(
    mutateLocation(
      JSON.parse(JSON.stringify({ ...viewer.context, role: "ADMIN" })),
      remove(location),
    ),
  ).rejects.toMatchObject({ code: "DENIED" });
  expect(await db.location.count()).toBe(1);
});
it.each(["demote", "disable", "expire", "revoke"] as const)(
  "revalidates %s after a form is opened",
  async (state) => {
    const { context, grant, session } = await actor();
    const location = await create(context, "Shelf");
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
    await expect(
      mutateLocation(context, edit(location, { name: "Should not save" })),
    ).rejects.toMatchObject({
      code:
        state === "demote"
          ? "FORBIDDEN"
          : state === "disable"
            ? "DENIED"
            : "UNAUTHENTICATED",
    });
    expect(
      (await db.location.findUniqueOrThrow({ where: { id: location.id } }))
        .name,
    ).toBe("Shelf");
  },
);
it("enforces case-insensitive root and sibling uniqueness but permits names under different parents", async () => {
  const { context } = await actor();
  const home = await create(context, "Home");
  const other = await create(context, "Other");
  for (const name of ["home", " HOME "])
    await expect(create(context, name)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  await create(context, "Shelf", home.id);
  await create(context, "Shelf", other.id);
  await expect(create(context, "SHELF", home.id)).rejects.toMatchObject({
    code: "CONFLICT",
  });
});
it("uses PostgreSQL normalization for non-ASCII names and safely stores literal punctuation", async () => {
  const { context } = await actor();
  for (const name of ["İstanbul", "ゲームの棚", "Mauro’s / shelf <script>"]) {
    const location = await create(context, name);
    expect(location.name).toBe(name);
  }
  expect(await db.location.count()).toBe(3);
});
it("moves a subtree, updates derived breadcrumbs and retains IDs and descendants", async () => {
  const { context } = await actor();
  const home = await create(context, "Home");
  const office = await create(context, "Office", home.id);
  const cabinet = await create(context, "Cabinet", office.id);
  const shelf = await create(context, "Shelf", cabinet.id);
  const other = await create(context, "Other");
  await mutateLocation(
    context,
    edit(office, { parentId: other.id, name: "Studio" }),
  );
  const saved = (await getLocations(context)).locations;
  expect(
    saved
      .find((location) => location.id === shelf.id)
      ?.path.map((part) => part.name),
  ).toEqual(["Other", "Studio", "Cabinet", "Shelf"]);
  expect(saved.find((location) => location.id === cabinet.id)?.parentId).toBe(
    office.id,
  );
  await expect(mutateLocation(context, remove(home))).resolves.toBeUndefined();
});
it.each(["self", "descendant"] as const)(
  "rejects a forged move into %s atomically",
  async (target) => {
    const { context } = await actor();
    const root = await create(context, "Root");
    const child = await create(context, "Child", root.id);
    await expect(
      mutateLocation(
        context,
        edit(root, {
          name: "Renamed",
          parentId: target === "self" ? root.id : child.id,
        }),
      ),
    ).rejects.toMatchObject({ code: "CYCLE" });
    expect((await getLocations(context)).locations[0]).toMatchObject({
      name: "Root",
      parentId: null,
    });
  },
);
it("serializes cross-moves so concurrent requests cannot create a cycle", async () => {
  const { context } = await actor();
  const a = await create(context, "A");
  const b = await create(context, "B");
  const result = await Promise.allSettled([
    mutateLocation(context, edit(a, { parentId: b.id })),
    mutateLocation(context, edit(b, { parentId: a.id })),
  ]);
  expect(result.filter((value) => value.status === "fulfilled")).toHaveLength(
    1,
  );
  expect(
    (
      result.find(
        (value) => value.status === "rejected",
      ) as PromiseRejectedResult
    ).reason.code,
  ).toBe("CYCLE");
  expect((await getLocations(context)).locations).toHaveLength(2);
});
it("serializes duplicate creation under the same parent", async () => {
  const { context } = await actor();
  const result = await Promise.allSettled([
    create(context, "Shelf"),
    create(context, "SHELF"),
  ]);
  expect(result.filter((value) => value.status === "fulfilled")).toHaveLength(
    1,
  );
  expect(
    (
      result.find(
        (value) => value.status === "rejected",
      ) as PromiseRejectedResult
    ).reason.code,
  ).toBe("CONFLICT");
});
it("reorders only siblings even when orders contain gaps or ties", async () => {
  const { context } = await actor();
  const root = await create(context, "Root");
  const a = await create(context, "A", root.id);
  const b = await create(context, "B", root.id);
  const other = await create(context, "Other");
  await db.location.updateMany({
    where: { parentId: root.id },
    data: { sortOrder: 7 },
  });
  const before = (await getLocations(context)).locations.filter(
    (location) => location.parentId === root.id,
  );
  const second = before[1];
  await mutateLocation(context, {
    operation: "reorder",
    id: second.id,
    updatedAt: second.updatedAt,
    direction: "up",
  });
  const after = (await getLocations(context)).locations;
  expect(
    after
      .filter((location) => location.parentId === root.id)
      .map((location) => location.id),
  ).toEqual([before[1].id, before[0].id]);
  expect(
    after
      .filter((location) => location.parentId === root.id)
      .map((location) => location.sortOrder),
  ).toEqual([0, 1]);
  expect(after.find((location) => location.id === other.id)?.sortOrder).toBe(
    other.sortOrder,
  );
  expect(new Set(after.map((location) => location.id))).toEqual(
    new Set([root.id, a.id, b.id, other.id]),
  );
});
it("keeps the existing sibling order on rename and appends a moved location at its destination", async () => {
  const { context } = await actor();
  const root = await create(context, "Root");
  const a = await create(context, "A", root.id);
  const b = await create(context, "B", root.id);
  const other = await create(context, "Other");
  await mutateLocation(context, edit(a, { name: "Renamed" }));
  const latest = (await getLocations(context)).locations.find(
    (location) => location.id === a.id,
  )!;
  expect(latest.sortOrder).toBe(a.sortOrder);
  await mutateLocation(context, edit(other, { parentId: root.id }));
  expect(
    (await getLocations(context)).locations
      .filter((location) => location.parentId === root.id)
      .map((location) => location.id),
  ).toEqual([a.id, b.id, other.id]);
});
it("blocks stale update, deletion and reorder without overwriting a newer edit", async () => {
  const { context } = await actor();
  const location = await create(context, "Original");
  await mutateLocation(context, edit(location, { name: "Newer" }));
  for (const input of [
    edit(location, { name: "Stale" }),
    remove(location),
    {
      operation: "reorder",
      id: location.id,
      updatedAt: location.updatedAt,
      direction: "up",
    },
  ])
    await expect(mutateLocation(context, input)).rejects.toMatchObject({
      code: "STALE",
    });
  expect((await getLocations(context)).locations[0].name).toBe("Newer");
});
it("blocks deletion with children, then permits deletion after the child moves to the root", async () => {
  const { context } = await actor();
  const root = await create(context, "Root");
  const child = await create(context, "Child", root.id);
  await expect(mutateLocation(context, remove(root))).rejects.toMatchObject({
    code: "IN_USE",
  });
  await mutateLocation(context, edit(child, { parentId: null }));
  await mutateLocation(context, remove(root));
  expect((await getLocations(context)).locations[0].id).toBe(child.id);
});
it("keeps owned item attachments when moving and blocks deletion of an occupied leaf", async () => {
  const { context } = await actor();
  const root = await create(context, "Root");
  const leaf = await create(context, "Leaf");
  const platform = await db.consolePlatform.create({
    data: { name: "Fixture", slug: randomUUID() },
  });
  const game = await db.game.create({
    data: { name: "Fixture", slug: randomUUID() },
  });
  const release = await db.gameRelease.create({
    data: { slug: randomUUID(), platformId: platform.id, gameId: game.id },
  });
  const item = await db.collectionItem.create({
    data: {
      type: "GAME",
      locationId: leaf.id,
      ownedGame: { create: { gameReleaseId: release.id } },
    },
  });
  await expect(mutateLocation(context, remove(leaf))).rejects.toMatchObject({
    code: "IN_USE",
  });
  await mutateLocation(context, edit(leaf, { parentId: root.id }));
  expect(
    (await db.collectionItem.findUniqueOrThrow({ where: { id: item.id } }))
      .locationId,
  ).toBe(leaf.id);
  expect(
    (await getLocations(context)).locations.find(
      (location) => location.id === leaf.id,
    )?.itemCount,
  ).toBe(1);
});
it("rolls back a move and rename when the destination already has that name", async () => {
  const { context } = await actor();
  const root = await create(context, "Root");
  await create(context, "Shelf", root.id);
  const other = await create(context, "Other");
  await expect(
    mutateLocation(context, edit(other, { name: "Shelf", parentId: root.id })),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(
    (await getLocations(context)).locations.find(
      (location) => location.id === other.id,
    ),
  ).toMatchObject({
    parentId: null,
    name: "Other",
    updatedAt: other.updatedAt,
  });
});
it.each([
  { name: " " },
  { name: "x".repeat(201) },
  { type: "INVALID" },
  { description: "x".repeat(2001) },
  { parentId: "bad" },
  { role: "ADMIN" },
  { sortOrder: -1 },
])("rejects malformed or unexpected data %j", async (fields) => {
  const { context } = await actor();
  await expect(
    mutateLocation(context, {
      operation: "create",
      name: "Home",
      type: "CUSTOM",
      parentId: null,
      description: "",
      ...fields,
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(await db.location.count()).toBe(0);
});
it("rejects missing locations/parents and fails closed on a corrupted direct-SQL cycle", async () => {
  const { context } = await actor();
  const root = await create(context, "Root");
  const child = await create(context, "Child", root.id);
  await expect(
    mutateLocation(context, edit(root, { parentId: randomUUID() })),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    mutateLocation(context, { ...remove(root), id: randomUUID() }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await db.location.update({
    where: { id: root.id },
    data: { parentId: child.id },
  });
  await expect(getLocations(context)).rejects.toMatchObject({
    code: "UNAVAILABLE",
  });
  await expect(mutateLocation(context, remove(child))).rejects.toMatchObject({
    code: "UNAVAILABLE",
  });
});
