import type { PrismaClient } from "../../src/server/db/generated/client";
export async function seedDashboardData(db: PrismaClient, longTitle = false) {
  if (!process.env.DATABASE_URL?.includes("/gemukore_test?schema=public"))
    throw new Error("Dashboard fixtures require the disposable database.");
  const platform = await db.consolePlatform.create({
    data: {
      name: longTitle
        ? "Console" + "LongUnbrokenPlatformTitle".repeat(5)
        : "Super Nintendo",
      slug: "dashboard-platform",
    },
  });
  const model = await db.consoleModel.create({
    data: { platformId: platform.id, name: "SNS-001", slug: "dashboard-model" },
  });
  const game = await db.game.create({
    data: {
      name: longTitle
        ? "Game" + "LongUnbrokenGameTitle".repeat(5)
        : "Chrono Trigger",
      slug: "dashboard-game",
    },
  });
  const release = await db.gameRelease.create({
    data: {
      gameId: game.id,
      platformId: platform.id,
      editionName: "Standard edition",
      slug: "dashboard-release",
    },
  });
  const accessory = await db.accessory.create({
    data: {
      name: longTitle
        ? "Controller" + "LongUnbrokenControllerName".repeat(5)
        : "Controller",
      slug: "dashboard-accessory",
    },
  });
  const variant = await db.accessoryVariant.create({
    data: {
      accessoryId: accessory.id,
      name: "Black",
      slug: "dashboard-variant",
    },
  });
  const items = [];
  for (let i = 0; i < 12; i++) {
    const type = (["CONSOLE", "GAME", "ACCESSORY"] as const)[i % 3];
    items.push(
      await db.collectionItem.create({
        data: {
          type,
          hasBox: i % 3 === 0 ? true : i % 3 === 1 ? false : null,
          createdAt: new Date(Date.UTC(2026, 9, 10 + i)),
          serialNumber: `PRIVATE-SERIAL-${i}`,
          notes: `PRIVATE-NOTE-${i}`,
          ...(type === "CONSOLE"
            ? { ownedConsole: { create: { consoleModelId: model.id } } }
            : type === "GAME"
              ? { ownedGame: { create: { gameReleaseId: release.id } } }
              : {
                  ownedAccessory: {
                    create: { accessoryVariantId: variant.id },
                  },
                }),
        },
      }),
    );
  }
  await db.defect.createMany({
    data: [
      {
        collectionItemId: items[0].id,
        title: "Private active defect",
        severity: "MINOR",
        status: "ACTIVE",
      },
      {
        collectionItemId: items[0].id,
        title: "Second active defect",
        severity: "MAJOR",
        status: "ACTIVE",
      },
      {
        collectionItemId: items[1].id,
        title: "Accepted defect",
        severity: "MINOR",
        status: "ACCEPTED",
      },
      {
        collectionItemId: items[2].id,
        title: "Repaired defect",
        severity: "MINOR",
        status: "REPAIRED",
        resolvedAt: new Date(),
      },
      {
        collectionItemId: items[3].id,
        title: "Active defect",
        severity: "MINOR",
        status: "ACTIVE",
      },
    ],
  });
  return { items, platform, model, game, release, accessory, variant };
}
