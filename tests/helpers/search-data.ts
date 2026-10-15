import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../src/server/db/generated/client";
function isolated() {
  if (!process.env.DATABASE_URL?.includes("/gemukore_test?schema=public"))
    throw new Error("Search fixtures require the disposable test database.");
}
export async function resetSearchData(db: PrismaClient) {
  isolated();
  await db.$executeRaw`TRUNCATE TABLE asset, location, company, region, console_platform, console_model, game, game_release, accessory, accessory_variant, collection_item CASCADE`;
  await db.publicSettings.update({
    where: { id: 1 },
    data: {
      publicCollectionEnabled: false,
      showNotes: false,
      showDefects: false,
      showSerialNumbers: false,
    },
  });
}
export async function seedSearchData(db: PrismaClient) {
  isolated();
  const slug = () => randomUUID();
  const nintendo = await db.company.create({
    data: { name: "Nintendo", aliases: ["Big N"], slug: slug() },
  });
  const square = await db.company.create({
    data: { name: "Square", aliases: ["Squaresoft"], slug: slug() },
  });
  const sharp = await db.company.create({
    data: { name: "Sharp", slug: slug() },
  });
  const hori = await db.company.create({
    data: { name: "Hori", slug: slug() },
  });
  const platform = await db.consolePlatform.create({
    data: {
      name: "Super Nintendo",
      aliases: ["SNES", "Super Famicom"],
      manufacturerId: nintendo.id,
      slug: slug(),
    },
  });
  const model = await db.consoleModel.create({
    data: {
      name: "SNS-001",
      modelNumber: "SNS-001",
      platformId: platform.id,
      manufacturerId: sharp.id,
      identificationStatus: "CONFIRMED",
      slug: slug(),
    },
  });
  const game = await db.game.create({
    data: {
      name: "Chrono Trigger",
      aliases: ["クロノ・トリガー"],
      description: "unsearched catalog narrative",
      slug: slug(),
    },
  });
  const release = await db.gameRelease.create({
    data: {
      gameId: game.id,
      platformId: platform.id,
      editionName: "Original",
      editionType: "STANDARD",
      printingLabel: "First printing",
      identificationStatus: "CONFIRMED",
      metadata: { schemaVersion: 1, data: { secret: "unsearched snapshot" } },
      slug: slug(),
    },
  });
  const japan = await db.region.create({
    data: { name: "Japan", code: "JP", slug: slug() },
  });
  const usa = await db.region.create({
    data: { name: "North America", code: "NA", slug: slug() },
  });
  await db.gameReleaseRegion.createMany({
    data: [
      { gameReleaseId: release.id, regionId: japan.id },
      { gameReleaseId: release.id, regionId: usa.id },
    ],
  });
  await db.consoleModelRegion.create({
    data: { consoleModelId: model.id, regionId: japan.id },
  });
  await db.gameCompany.create({
    data: { gameId: game.id, companyId: square.id, role: "DEVELOPER" },
  });
  await db.gameReleaseCompany.createMany({
    data: [
      { gameReleaseId: release.id, companyId: square.id, role: "PUBLISHER" },
      {
        gameReleaseId: release.id,
        companyId: square.id,
        role: "DISTRIBUTOR",
        regionId: japan.id,
      },
    ],
  });
  const accessory = await db.accessory.create({
    data: { name: "Controller", producerId: nintendo.id, slug: slug() },
  });
  const variant = await db.accessoryVariant.create({
    data: {
      name: "Fighting Commander",
      accessoryId: accessory.id,
      producerId: hori.id,
      modelNumber: "HFC-001",
      edition: "Tournament",
      color: "Black",
      slug: slug(),
    },
  });
  await db.accessoryVariantPlatform.create({
    data: { accessoryVariantId: variant.id, platformId: platform.id },
  });
  await db.accessoryVariantRegion.create({
    data: { accessoryVariantId: variant.id, regionId: japan.id },
  });
  const first = await db.collectionItem.create({
    data: {
      type: "GAME",
      serialNumber: "00-ABC-123",
      notes: "ownersecret imported childhood copy",
      observedMarkings: "unsearchedmarkings",
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
      serialNumber: "000-SNS-900",
      ownedConsole: { create: { consoleModelId: model.id } },
    },
  });
  const accessoryCopy = await db.collectionItem.create({
    data: {
      type: "ACCESSORY",
      ownedAccessory: { create: { accessoryVariantId: variant.id } },
    },
  });
  await db.defect.createMany({
    data: [
      {
        collectionItemId: first.id,
        title: "Cracked hinge",
        description: "Small fracture",
        severity: "MINOR",
        status: "ACTIVE",
        repairNote: "repairsecret temporary glue",
      },
      {
        collectionItemId: first.id,
        title: "Cracked shell",
        severity: "COSMETIC",
        status: "ACCEPTED",
      },
      {
        collectionItemId: second.id,
        title: "Yellowed case",
        severity: "COSMETIC",
        status: "REPAIRED",
        resolvedAt: new Date(),
        repairNote: "restored plastic",
      },
    ],
  });
  await db.productIdentifier.createMany({
    data: [
      {
        consoleModelId: model.id,
        scheme: "PRODUCT_CODE",
        value: "00-MODEL-001",
        normalizedValue: "00-MODEL-001",
      },
      {
        gameReleaseId: release.id,
        scheme: "UPC",
        value: "001234567890",
        normalizedValue: "001234567890",
      },
      {
        accessoryVariantId: variant.id,
        scheme: "PRODUCT_CODE",
        value: "HFC-RETAIL-001",
        normalizedValue: "HFC-RETAIL-001",
      },
    ],
  });
  return {
    firstId: first.id,
    secondId: second.id,
    consoleId: consoleCopy.id,
    accessoryId: accessoryCopy.id,
    gameId: game.id,
    releaseId: release.id,
    modelId: model.id,
    variantId: variant.id,
    platformId: platform.id,
    squareId: square.id,
    japanId: japan.id,
  };
}

