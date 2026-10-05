import { randomUUID } from "node:crypto";
import { disconnectDatabase, getDatabase } from "../../src/server/db/client";

async function main() {
  if (
    !process.env.DATABASE_URL?.includes("/gemukore_test?schema=public") ||
    process.env.BETTER_AUTH_URL !== "https://127.0.0.1:3111"
  ) {
    throw new Error(
      "Access browser fixtures require the isolated test runner.",
    );
  }
  const [command, argument] = process.argv.slice(2);
  const database = getDatabase();
  try {
    let result: unknown = null;
    if (command === "reset-defects") {
      await database.$executeRaw`TRUNCATE TABLE collection_item, console_platform, game, accessory CASCADE`;
    } else if (command === "seed-defect-items") {
      const platform = await database.consolePlatform.create({
        data: { name: "SNES", slug: randomUUID() },
      });
      const game = await database.game.create({
        data: { name: "Chrono Trigger", slug: randomUUID() },
      });
      const release = await database.gameRelease.create({
        data: {
          slug: randomUUID(),
          gameId: game.id,
          platformId: platform.id,
          editionName: "Original",
        },
      });
      const first = await database.collectionItem.create({
        data: {
          type: "GAME",
          ownedGame: { create: { gameReleaseId: release.id } },
        },
      });
      const second = await database.collectionItem.create({
        data: {
          type: "GAME",
          ownedGame: { create: { gameReleaseId: release.id } },
        },
      });
      const model = await database.consoleModel.create({
        data: {
          name: "Super Nintendo",
          slug: randomUUID(),
          platformId: platform.id,
        },
      });
      const consoleCopy = await database.collectionItem.create({
        data: {
          type: "CONSOLE",
          ownedConsole: { create: { consoleModelId: model.id } },
        },
      });
      result = {
        firstId: first.id,
        secondId: second.id,
        consoleId: consoleCopy.id,
      };
    } else if (command === "defect-count") {
      result = await database.defect.count();
    } else if (command === "reset-locations") {
      await database.$executeRaw`TRUNCATE TABLE location CASCADE`;
    } else if (command === "seed-locations") {
      const home = await database.location.create({
        data: { name: "Home", normalizedName: "home", type: "PROPERTY" },
      });
      await database.location.create({
        data: {
          name: "Other",
          normalizedName: "other",
          type: "PROPERTY",
          sortOrder: 1,
        },
      });
      const office = await database.location.create({
        data: {
          name: "Office",
          normalizedName: "office",
          parentId: home.id,
          type: "ROOM",
        },
      });
      const cabinet = await database.location.create({
        data: {
          name: "Retro Cabinet",
          normalizedName: "retro cabinet",
          parentId: office.id,
          type: "FURNITURE",
        },
      });
      await database.location.create({
        data: {
          name: "Shelf 2",
          normalizedName: "shelf 2",
          parentId: cabinet.id,
          type: "SHELF",
        },
      });
    } else if (command === "location-count") {
      result = await database.location.count();
    } else if (command === "reset") {
      await database.accessGrant.deleteMany();
      await database.user.deleteMany();
    } else if (command === "sign-in") {
      const options = JSON.parse(argument ?? "{}") as {
        email?: string;
        role?: "ADMIN" | "EDITOR" | "VIEWER";
        enabled?: boolean;
        verified?: boolean;
      };
      const email = options.email ?? "browser-identity@example.com";
      const user = await database.user.create({
        data: {
          name: "Browser fixture",
          email,
          emailVerified: options.verified ?? true,
        },
      });
      const token = randomUUID();
      await database.session.create({
        data: {
          userId: user.id,
          token,
          expiresAt: new Date(Date.now() + 300_000),
        },
      });
      if (options.role)
        await database.accessGrant.create({
          data: {
            email,
            role: options.role,
            enabled: options.enabled ?? true,
          },
        });
      result = { email, token };
    } else if (command === "update") {
      await database.accessGrant.update({
        where: { email: "browser-identity@example.com" },
        data: JSON.parse(argument),
      });
    } else if (command === "delete") {
      await database.accessGrant.delete({
        where: { email: "browser-identity@example.com" },
      });
    } else if (command === "sessions") {
      result = await database.session.count();
    } else if (command === "expire") {
      await database.session.updateMany({
        where: { user: { email: argument } },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
    } else if (command === "revoke") {
      await database.session.deleteMany({
        where: { user: { email: argument } },
      });
    } else throw new Error("Unknown access browser fixture command.");
    console.info(JSON.stringify(result));
  } finally {
    await disconnectDatabase();
  }
}

void main().catch(() => {
  console.error("Access browser fixture failed.");
  process.exitCode = 1;
});
