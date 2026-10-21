import type { PrismaClient } from "../../src/server/db/generated/client";
import { seedDashboardData } from "./dashboard-data";

export async function seedPublicBrowseData(
  db: PrismaClient,
  longTitle = false,
) {
  const data = await seedDashboardData(db, longTitle);
  const company = await db.company.create({
    data: { name: "Square", slug: "public-square" },
  });
  const region = await db.region.create({
    data: { name: "North America", slug: "public-na", code: "NA" },
  });
  await db.gameCompany.create({
    data: { gameId: data.game.id, companyId: company.id, role: "DEVELOPER" },
  });
  await db.gameReleaseRegion.create({
    data: {
      gameReleaseId: data.release.id,
      regionId: region.id,
      releaseYear: 1995,
    },
  });
  const shelf = await db.location.create({
    data: {
      name: "Display shelf",
      normalizedName: "display shelf",
      type: "SHELF",
      description: "PRIVATE-LOCATION-DESCRIPTION",
    },
  });
  const hiddenLocation = await db.location.create({
    data: {
      name: "PRIVATE-LOCATION",
      normalizedName: "private-location",
      type: "ROOM",
    },
  });
  const hiddenCompany = await db.company.create({
    data: { name: "PRIVATE-COMPANY", slug: "public-hidden-company" },
  });
  const hiddenPlatform = await db.consolePlatform.create({
    data: {
      name: "PRIVATE-PLATFORM",
      slug: "public-hidden-platform",
      manufacturerId: hiddenCompany.id,
    },
  });
  const hiddenModel = await db.consoleModel.create({
    data: {
      platformId: hiddenPlatform.id,
      name: "Unshared system",
      slug: "public-hidden-model",
      manufacturerId: hiddenCompany.id,
    },
  });
  await db.ownedConsole.update({
    where: { collectionItemId: data.items[3].id },
    data: { consoleModelId: hiddenModel.id },
  });
  await db.collectionItem.update({
    where: { id: data.items[3].id },
    data: { locationId: hiddenLocation.id },
  });
  await db.collectionItem.update({
    where: { id: data.items[1].id },
    data: { notes: "SunsetMemo", locationId: shelf.id },
  });
  await db.collectionItem.update({
    where: { id: data.items[0].id },
    data: { locationId: shelf.id, serialNumber: "NeverRevealSerial" },
  });
  await db.collectionItem.update({
    where: { id: data.items[4].id },
    data: { notes: "HiddenMemo" },
  });
  await db.defect.updateMany({
    where: { collectionItemId: data.items[0].id },
    data: { repairNote: "NeverRevealRepair" },
  });
  const ids = data.items.slice(0, 3).map((item) => item.id);
  await db.collectionItem.updateMany({
    where: { id: { in: ids } },
    data: {
      publicationStatus: "PUBLISHED",
      publishedAt: new Date(),
      revision: { increment: 1 },
    },
  });
  for (let i = 0; i < 44; i++) {
    const item = await db.collectionItem.create({
      data: {
        type: "GAME",
        publicationStatus: "PUBLISHED",
        publishedAt: new Date(),
        createdAt: new Date(Date.UTC(2026, 9, 1, 0, i)),
        hasBox: i % 3 === 0 ? null : i % 3 === 1,
        ownedGame: { create: { gameReleaseId: data.release.id } },
      },
    });
    ids.push(item.id);
  }
  await db.publicSettings.update({
    where: { id: 1 },
    data: { publicCollectionEnabled: true, revision: { increment: 1 } },
  });
  return {
    ids,
    privateIds: data.items.slice(3).map((item) => item.id),
    platformId: data.platform.id,
    regionId: region.id,
    companyId: company.id,
    locationId: shelf.id,
    hiddenLocationId: hiddenLocation.id,
    noteId: data.items[1].id,
  };
}
