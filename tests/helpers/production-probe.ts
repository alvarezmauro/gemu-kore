import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { getDatabase, disconnectDatabase } from "../../src/server/db/client";
import { getObjectStorage } from "../../src/server/storage";

async function main() {
  if (
    !process.env.DATABASE_URL?.includes("/gemukore_test?schema=public") ||
    process.env.BETTER_AUTH_URL !== "https://127.0.0.1:3111"
  )
    throw new Error("Isolated production runner required");
  const db = getDatabase();
  const [command] = process.argv.slice(2);
  try {
    if (command === "privileges") {
      const url = new URL(process.env.DATABASE_URL!);
      url.username = "gemukore_app";
      // Password supplied only to the disposable operations container.
      url.password = process.env.TEST_APP_PASSWORD!;
      const { PrismaPg } = await import("@prisma/adapter-pg");
      const { PrismaClient } =
        await import("../../src/server/db/generated/client");
      const runtime = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url.href }),
      });
      try {
        const roles = await runtime.$queryRaw<
          {
            current_user: string;
            rolsuper: boolean;
            rolcreatedb: boolean;
            rolcreaterole: boolean;
          }[]
        >`
          SELECT current_user, rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user`;
        assert.equal(roles[0].current_user, "gemukore_app");
        assert.equal(
          roles[0].rolsuper || roles[0].rolcreatedb || roles[0].rolcreaterole,
          false,
        );
        await runtime.appSettings.findUniqueOrThrow({ where: { id: 1 } });
        await assert.rejects(
          runtime.$executeRawUnsafe(
            "CREATE TABLE public.must_not_exist (id integer)",
          ),
        );
        await assert.rejects(
          runtime.$queryRawUnsafe('SELECT * FROM "_prisma_migrations"'),
        );
      } finally {
        await runtime.$disconnect();
      }
      return;
    }
    const locator = {
      storageNamespace: "primary",
      objectKey:
        "assets/00000000-0000-4000-8000-000000000022/00000000-0000-4000-8000-000000000001.png",
    };
    const bytes = Buffer.from("retained production test object");
    const storage = getObjectStorage();
    if (command === "seed") {
      await db.appSettings.update({
        where: { id: 1 },
        data: { collectionDescription: "production persistence probe" },
      });
      await storage.put({
        locator,
        openBody: () => Readable.from(bytes),
        sizeBytes: bytes.length,
        contentType: "image/png",
        metadata: {
          assetId: "00000000-0000-4000-8000-000000000022",
          sha256: createHash("sha256").update(bytes).digest("hex"),
        },
      });
    } else if (command === "check") {
      assert.equal(
        (await db.appSettings.findUniqueOrThrow({ where: { id: 1 } }))
          .collectionDescription,
        "production persistence probe",
      );
      assert.equal((await storage.stat(locator))?.sizeBytes, bytes.length);
      const object = await storage.get(locator);
      const chunks: Buffer[] = [];
      for await (const chunk of object.body) chunks.push(Buffer.from(chunk));
      assert.deepEqual(Buffer.concat(chunks), bytes);
    } else throw new Error("Unknown production probe");
  } finally {
    await disconnectDatabase();
  }
}
void main().catch(() => {
  console.error("Isolated production probe failed.");
  process.exitCode = 1;
});
