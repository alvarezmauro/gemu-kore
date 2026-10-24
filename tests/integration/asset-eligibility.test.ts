import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { getDatabase, disconnectDatabase } from "@/server/db/client";
import { withTransaction } from "@/server/db/transaction";
import { createObjectLocator } from "@/server/storage/objects";
import { assetAdmission } from "@/server/services/public-collection/media";
import { requirePrivateAccess } from "@/server/auth/access";
import {
  reviewMediaUse,
  saveMediaUse,
} from "@/server/services/public-collection/media-reviews";
import { signedSessionCookie } from "../helpers/access-session";
const db = getDatabase();
const secret = "lineage-test-only-secret-longer-than-thirty-two-characters";
async function reset() {
  await db.$executeRaw`TRUNCATE asset, game CASCADE`;
  await db.accessGrant.deleteMany();
  await db.user.deleteMany();
}
beforeEach(async () => {
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3002");
  vi.stubEnv("BETTER_AUTH_SECRET", secret);
  vi.stubEnv("GOOGLE_CLIENT_ID", "fixture");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "fixture");
  vi.stubEnv("GITHUB_CLIENT_ID", "");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "");
  await reset();
});
afterAll(async () => {
  await reset();
  await disconnectDatabase();
  vi.unstubAllEnvs();
});

// Insert in source-before-derived order with lifecycle triggers enabled. These
// are relational fixtures: no byte delivery or personal object store is used.
async function graph(widths: number[]) {
  return withTransaction(async (tx) => {
    let sources: string[] = [];
    const layers: string[][] = [];
    for (const width of widths) {
      const ids = Array.from({ length: width }, () => randomUUID());
      await tx.asset.createMany({
        data: ids.map((id) => ({
          id,
          ...createObjectLocator(id, "image/webp"),
          kind: "IMAGE",
          scope: "CATALOG",
          deliveryClass: "DISPLAY",
          mimeType: "image/webp",
          sizeBytes: 1,
          width: 1,
          height: 1,
          sha256: "a".repeat(64),
          rightsStatus: "APPROVED",
        })),
      });
      if (sources.length)
        await tx.assetDependency.createMany({
          data: ids.flatMap((id) =>
            sources.map((sourceAssetId) => ({
              derivedAssetId: id,
              sourceAssetId,
              purpose: "RESIZE" as const,
            })),
          ),
        });
      await tx.asset.updateMany({
        where: { id: { in: ids } },
        data: { state: "READY", publicSafe: true, reviewedAt: new Date() },
      });
      layers.push(ids);
      sources = ids;
    }
    return { id: sources[0], layers };
  });
}
async function eligible(id: string) {
  const [row] = await db.$queryRaw<
    { eligible: boolean }[]
  >`SELECT asset_public_eligible(${id}::uuid) AS eligible`;
  return row.eligible;
}
async function admin() {
  const email = `${randomUUID()}@example.com`;
  const user = await db.user.create({
    data: { email, name: "Review fixture", emailVerified: true },
  });
  const session = await db.session.create({
    data: {
      userId: user.id,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  await db.accessGrant.create({
    data: { email, role: "ADMIN", enabled: true },
  });
  return requirePrivateAccess(
    new Headers({
      Cookie: `gemukore.session_token=${signedSessionCookie(session.token, secret)}`,
    }),
  );
}

it("approves and updates the 53-node shared-source graph without path expansion and observes rights withdrawal", async () => {
  const { id, layers } = await graph([...Array<number>(13).fill(4), 1]);
  expect(layers.flat()).toHaveLength(53);
  await withTransaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL statement_timeout = '2s'`;
    expect(
      await tx.$queryRaw`SELECT asset_public_eligible(${id}::uuid) AS eligible`,
    ).toEqual([{ eligible: true }]);
  });
  expect(
    await withTransaction((tx) => assetAdmission(tx)(id, "IMAGE")),
  ).toMatchObject({ id });
  const game = await db.game.create({
    data: { name: "Shared-source fixture", slug: randomUUID() },
  });
  const use = await db.catalogAsset.create({
    data: { gameId: game.id, assetId: id, role: "COVER" },
  });
  const actor = await admin(),
    input = {
      kind: "catalog",
      useId: use.id,
      displayAssetId: id,
      approved: true,
    };
  const review = await reviewMediaUse(actor, input);
  await saveMediaUse(actor, {
    ...input,
    reviewToken: review.reviewToken,
    reviewed: true,
  });
  expect(
    await db.catalogAsset.findUnique({ where: { id: use.id } }),
  ).toMatchObject({ publicApproved: true, publicDisplayAssetId: id });
  await db.catalogAsset.update({
    where: { id: use.id },
    data: { caption: "Updated reviewed use" },
  });
  await db.asset.update({
    where: { id: layers[0][0] },
    data: { rightsStatus: "RESTRICTED" },
  });
  expect(await eligible(id)).toBe(false);
  expect(
    await withTransaction((tx) => assetAdmission(tx)(id, "IMAGE")),
  ).toBeNull();
  await expect(
    db.catalogAsset.update({
      where: { id: use.id },
      data: { publicApproved: true, approvedAt: new Date() },
    }),
  ).rejects.toThrow();
  expect(
    await db.catalogAsset.findUnique({ where: { id: use.id } }),
  ).toMatchObject({ caption: "Updated reviewed use", publicApproved: false });
});

it.each([
  [16, true],
  [17, false],
] as const)(
  "checks depth %s in database and application",
  async (depth, admitted) => {
    const { id } = await graph(Array<number>(depth + 1).fill(1));
    expect(await eligible(id)).toBe(admitted);
    expect(
      Boolean(await withTransaction((tx) => assetAdmission(tx)(id, "IMAGE"))),
    ).toBe(admitted);
  },
);
it.each([
  [127, true],
  [128, false],
  [129, false],
] as const)(
  "checks %s immediate inputs and the total-node cap",
  async (width, admitted) => {
    const { id } = await graph([width, 1]);
    expect(await eligible(id)).toBe(admitted);
    expect(
      Boolean(await withTransaction((tx) => assetAdmission(tx)(id, "IMAGE"))),
    ).toBe(admitted);
  },
);
it("denies a missing output and rejects missing inputs at the foreign-key boundary", async () => {
  expect(await eligible(randomUUID())).toBe(false);
  const { id } = await graph([1]);
  await expect(
    db.assetDependency.create({
      data: {
        derivedAssetId: id,
        sourceAssetId: randomUUID(),
        purpose: "RESIZE",
      },
    }),
  ).rejects.toThrow();
});
it("fails closed on a corrupted cycle without unbounded recursion", async () => {
  const { id, layers } = await graph([1, 1]);
  await withTransaction(async (tx) => {
    // Corruption-only fixture; normal ingestion cannot create this cycle.
    await tx.$executeRaw`ALTER TABLE asset_dependency DISABLE TRIGGER asset_dependency_guard`;
    try {
      await tx.assetDependency.create({
        data: {
          derivedAssetId: layers[0][0],
          sourceAssetId: id,
          purpose: "RESIZE",
        },
      });
      expect(
        await tx.$queryRaw`SELECT asset_public_eligible(${id}::uuid) AS eligible`,
      ).toEqual([{ eligible: false }]);
      expect(await assetAdmission(tx)(id, "IMAGE")).toBeNull();
    } finally {
      await tx.$executeRaw`ALTER TABLE asset_dependency ENABLE TRIGGER asset_dependency_guard`;
    }
  });
});
