BEGIN;

-- CreateEnum
CREATE TYPE "ThemePreference" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');

-- CreateEnum
CREATE TYPE "IdentificationStatus" AS ENUM ('INCOMPLETE', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "RegionLock" AS ENUM ('UNRESTRICTED', 'RESTRICTED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "GameEditionType" AS ENUM ('STANDARD', 'LIMITED', 'SPECIAL', 'COLLECTORS', 'DELUXE', 'GREATEST_HITS', 'PLAYERS_CHOICE', 'PLATINUM', 'BUDGET', 'RE_RELEASE', 'BUNDLE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CompanyCreditRole" AS ENUM ('DEVELOPER', 'PORT_DEVELOPER', 'PUBLISHER', 'DISTRIBUTOR');

-- CreateEnum
CREATE TYPE "ProductIdentifierScheme" AS ENUM ('PRODUCT_CODE', 'UPC', 'EAN', 'OTHER');

-- CreateEnum
CREATE TYPE "CollectionItemType" AS ENUM ('CONSOLE', 'GAME', 'ACCESSORY');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('PRIVATE', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('PROPERTY', 'ROOM', 'FURNITURE', 'SHELF', 'CONTAINER', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DefectSeverity" AS ENUM ('COSMETIC', 'MINOR', 'MAJOR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DefectStatus" AS ENUM ('ACTIVE', 'REPAIRED', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "MetadataOrigin" AS ENUM ('MANUAL', 'SEED', 'PROVIDER', 'AI_ASSISTED');

-- CreateTable
CREATE TABLE "app_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "collectionName" TEXT NOT NULL DEFAULT 'GemuKore',
    "collectionDescription" TEXT,
    "defaultTheme" "ThemePreference" NOT NULL DEFAULT 'SYSTEM',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "preferredCurrency" VARCHAR(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "publicCollectionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "allowSearchEngineIndexing" BOOLEAN NOT NULL DEFAULT false,
    "showSerialNumbers" BOOLEAN NOT NULL DEFAULT false,
    "showLocations" BOOLEAN NOT NULL DEFAULT false,
    "showNotes" BOOLEAN NOT NULL DEFAULT false,
    "showDefects" BOOLEAN NOT NULL DEFAULT false,
    "showPersonalPhotos" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "seedKey" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "countryCode" VARCHAR(2),
    "foundedYear" INTEGER,
    "website" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "region" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "seedKey" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "code" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "console_platform" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "seedKey" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "manufacturerId" UUID,
    "generation" INTEGER,
    "originalReleaseYear" INTEGER,
    "discontinuedYear" INTEGER,
    "description" TEXT,
    "history" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "console_platform_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "console_model" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "seedKey" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "platformId" UUID NOT NULL,
    "manufacturerId" UUID,
    "modelNumber" TEXT,
    "releaseYear" INTEGER,
    "discontinuedYear" INTEGER,
    "description" TEXT,
    "specifications" JSONB,
    "widthMm" DECIMAL(10,3),
    "heightMm" DECIMAL(10,3),
    "depthMm" DECIMAL(10,3),
    "weightGrams" DECIMAL(12,3),
    "regionLock" "RegionLock",
    "regionLockNote" TEXT,
    "identificationStatus" "IdentificationStatus" NOT NULL DEFAULT 'INCOMPLETE',

    CONSTRAINT "console_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "console_model_region" (
    "consoleModelId" UUID NOT NULL,
    "regionId" UUID NOT NULL,

    CONSTRAINT "console_model_region_pkey" PRIMARY KEY ("consoleModelId","regionId")
);

-- CreateTable
CREATE TABLE "game" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "seedKey" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_release" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "seedKey" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gameId" UUID NOT NULL,
    "platformId" UUID NOT NULL,
    "editionName" TEXT,
    "editionType" "GameEditionType" NOT NULL DEFAULT 'STANDARD',
    "printingLabel" TEXT,
    "firstReleaseYear" INTEGER,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "descriptionOverride" TEXT,
    "metadata" JSONB,
    "regionLock" "RegionLock",
    "regionLockNote" TEXT,
    "identificationStatus" "IdentificationStatus" NOT NULL DEFAULT 'INCOMPLETE',

    CONSTRAINT "game_release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_release_region" (
    "gameReleaseId" UUID NOT NULL,
    "regionId" UUID NOT NULL,
    "releaseYear" INTEGER,
    "releaseMonth" INTEGER,
    "releaseDay" INTEGER,

    CONSTRAINT "game_release_region_pkey" PRIMARY KEY ("gameReleaseId","regionId")
);

-- CreateTable
CREATE TABLE "game_company" (
    "gameId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "role" "CompanyCreditRole" NOT NULL DEFAULT 'DEVELOPER',
    "creditLabel" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "game_company_pkey" PRIMARY KEY ("gameId","companyId","role")
);

-- CreateTable
CREATE TABLE "game_release_company" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "gameReleaseId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "regionId" UUID,
    "role" "CompanyCreditRole" NOT NULL,
    "creditLabel" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "game_release_company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accessory" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "seedKey" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "producerId" UUID,
    "description" TEXT,
    "releaseYear" INTEGER,
    "specifications" JSONB,

    CONSTRAINT "accessory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accessory_variant" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "seedKey" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accessoryId" UUID NOT NULL,
    "producerId" UUID,
    "modelNumber" TEXT,
    "color" TEXT,
    "edition" TEXT,
    "releaseYear" INTEGER,
    "descriptionOverride" TEXT,
    "specificationsOverride" JSONB,
    "regionLock" "RegionLock",
    "regionLockNote" TEXT,
    "identificationStatus" "IdentificationStatus" NOT NULL DEFAULT 'INCOMPLETE',

    CONSTRAINT "accessory_variant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accessory_variant_region" (
    "accessoryVariantId" UUID NOT NULL,
    "regionId" UUID NOT NULL,

    CONSTRAINT "accessory_variant_region_pkey" PRIMARY KEY ("accessoryVariantId","regionId")
);

-- CreateTable
CREATE TABLE "accessory_variant_platform" (
    "accessoryVariantId" UUID NOT NULL,
    "platformId" UUID NOT NULL,
    "compatibilityNote" TEXT,

    CONSTRAINT "accessory_variant_platform_pkey" PRIMARY KEY ("accessoryVariantId","platformId")
);

-- CreateTable
CREATE TABLE "product_identifier" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "scheme" "ProductIdentifierScheme" NOT NULL,
    "value" TEXT NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "issuer" TEXT,
    "marketNote" TEXT,
    "consoleModelId" UUID,
    "gameReleaseId" UUID,
    "accessoryVariantId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_identifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_reference" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "provider" TEXT NOT NULL,
    "providerObjectType" TEXT,
    "externalId" TEXT,
    "url" TEXT,
    "normalizedUrl" TEXT,
    "metadata" JSONB,
    "companyId" UUID,
    "platformId" UUID,
    "consoleModelId" UUID,
    "gameId" UUID,
    "gameReleaseId" UUID,
    "accessoryId" UUID,
    "accessoryVariantId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_reference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "parentId" UUID,
    "type" "LocationType" NOT NULL DEFAULT 'CUSTOM',
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_item" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "type" "CollectionItemType" NOT NULL,
    "serialNumber" TEXT,
    "observedMarkings" TEXT,
    "locationId" UUID,
    "hasBox" BOOLEAN,
    "notes" TEXT,
    "publicationStatus" "PublicationStatus" NOT NULL DEFAULT 'PRIVATE',
    "publishedAt" TIMESTAMPTZ(3),
    "publishedById" UUID,
    "createdById" UUID,
    "updatedById" UUID,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owned_console" (
    "collectionItemId" UUID NOT NULL,
    "type" "CollectionItemType" NOT NULL DEFAULT 'CONSOLE',
    "consoleModelId" UUID NOT NULL,

    CONSTRAINT "owned_console_pkey" PRIMARY KEY ("collectionItemId")
);

-- CreateTable
CREATE TABLE "owned_game" (
    "collectionItemId" UUID NOT NULL,
    "type" "CollectionItemType" NOT NULL DEFAULT 'GAME',
    "gameReleaseId" UUID NOT NULL,

    CONSTRAINT "owned_game_pkey" PRIMARY KEY ("collectionItemId")
);

-- CreateTable
CREATE TABLE "owned_accessory" (
    "collectionItemId" UUID NOT NULL,
    "type" "CollectionItemType" NOT NULL DEFAULT 'ACCESSORY',
    "accessoryVariantId" UUID NOT NULL,

    CONSTRAINT "owned_accessory_pkey" PRIMARY KEY ("collectionItemId")
);

-- CreateTable
CREATE TABLE "defect" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "collectionItemId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" "DefectSeverity" NOT NULL,
    "status" "DefectStatus" NOT NULL DEFAULT 'ACTIVE',
    "resolvedAt" TIMESTAMPTZ(3),
    "repairNote" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "defect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metadata_change" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "fieldPath" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "rootRevision" INTEGER NOT NULL,
    "origin" "MetadataOrigin" NOT NULL,
    "sourceSnapshot" JSONB,
    "snapshotSchemaVersion" INTEGER NOT NULL DEFAULT 1,
    "actorId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" UUID,
    "regionId" UUID,
    "platformId" UUID,
    "consoleModelId" UUID,
    "gameId" UUID,
    "gameReleaseId" UUID,
    "accessoryId" UUID,
    "accessoryVariantId" UUID,

    CONSTRAINT "metadata_change_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_slug_key" ON "company"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "company_seedKey_key" ON "company"("seedKey");

-- CreateIndex
CREATE UNIQUE INDEX "region_slug_key" ON "region"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "region_seedKey_key" ON "region"("seedKey");

-- CreateIndex
CREATE UNIQUE INDEX "region_code_key" ON "region"("code");

-- CreateIndex
CREATE UNIQUE INDEX "console_platform_slug_key" ON "console_platform"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "console_platform_seedKey_key" ON "console_platform"("seedKey");

-- CreateIndex
CREATE INDEX "console_platform_manufacturerId_idx" ON "console_platform"("manufacturerId");

-- CreateIndex
CREATE UNIQUE INDEX "console_model_slug_key" ON "console_model"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "console_model_seedKey_key" ON "console_model"("seedKey");

-- CreateIndex
CREATE INDEX "console_model_platformId_idx" ON "console_model"("platformId");

-- CreateIndex
CREATE INDEX "console_model_manufacturerId_idx" ON "console_model"("manufacturerId");

-- CreateIndex
CREATE INDEX "console_model_modelNumber_idx" ON "console_model"("modelNumber");

-- CreateIndex
CREATE INDEX "console_model_region_regionId_consoleModelId_idx" ON "console_model_region"("regionId", "consoleModelId");

-- CreateIndex
CREATE UNIQUE INDEX "game_slug_key" ON "game"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "game_seedKey_key" ON "game"("seedKey");

-- CreateIndex
CREATE UNIQUE INDEX "game_release_slug_key" ON "game_release"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "game_release_seedKey_key" ON "game_release"("seedKey");

-- CreateIndex
CREATE INDEX "game_release_gameId_platformId_idx" ON "game_release"("gameId", "platformId");

-- CreateIndex
CREATE INDEX "game_release_platformId_idx" ON "game_release"("platformId");

-- CreateIndex
CREATE INDEX "game_release_region_regionId_gameReleaseId_idx" ON "game_release_region"("regionId", "gameReleaseId");

-- CreateIndex
CREATE INDEX "game_company_companyId_gameId_idx" ON "game_company"("companyId", "gameId");

-- CreateIndex
CREATE INDEX "game_release_company_gameReleaseId_regionId_idx" ON "game_release_company"("gameReleaseId", "regionId");

-- CreateIndex
CREATE INDEX "game_release_company_companyId_role_gameReleaseId_idx" ON "game_release_company"("companyId", "role", "gameReleaseId");

-- CreateIndex
CREATE UNIQUE INDEX "accessory_slug_key" ON "accessory"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "accessory_seedKey_key" ON "accessory"("seedKey");

-- CreateIndex
CREATE INDEX "accessory_producerId_idx" ON "accessory"("producerId");

-- CreateIndex
CREATE UNIQUE INDEX "accessory_variant_slug_key" ON "accessory_variant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "accessory_variant_seedKey_key" ON "accessory_variant"("seedKey");

-- CreateIndex
CREATE INDEX "accessory_variant_accessoryId_idx" ON "accessory_variant"("accessoryId");

-- CreateIndex
CREATE INDEX "accessory_variant_producerId_idx" ON "accessory_variant"("producerId");

-- CreateIndex
CREATE INDEX "accessory_variant_modelNumber_idx" ON "accessory_variant"("modelNumber");

-- CreateIndex
CREATE INDEX "accessory_variant_region_regionId_accessoryVariantId_idx" ON "accessory_variant_region"("regionId", "accessoryVariantId");

-- CreateIndex
CREATE INDEX "accessory_variant_platform_platformId_accessoryVariantId_idx" ON "accessory_variant_platform"("platformId", "accessoryVariantId");

-- CreateIndex
CREATE INDEX "product_identifier_scheme_normalizedValue_idx" ON "product_identifier"("scheme", "normalizedValue");

-- CreateIndex
CREATE UNIQUE INDEX "product_identifier_consoleModelId_scheme_normalizedValue_key" ON "product_identifier"("consoleModelId", "scheme", "normalizedValue");

-- CreateIndex
CREATE UNIQUE INDEX "product_identifier_gameReleaseId_scheme_normalizedValue_key" ON "product_identifier"("gameReleaseId", "scheme", "normalizedValue");

-- CreateIndex
CREATE UNIQUE INDEX "product_identifier_accessoryVariantId_scheme_normalizedValu_key" ON "product_identifier"("accessoryVariantId", "scheme", "normalizedValue");

-- CreateIndex
CREATE INDEX "external_reference_provider_providerObjectType_externalId_idx" ON "external_reference"("provider", "providerObjectType", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "external_reference_companyId_provider_providerObjectType_ex_key" ON "external_reference"("companyId", "provider", "providerObjectType", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "external_reference_platformId_provider_providerObjectType_e_key" ON "external_reference"("platformId", "provider", "providerObjectType", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "external_reference_consoleModelId_provider_providerObjectTy_key" ON "external_reference"("consoleModelId", "provider", "providerObjectType", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "external_reference_gameId_provider_providerObjectType_exter_key" ON "external_reference"("gameId", "provider", "providerObjectType", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "external_reference_gameReleaseId_provider_providerObjectTyp_key" ON "external_reference"("gameReleaseId", "provider", "providerObjectType", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "external_reference_accessoryId_provider_providerObjectType__key" ON "external_reference"("accessoryId", "provider", "providerObjectType", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "external_reference_accessoryVariantId_provider_providerObje_key" ON "external_reference"("accessoryVariantId", "provider", "providerObjectType", "externalId");

-- CreateIndex
CREATE INDEX "location_parentId_sortOrder_id_idx" ON "location"("parentId", "sortOrder", "id");

-- CreateIndex
CREATE UNIQUE INDEX "location_parentId_normalizedName_key" ON "location"("parentId", "normalizedName");

-- CreateIndex
CREATE INDEX "collection_item_createdAt_id_idx" ON "collection_item"("createdAt", "id");

-- CreateIndex
CREATE INDEX "collection_item_type_createdAt_id_idx" ON "collection_item"("type", "createdAt", "id");

-- CreateIndex
CREATE INDEX "collection_item_locationId_idx" ON "collection_item"("locationId");

-- CreateIndex
CREATE INDEX "collection_item_createdById_idx" ON "collection_item"("createdById");

-- CreateIndex
CREATE INDEX "collection_item_updatedById_idx" ON "collection_item"("updatedById");

-- CreateIndex
CREATE INDEX "collection_item_publishedById_idx" ON "collection_item"("publishedById");

-- CreateIndex
CREATE UNIQUE INDEX "collection_item_id_type_key" ON "collection_item"("id", "type");

-- CreateIndex
CREATE INDEX "owned_console_consoleModelId_idx" ON "owned_console"("consoleModelId");

-- CreateIndex
CREATE UNIQUE INDEX "owned_console_collectionItemId_type_key" ON "owned_console"("collectionItemId", "type");

-- CreateIndex
CREATE INDEX "owned_game_gameReleaseId_idx" ON "owned_game"("gameReleaseId");

-- CreateIndex
CREATE UNIQUE INDEX "owned_game_collectionItemId_type_key" ON "owned_game"("collectionItemId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "owned_game_collectionItemId_gameReleaseId_key" ON "owned_game"("collectionItemId", "gameReleaseId");

-- CreateIndex
CREATE INDEX "owned_accessory_accessoryVariantId_idx" ON "owned_accessory"("accessoryVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "owned_accessory_collectionItemId_type_key" ON "owned_accessory"("collectionItemId", "type");

-- CreateIndex
CREATE INDEX "defect_collectionItemId_status_idx" ON "defect"("collectionItemId", "status");

-- CreateIndex
CREATE INDEX "metadata_change_actorId_idx" ON "metadata_change"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "metadata_change_companyId_rootRevision_fieldPath_key" ON "metadata_change"("companyId", "rootRevision", "fieldPath");

-- CreateIndex
CREATE UNIQUE INDEX "metadata_change_regionId_rootRevision_fieldPath_key" ON "metadata_change"("regionId", "rootRevision", "fieldPath");

-- CreateIndex
CREATE UNIQUE INDEX "metadata_change_platformId_rootRevision_fieldPath_key" ON "metadata_change"("platformId", "rootRevision", "fieldPath");

-- CreateIndex
CREATE UNIQUE INDEX "metadata_change_consoleModelId_rootRevision_fieldPath_key" ON "metadata_change"("consoleModelId", "rootRevision", "fieldPath");

-- CreateIndex
CREATE UNIQUE INDEX "metadata_change_gameId_rootRevision_fieldPath_key" ON "metadata_change"("gameId", "rootRevision", "fieldPath");

-- CreateIndex
CREATE UNIQUE INDEX "metadata_change_gameReleaseId_rootRevision_fieldPath_key" ON "metadata_change"("gameReleaseId", "rootRevision", "fieldPath");

-- CreateIndex
CREATE UNIQUE INDEX "metadata_change_accessoryId_rootRevision_fieldPath_key" ON "metadata_change"("accessoryId", "rootRevision", "fieldPath");

-- CreateIndex
CREATE UNIQUE INDEX "metadata_change_accessoryVariantId_rootRevision_fieldPath_key" ON "metadata_change"("accessoryVariantId", "rootRevision", "fieldPath");

-- AddForeignKey
ALTER TABLE "console_platform" ADD CONSTRAINT "console_platform_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "console_model" ADD CONSTRAINT "console_model_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "console_platform"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "console_model" ADD CONSTRAINT "console_model_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "console_model_region" ADD CONSTRAINT "console_model_region_consoleModelId_fkey" FOREIGN KEY ("consoleModelId") REFERENCES "console_model"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "console_model_region" ADD CONSTRAINT "console_model_region_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "region"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "game_release" ADD CONSTRAINT "game_release_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "game_release" ADD CONSTRAINT "game_release_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "console_platform"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "game_release_region" ADD CONSTRAINT "game_release_region_gameReleaseId_fkey" FOREIGN KEY ("gameReleaseId") REFERENCES "game_release"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "game_release_region" ADD CONSTRAINT "game_release_region_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "region"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "game_company" ADD CONSTRAINT "game_company_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "game_company" ADD CONSTRAINT "game_company_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "game_release_company" ADD CONSTRAINT "game_release_company_gameReleaseId_fkey" FOREIGN KEY ("gameReleaseId") REFERENCES "game_release"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "game_release_company" ADD CONSTRAINT "game_release_company_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "game_release_company" ADD CONSTRAINT "game_release_company_gameReleaseId_regionId_fkey" FOREIGN KEY ("gameReleaseId", "regionId") REFERENCES "game_release_region"("gameReleaseId", "regionId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "accessory" ADD CONSTRAINT "accessory_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "accessory_variant" ADD CONSTRAINT "accessory_variant_accessoryId_fkey" FOREIGN KEY ("accessoryId") REFERENCES "accessory"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "accessory_variant" ADD CONSTRAINT "accessory_variant_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "accessory_variant_region" ADD CONSTRAINT "accessory_variant_region_accessoryVariantId_fkey" FOREIGN KEY ("accessoryVariantId") REFERENCES "accessory_variant"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "accessory_variant_region" ADD CONSTRAINT "accessory_variant_region_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "region"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "accessory_variant_platform" ADD CONSTRAINT "accessory_variant_platform_accessoryVariantId_fkey" FOREIGN KEY ("accessoryVariantId") REFERENCES "accessory_variant"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "accessory_variant_platform" ADD CONSTRAINT "accessory_variant_platform_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "console_platform"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "product_identifier" ADD CONSTRAINT "product_identifier_consoleModelId_fkey" FOREIGN KEY ("consoleModelId") REFERENCES "console_model"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "product_identifier" ADD CONSTRAINT "product_identifier_gameReleaseId_fkey" FOREIGN KEY ("gameReleaseId") REFERENCES "game_release"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "product_identifier" ADD CONSTRAINT "product_identifier_accessoryVariantId_fkey" FOREIGN KEY ("accessoryVariantId") REFERENCES "accessory_variant"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "external_reference" ADD CONSTRAINT "external_reference_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "external_reference" ADD CONSTRAINT "external_reference_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "console_platform"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "external_reference" ADD CONSTRAINT "external_reference_consoleModelId_fkey" FOREIGN KEY ("consoleModelId") REFERENCES "console_model"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "external_reference" ADD CONSTRAINT "external_reference_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "external_reference" ADD CONSTRAINT "external_reference_gameReleaseId_fkey" FOREIGN KEY ("gameReleaseId") REFERENCES "game_release"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "external_reference" ADD CONSTRAINT "external_reference_accessoryId_fkey" FOREIGN KEY ("accessoryId") REFERENCES "accessory"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "external_reference" ADD CONSTRAINT "external_reference_accessoryVariantId_fkey" FOREIGN KEY ("accessoryVariantId") REFERENCES "accessory_variant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "location" ADD CONSTRAINT "location_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "collection_item" ADD CONSTRAINT "collection_item_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "collection_item" ADD CONSTRAINT "collection_item_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_item" ADD CONSTRAINT "collection_item_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_item" ADD CONSTRAINT "collection_item_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owned_console" ADD CONSTRAINT "owned_console_collectionItemId_type_fkey" FOREIGN KEY ("collectionItemId", "type") REFERENCES "collection_item"("id", "type") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "owned_console" ADD CONSTRAINT "owned_console_consoleModelId_fkey" FOREIGN KEY ("consoleModelId") REFERENCES "console_model"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "owned_game" ADD CONSTRAINT "owned_game_collectionItemId_type_fkey" FOREIGN KEY ("collectionItemId", "type") REFERENCES "collection_item"("id", "type") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "owned_game" ADD CONSTRAINT "owned_game_gameReleaseId_fkey" FOREIGN KEY ("gameReleaseId") REFERENCES "game_release"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "owned_accessory" ADD CONSTRAINT "owned_accessory_collectionItemId_type_fkey" FOREIGN KEY ("collectionItemId", "type") REFERENCES "collection_item"("id", "type") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "owned_accessory" ADD CONSTRAINT "owned_accessory_accessoryVariantId_fkey" FOREIGN KEY ("accessoryVariantId") REFERENCES "accessory_variant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "defect" ADD CONSTRAINT "defect_collectionItemId_fkey" FOREIGN KEY ("collectionItemId") REFERENCES "collection_item"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "metadata_change" ADD CONSTRAINT "metadata_change_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metadata_change" ADD CONSTRAINT "metadata_change_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "metadata_change" ADD CONSTRAINT "metadata_change_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "region"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "metadata_change" ADD CONSTRAINT "metadata_change_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "console_platform"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "metadata_change" ADD CONSTRAINT "metadata_change_consoleModelId_fkey" FOREIGN KEY ("consoleModelId") REFERENCES "console_model"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "metadata_change" ADD CONSTRAINT "metadata_change_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "metadata_change" ADD CONSTRAINT "metadata_change_gameReleaseId_fkey" FOREIGN KEY ("gameReleaseId") REFERENCES "game_release"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "metadata_change" ADD CONSTRAINT "metadata_change_accessoryId_fkey" FOREIGN KEY ("accessoryId") REFERENCES "accessory"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "metadata_change" ADD CONSTRAINT "metadata_change_accessoryVariantId_fkey" FOREIGN KEY ("accessoryVariantId") REFERENCES "accessory_variant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Reviewed PostgreSQL invariants from DOMAIN_MODEL.md §§2, 5, 9.

ALTER TABLE "company" ADD CONSTRAINT "company_revision_positive" CHECK ("revision" > 0);

ALTER TABLE "company" ADD CONSTRAINT "company_slug_nonempty" CHECK (btrim("slug") <> '');

ALTER TABLE "company" ADD CONSTRAINT "company_name_nonempty" CHECK (btrim("name") <> '');

ALTER TABLE "company" ADD CONSTRAINT "company_seed_key_nonempty" CHECK ("seedKey" IS NULL OR btrim("seedKey") <> '');

ALTER TABLE "region" ADD CONSTRAINT "region_revision_positive" CHECK ("revision" > 0);

ALTER TABLE "region" ADD CONSTRAINT "region_slug_nonempty" CHECK (btrim("slug") <> '');

ALTER TABLE "region" ADD CONSTRAINT "region_name_nonempty" CHECK (btrim("name") <> '');

ALTER TABLE "region" ADD CONSTRAINT "region_seed_key_nonempty" CHECK ("seedKey" IS NULL OR btrim("seedKey") <> '');

ALTER TABLE "console_platform" ADD CONSTRAINT "console_platform_revision_positive" CHECK ("revision" > 0);

ALTER TABLE "console_platform" ADD CONSTRAINT "console_platform_slug_nonempty" CHECK (btrim("slug") <> '');

ALTER TABLE "console_platform" ADD CONSTRAINT "console_platform_name_nonempty" CHECK (btrim("name") <> '');

ALTER TABLE "console_platform" ADD CONSTRAINT "console_platform_seed_key_nonempty" CHECK ("seedKey" IS NULL OR btrim("seedKey") <> '');

ALTER TABLE "console_model" ADD CONSTRAINT "console_model_revision_positive" CHECK ("revision" > 0);

ALTER TABLE "console_model" ADD CONSTRAINT "console_model_slug_nonempty" CHECK (btrim("slug") <> '');

ALTER TABLE "console_model" ADD CONSTRAINT "console_model_name_nonempty" CHECK (btrim("name") <> '');

ALTER TABLE "console_model" ADD CONSTRAINT "console_model_seed_key_nonempty" CHECK ("seedKey" IS NULL OR btrim("seedKey") <> '');

ALTER TABLE "game" ADD CONSTRAINT "game_revision_positive" CHECK ("revision" > 0);

ALTER TABLE "game" ADD CONSTRAINT "game_slug_nonempty" CHECK (btrim("slug") <> '');

ALTER TABLE "game" ADD CONSTRAINT "game_name_nonempty" CHECK (btrim("name") <> '');

ALTER TABLE "game" ADD CONSTRAINT "game_seed_key_nonempty" CHECK ("seedKey" IS NULL OR btrim("seedKey") <> '');

ALTER TABLE "game_release" ADD CONSTRAINT "game_release_revision_positive" CHECK ("revision" > 0);

ALTER TABLE "game_release" ADD CONSTRAINT "game_release_slug_nonempty" CHECK (btrim("slug") <> '');

ALTER TABLE "game_release" ADD CONSTRAINT "game_release_seed_key_nonempty" CHECK ("seedKey" IS NULL OR btrim("seedKey") <> '');

ALTER TABLE "accessory" ADD CONSTRAINT "accessory_revision_positive" CHECK ("revision" > 0);

ALTER TABLE "accessory" ADD CONSTRAINT "accessory_slug_nonempty" CHECK (btrim("slug") <> '');

ALTER TABLE "accessory" ADD CONSTRAINT "accessory_name_nonempty" CHECK (btrim("name") <> '');

ALTER TABLE "accessory" ADD CONSTRAINT "accessory_seed_key_nonempty" CHECK ("seedKey" IS NULL OR btrim("seedKey") <> '');

ALTER TABLE "accessory_variant" ADD CONSTRAINT "accessory_variant_revision_positive" CHECK ("revision" > 0);

ALTER TABLE "accessory_variant" ADD CONSTRAINT "accessory_variant_slug_nonempty" CHECK (btrim("slug") <> '');

ALTER TABLE "accessory_variant" ADD CONSTRAINT "accessory_variant_name_nonempty" CHECK (btrim("name") <> '');

ALTER TABLE "accessory_variant" ADD CONSTRAINT "accessory_variant_seed_key_nonempty" CHECK ("seedKey" IS NULL OR btrim("seedKey") <> '');

ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_singleton" CHECK ("id" = 1);

ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_revision_positive" CHECK ("revision" > 0);

ALTER TABLE "public_settings" ADD CONSTRAINT "public_settings_singleton" CHECK ("id" = 1);

ALTER TABLE "public_settings" ADD CONSTRAINT "public_settings_revision_positive" CHECK ("revision" > 0);

ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_name_timezone_nonempty" CHECK (btrim("collectionName") <> '' AND btrim("timezone") <> '');

ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_currency_code" CHECK ("preferredCurrency" IS NULL OR "preferredCurrency" ~ '^[A-Z]{3}$');

ALTER TABLE "company" ADD CONSTRAINT "company_country_code" CHECK ("countryCode" IS NULL OR "countryCode" ~ '^[A-Z]{2}$');

ALTER TABLE "region" ADD CONSTRAINT "region_code_nonempty" CHECK (btrim("code") <> '');

ALTER TABLE "company" ADD CONSTRAINT "company_foundedYear_bounds" CHECK ("foundedYear" IS NULL OR "foundedYear" BETWEEN 1 AND 9999);

ALTER TABLE "console_platform" ADD CONSTRAINT "console_platform_originalReleaseYear_bounds" CHECK ("originalReleaseYear" IS NULL OR "originalReleaseYear" BETWEEN 1 AND 9999);

ALTER TABLE "console_platform" ADD CONSTRAINT "console_platform_discontinuedYear_bounds" CHECK ("discontinuedYear" IS NULL OR "discontinuedYear" BETWEEN 1 AND 9999);

ALTER TABLE "console_model" ADD CONSTRAINT "console_model_releaseYear_bounds" CHECK ("releaseYear" IS NULL OR "releaseYear" BETWEEN 1 AND 9999);

ALTER TABLE "console_model" ADD CONSTRAINT "console_model_discontinuedYear_bounds" CHECK ("discontinuedYear" IS NULL OR "discontinuedYear" BETWEEN 1 AND 9999);

ALTER TABLE "game_release" ADD CONSTRAINT "game_release_firstReleaseYear_bounds" CHECK ("firstReleaseYear" IS NULL OR "firstReleaseYear" BETWEEN 1 AND 9999);

ALTER TABLE "accessory" ADD CONSTRAINT "accessory_releaseYear_bounds" CHECK ("releaseYear" IS NULL OR "releaseYear" BETWEEN 1 AND 9999);

ALTER TABLE "accessory_variant" ADD CONSTRAINT "accessory_variant_releaseYear_bounds" CHECK ("releaseYear" IS NULL OR "releaseYear" BETWEEN 1 AND 9999);

ALTER TABLE "console_platform" ADD CONSTRAINT "console_platform_year_order" CHECK ("discontinuedYear" IS NULL OR "originalReleaseYear" IS NULL OR "discontinuedYear" >= "originalReleaseYear");

ALTER TABLE "console_model" ADD CONSTRAINT "console_model_year_order" CHECK ("discontinuedYear" IS NULL OR "releaseYear" IS NULL OR "discontinuedYear" >= "releaseYear");

ALTER TABLE "console_platform" ADD CONSTRAINT "console_platform_generation_positive" CHECK ("generation" IS NULL OR "generation" > 0);

ALTER TABLE "console_model" ADD CONSTRAINT "console_model_widthMm_positive" CHECK ("widthMm" IS NULL OR "widthMm" > 0);

ALTER TABLE "console_model" ADD CONSTRAINT "console_model_heightMm_positive" CHECK ("heightMm" IS NULL OR "heightMm" > 0);

ALTER TABLE "console_model" ADD CONSTRAINT "console_model_depthMm_positive" CHECK ("depthMm" IS NULL OR "depthMm" > 0);

ALTER TABLE "console_model" ADD CONSTRAINT "console_model_weightGrams_positive" CHECK ("weightGrams" IS NULL OR "weightGrams" > 0);

ALTER TABLE "console_model" ADD CONSTRAINT "console_model_specifications_envelope" CHECK ("specifications" IS NULL OR (jsonb_typeof("specifications") = 'object' AND "specifications"->'schemaVersion' = '1'::jsonb AND jsonb_typeof("specifications"->'data') = 'object') IS TRUE);

ALTER TABLE "accessory" ADD CONSTRAINT "accessory_specifications_envelope" CHECK ("specifications" IS NULL OR (jsonb_typeof("specifications") = 'object' AND "specifications"->'schemaVersion' = '1'::jsonb AND jsonb_typeof("specifications"->'data') = 'object') IS TRUE);

ALTER TABLE "accessory_variant" ADD CONSTRAINT "accessory_variant_specificationsOverride_envelope" CHECK ("specificationsOverride" IS NULL OR (jsonb_typeof("specificationsOverride") = 'object' AND "specificationsOverride"->'schemaVersion' = '1'::jsonb AND jsonb_typeof("specificationsOverride"->'data') = 'object') IS TRUE);

ALTER TABLE "game_release" ADD CONSTRAINT "game_release_metadata_envelope" CHECK ("metadata" IS NULL OR (jsonb_typeof("metadata") = 'object' AND "metadata"->'schemaVersion' = '1'::jsonb AND jsonb_typeof("metadata"->'data') = 'object') IS TRUE);

ALTER TABLE "external_reference" ADD CONSTRAINT "external_reference_metadata_envelope" CHECK ("metadata" IS NULL OR (jsonb_typeof("metadata") = 'object' AND "metadata"->'schemaVersion' = '1'::jsonb AND jsonb_typeof("metadata"->'data') = 'object') IS TRUE);

ALTER TABLE "metadata_change" ADD CONSTRAINT "metadata_change_sourceSnapshot_envelope" CHECK ("sourceSnapshot" IS NULL OR (jsonb_typeof("sourceSnapshot") = 'object' AND "sourceSnapshot"->'schemaVersion' = '1'::jsonb AND jsonb_typeof("sourceSnapshot"->'data') = 'object') IS TRUE);

ALTER TABLE "game_release_region" ADD CONSTRAINT "game_release_region_partial_date" CHECK ((("releaseYear" IS NULL AND "releaseMonth" IS NULL AND "releaseDay" IS NULL)
 OR ("releaseYear" BETWEEN 1 AND 9999 AND ("releaseMonth" IS NULL AND "releaseDay" IS NULL OR "releaseMonth" BETWEEN 1 AND 12 AND ("releaseDay" IS NULL OR "releaseDay" BETWEEN 1 AND
 CASE "releaseMonth" WHEN 2 THEN CASE WHEN "releaseYear" % 400 = 0 OR ("releaseYear" % 4 = 0 AND "releaseYear" % 100 <> 0) THEN 29 ELSE 28 END
 WHEN 4 THEN 30 WHEN 6 THEN 30 WHEN 9 THEN 30 WHEN 11 THEN 30 ELSE 31 END))) IS TRUE) IS TRUE);

ALTER TABLE "game_company" ADD CONSTRAINT "game_company_developer_role" CHECK ("role" = 'DEVELOPER');

ALTER TABLE "game_company" ADD CONSTRAINT "game_company_order_nonnegative" CHECK ("sortOrder" >= 0);

ALTER TABLE "game_release_company" ADD CONSTRAINT "game_release_company_order_nonnegative" CHECK ("sortOrder" >= 0);

ALTER TABLE "location" ADD CONSTRAINT "location_order_nonnegative" CHECK ("sortOrder" >= 0);

CREATE UNIQUE INDEX "release_company_unscoped_key" ON "game_release_company" ("gameReleaseId", "companyId", "role") WHERE "regionId" IS NULL;
CREATE UNIQUE INDEX "release_company_scoped_key" ON "game_release_company" ("gameReleaseId", "companyId", "role", "regionId") WHERE "regionId" IS NOT NULL;

ALTER TABLE "product_identifier" ADD CONSTRAINT "product_identifier_exactly_one_target" CHECK (num_nonnulls("consoleModelId", "gameReleaseId", "accessoryVariantId") = 1);

ALTER TABLE "external_reference" ADD CONSTRAINT "external_reference_exactly_one_target" CHECK (num_nonnulls("companyId", "platformId", "consoleModelId", "gameId", "gameReleaseId", "accessoryId", "accessoryVariantId") = 1);

ALTER TABLE "metadata_change" ADD CONSTRAINT "metadata_change_exactly_one_target" CHECK (num_nonnulls("companyId", "regionId", "platformId", "consoleModelId", "gameId", "gameReleaseId", "accessoryId", "accessoryVariantId") = 1);

ALTER TABLE "product_identifier" ADD CONSTRAINT "product_identifier_value_nonempty" CHECK (btrim("value") <> '' AND btrim("normalizedValue") <> '');

ALTER TABLE "external_reference" ADD CONSTRAINT "external_reference_identity_nonempty" CHECK (btrim("provider") <> '' AND ("externalId" IS NOT NULL OR "url" IS NOT NULL)
 AND ("externalId" IS NULL OR (btrim("externalId") <> '' AND "providerObjectType" IS NOT NULL AND btrim("providerObjectType") <> ''))
 AND (("url" IS NULL AND "normalizedUrl" IS NULL) OR ("url" IS NOT NULL AND "normalizedUrl" IS NOT NULL AND btrim("url") <> '' AND btrim("normalizedUrl") <> '')));

CREATE UNIQUE INDEX "external_reference_companyId_url_key" ON "external_reference" ("companyId", "provider", "normalizedUrl") WHERE "externalId" IS NULL AND "companyId" IS NOT NULL;

CREATE UNIQUE INDEX "external_reference_platformId_url_key" ON "external_reference" ("platformId", "provider", "normalizedUrl") WHERE "externalId" IS NULL AND "platformId" IS NOT NULL;

CREATE UNIQUE INDEX "external_reference_consoleModelId_url_key" ON "external_reference" ("consoleModelId", "provider", "normalizedUrl") WHERE "externalId" IS NULL AND "consoleModelId" IS NOT NULL;

CREATE UNIQUE INDEX "external_reference_gameId_url_key" ON "external_reference" ("gameId", "provider", "normalizedUrl") WHERE "externalId" IS NULL AND "gameId" IS NOT NULL;

CREATE UNIQUE INDEX "external_reference_gameReleaseId_url_key" ON "external_reference" ("gameReleaseId", "provider", "normalizedUrl") WHERE "externalId" IS NULL AND "gameReleaseId" IS NOT NULL;

CREATE UNIQUE INDEX "external_reference_accessoryId_url_key" ON "external_reference" ("accessoryId", "provider", "normalizedUrl") WHERE "externalId" IS NULL AND "accessoryId" IS NOT NULL;

CREATE UNIQUE INDEX "external_reference_accessoryVariantId_url_key" ON "external_reference" ("accessoryVariantId", "provider", "normalizedUrl") WHERE "externalId" IS NULL AND "accessoryVariantId" IS NOT NULL;

ALTER TABLE "location" ADD CONSTRAINT "location_name_normalized" CHECK (btrim("name") <> '' AND "name" = btrim("name") AND "normalizedName" = lower(btrim("name")));

ALTER TABLE "location" ADD CONSTRAINT "location_no_self_parent" CHECK ("parentId" IS NULL OR "parentId" <> "id");

CREATE UNIQUE INDEX "location_root_name_key" ON "location" ("normalizedName") WHERE "parentId" IS NULL;

ALTER TABLE "collection_item" ADD CONSTRAINT "collection_item_revision_positive" CHECK ("revision" > 0);

ALTER TABLE "collection_item" ADD CONSTRAINT "collection_item_publication_metadata" CHECK (("publicationStatus" = 'PRIVATE' AND "publishedAt" IS NULL AND "publishedById" IS NULL) OR ("publicationStatus" = 'PUBLISHED' AND "publishedAt" IS NOT NULL));

ALTER TABLE "owned_console" ADD CONSTRAINT "owned_console_fixed_type" CHECK ("type" = 'CONSOLE');

ALTER TABLE "owned_game" ADD CONSTRAINT "owned_game_fixed_type" CHECK ("type" = 'GAME');

ALTER TABLE "owned_accessory" ADD CONSTRAINT "owned_accessory_fixed_type" CHECK ("type" = 'ACCESSORY');

ALTER TABLE "defect" ADD CONSTRAINT "defect_title_nonempty" CHECK (btrim("title") <> '');

ALTER TABLE "defect" ADD CONSTRAINT "defect_resolution_state" CHECK (("status" = 'REPAIRED' AND "resolvedAt" IS NOT NULL) OR ("status" <> 'REPAIRED' AND "resolvedAt" IS NULL));

ALTER TABLE "metadata_change" ADD CONSTRAINT "metadata_change_revision_path_version" CHECK ("rootRevision" > 0 AND btrim("fieldPath") <> '' AND "snapshotSchemaVersion" = 1);


-- A root may be temporarily without a subtype inside its creating transaction,
-- but each surviving root must have its sole matching subtype at commit.
CREATE FUNCTION "check_collection_subtype"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  item_id uuid;
  item_type public."CollectionItemType";
  has_subtype boolean;
  ids uuid[];
BEGIN
  IF TG_TABLE_NAME = 'collection_item' THEN
    ids := ARRAY[NEW."id"];
  ELSIF TG_OP = 'DELETE' THEN
    ids := ARRAY[OLD."collectionItemId"];
  ELSE
    ids := ARRAY[OLD."collectionItemId", NEW."collectionItemId"];
  END IF;
  FOREACH item_id IN ARRAY ids LOOP
    SELECT "type" INTO item_type FROM public."collection_item" WHERE "id" = item_id FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    has_subtype := CASE item_type
      WHEN 'CONSOLE' THEN EXISTS (SELECT 1 FROM public."owned_console" WHERE "collectionItemId" = item_id)
      WHEN 'GAME' THEN EXISTS (SELECT 1 FROM public."owned_game" WHERE "collectionItemId" = item_id)
      WHEN 'ACCESSORY' THEN EXISTS (SELECT 1 FROM public."owned_accessory" WHERE "collectionItemId" = item_id)
      ELSE false END;
    IF NOT has_subtype THEN
      RAISE EXCEPTION 'Collection item requires its matching owned subtype.' USING ERRCODE = '23514', CONSTRAINT = 'collection_item_required_subtype';
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "collection_item_required_subtype" AFTER INSERT ON "collection_item"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "check_collection_subtype"();
CREATE CONSTRAINT TRIGGER "owned_console_required_subtype" AFTER DELETE OR UPDATE ON "owned_console"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "check_collection_subtype"();
CREATE CONSTRAINT TRIGGER "owned_game_required_subtype" AFTER DELETE OR UPDATE ON "owned_game"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "check_collection_subtype"();
CREATE CONSTRAINT TRIGGER "owned_accessory_required_subtype" AFTER DELETE OR UPDATE ON "owned_accessory"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "check_collection_subtype"();

CREATE FUNCTION "keep_collection_type"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW."type" IS DISTINCT FROM OLD."type" THEN
    RAISE EXCEPTION 'Collection item type is immutable.' USING ERRCODE = '23514', CONSTRAINT = 'collection_item_type_immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "collection_item_type_immutable" BEFORE UPDATE OF "type" ON "collection_item"
FOR EACH ROW EXECUTE FUNCTION "keep_collection_type"();

CREATE FUNCTION "keep_region_code"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW."code" IS DISTINCT FROM OLD."code" THEN
    RAISE EXCEPTION 'Market code is immutable.' USING ERRCODE = '23514', CONSTRAINT = 'region_code_immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "region_code_immutable" BEFORE UPDATE OF "code" ON "region"
FOR EACH ROW EXECUTE FUNCTION "keep_region_code"();

CREATE FUNCTION "keep_metadata_change"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  -- Only removal of deleted-user attribution is permitted; facts stay immutable.
  IF TG_OP = 'UPDATE' THEN
    IF OLD."actorId" IS NOT NULL AND NEW."actorId" IS NULL AND
       (to_jsonb(OLD) - 'actorId') = (to_jsonb(NEW) - 'actorId') THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'Metadata history is immutable.' USING ERRCODE = '23514', CONSTRAINT = 'metadata_change_immutable';
END;
$$;
CREATE TRIGGER "metadata_change_immutable" BEFORE UPDATE OR DELETE ON "metadata_change"
FOR EACH ROW EXECUTE FUNCTION "keep_metadata_change"();

-- Singleton defaults are configuration, not catalog seeds or owned-copy data.
CREATE FUNCTION "keep_settings_singleton"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  RAISE EXCEPTION 'Settings singletons must be updated, not deleted.'
    USING ERRCODE = '23514', CONSTRAINT = 'settings_singleton_required';
END;
$$;
CREATE TRIGGER "app_settings_required" BEFORE DELETE ON "app_settings"
FOR EACH ROW EXECUTE FUNCTION "keep_settings_singleton"();
CREATE TRIGGER "public_settings_required" BEFORE DELETE ON "public_settings"
FOR EACH ROW EXECUTE FUNCTION "keep_settings_singleton"();

INSERT INTO "app_settings" ("id") VALUES (1);
INSERT INTO "public_settings" ("id") VALUES (1);

COMMIT;