export async function seedFilterData(db: PrismaClient) {
  isolated();
  const data = await seedSearchData(db);
  const companies = await db.company.findMany({
    select: { id: true, name: true },
  });
  for (const c of companies)
    await db.company.update({
      where: { id: c.id },
      data: { slug: c.name.toLowerCase() },
    });
  await db.consolePlatform.update({
    where: { id: data.platformId },
    data: { slug: "snes", originalReleaseYear: 1983 },
  });
  await db.consoleModel.update({
    where: { id: data.modelId },
    data: { slug: "sns-001", releaseYear: 1990 },
  });
  const regions = await db.region.findMany({
    select: { id: true, code: true },
  });
  for (const r of regions)
    await db.region.update({
      where: { id: r.id },
      data: { slug: r.code === "JP" ? "japan" : "north-america" },
    });
  const usaId = regions.find((r) => r.code === "NA")!.id;
  await db.gameRelease.update({
    where: { id: data.releaseId },
    data: { firstReleaseYear: 1994 },
  });
  await db.gameReleaseRegion.update({
    where: {
      gameReleaseId_regionId: {
        gameReleaseId: data.releaseId,
        regionId: data.japanId,
      },
    },
    data: { releaseYear: 1995 },
  });
  await db.gameReleaseRegion.update({
    where: {
      gameReleaseId_regionId: {
        gameReleaseId: data.releaseId,
        regionId: usaId,
      },
    },
    data: { releaseYear: 1996 },
  });
  await db.accessoryVariant.update({
    where: { id: data.variantId },
    data: { releaseYear: 1998 },
  });
  const sega = await db.company.create({
    data: { name: "Sega", slug: "sega" },
  });
  await db.gameReleaseCompany.create({
    data: {
      gameReleaseId: data.releaseId,
      companyId: sega.id,
      role: "PUBLISHER",
      regionId: data.japanId,
    },
  });
  const root = await db.location.create({
    data: { name: "Home", normalizedName: "home" },
  });
  const shelf = await db.location.create({
    data: { name: "Shelf", normalizedName: "shelf", parentId: root.id },
  });
  await db.collectionItem.update({
    where: { id: data.firstId },
    data: {
      hasBox: true,
      locationId: shelf.id,
      createdAt: new Date("2019-01-01Z"),
    },
  });
  await db.collectionItem.update({
    where: { id: data.secondId },
    data: {
      hasBox: false,
      locationId: root.id,
      createdAt: new Date("2020-01-01Z"),
    },
  });
  await db.collectionItem.update({
    where: { id: data.consoleId },
    data: { hasBox: null, createdAt: new Date("2018-01-01Z") },
  });
  await db.collectionItem.update({
    where: { id: data.accessoryId },
    data: {
      hasBox: true,
      locationId: shelf.id,
      createdAt: new Date("2022-01-01Z"),
    },
  });
  return { ...data, usaId, rootId: root.id, shelfId: shelf.id };
}

export async function seedBrowseData(db: PrismaClient) {
  const data = await seedFilterData(db);
  for (let index = 0; index < 43; index++)
    await db.collectionItem.create({
      data: {
        type: "GAME",
        ownedGame: { create: { gameReleaseId: data.releaseId } },
      },
    });
  return data;
}
