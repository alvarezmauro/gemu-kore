BEGIN;

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('IMAGE', 'MODEL_3D', 'VIDEO', 'DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetScope" AS ENUM ('CATALOG', 'COLLECTION');

-- CreateEnum
CREATE TYPE "AssetDeliveryClass" AS ENUM ('ORIGINAL', 'DISPLAY');

-- CreateEnum
CREATE TYPE "AssetState" AS ENUM ('PENDING', 'READY', 'FAILED', 'DELETING');

-- CreateEnum
CREATE TYPE "AssetSourceType" AS ENUM ('USER_UPLOAD', 'CURATED', 'EXTERNAL_PROVIDER', 'AI_ASSISTED', 'IMPORTED');

-- CreateEnum
CREATE TYPE "AssetRightsStatus" AS ENUM ('UNKNOWN', 'APPROVED', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "AssetDependencyPurpose" AS ENUM ('RESIZE', 'SANITIZE', 'RENDER_INPUT');

-- CreateEnum
CREATE TYPE "CatalogAssetRole" AS ENUM ('LOGO', 'COVER', 'SCREENSHOT', 'GALLERY', 'MODEL_3D', 'VIDEO', 'PREVIEW');

-- CreateEnum
CREATE TYPE "CollectionMediaType" AS ENUM ('PHOTO', 'FRONT', 'BACK', 'LEFT', 'RIGHT', 'TOP', 'BOTTOM', 'SERIAL', 'BOX', 'DAMAGE', 'OTHER', 'CUSTOM_LOGO', 'CUSTOM_MODEL');

-- CreateEnum
CREATE TYPE "AppAssetRole" AS ENUM ('COLLECTION_LOGO');

-- CreateTable
CREATE TABLE "asset" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "AssetKind" NOT NULL,
    "scope" "AssetScope" NOT NULL,
    "deliveryClass" "AssetDeliveryClass" NOT NULL DEFAULT 'ORIGINAL',
    "state" "AssetState" NOT NULL DEFAULT 'PENDING',
    "storageNamespace" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" BIGINT,
    "width" INTEGER,
    "height" INTEGER,
    "durationSeconds" DOUBLE PRECISION,
    "originalFilename" TEXT,
    "sha256" VARCHAR(64),
    "sourceType" "AssetSourceType" NOT NULL DEFAULT 'USER_UPLOAD',
    "provider" TEXT,
    "sourceUrl" TEXT,
    "author" TEXT,
    "licenseName" TEXT,
    "licenseUrl" TEXT,
    "attribution" TEXT,
    "usageRestrictions" TEXT,
    "retrievedAt" TIMESTAMPTZ(3),
    "rightsStatus" "AssetRightsStatus" NOT NULL DEFAULT 'UNKNOWN',
    "publicSafe" BOOLEAN NOT NULL DEFAULT false,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "uploadedById" UUID,
    "metadata" JSONB,
    "transformMetadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_dependency" (
    "derivedAssetId" UUID NOT NULL,
    "sourceAssetId" UUID NOT NULL,
    "purpose" "AssetDependencyPurpose" NOT NULL,

    CONSTRAINT "asset_dependency_pkey" PRIMARY KEY ("derivedAssetId","sourceAssetId")
);

-- CreateTable
CREATE TABLE "catalog_asset" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID,
    "consolePlatformId" UUID,
    "consoleModelId" UUID,
    "gameId" UUID,
    "gameReleaseId" UUID,
    "accessoryId" UUID,
    "accessoryVariantId" UUID,
    "role" "CatalogAssetRole" NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "caption" TEXT,
    "altText" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "assetId" UUID NOT NULL,
    "publicDisplayAssetId" UUID,
    "publicApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_item_media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "collectionItemId" UUID NOT NULL,
    "type" "CollectionMediaType" NOT NULL DEFAULT 'PHOTO',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "caption" TEXT,
    "altText" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "assetId" UUID NOT NULL,
    "publicDisplayAssetId" UUID,
    "publicApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_item_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_asset" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "appSettingsId" INTEGER NOT NULL DEFAULT 1,
    "role" "AppAssetRole" NOT NULL DEFAULT 'COLLECTION_LOGO',
    "assetId" UUID NOT NULL,
    "publicDisplayAssetId" UUID,
    "publicApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_asset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_sha256_idx" ON "asset"("sha256");

-- CreateIndex
CREATE INDEX "asset_state_createdAt_idx" ON "asset"("state", "createdAt");

-- CreateIndex
CREATE INDEX "asset_uploadedById_idx" ON "asset"("uploadedById");

-- CreateIndex
CREATE INDEX "asset_reviewedById_idx" ON "asset"("reviewedById");

-- CreateIndex
CREATE UNIQUE INDEX "asset_storageNamespace_objectKey_key" ON "asset"("storageNamespace", "objectKey");

-- CreateIndex
CREATE INDEX "asset_dependency_sourceAssetId_derivedAssetId_idx" ON "asset_dependency"("sourceAssetId", "derivedAssetId");

-- CreateIndex
CREATE INDEX "catalog_asset_assetId_idx" ON "catalog_asset"("assetId");

-- CreateIndex
CREATE INDEX "catalog_asset_publicDisplayAssetId_idx" ON "catalog_asset"("publicDisplayAssetId");

-- CreateIndex
CREATE INDEX "catalog_asset_approvedById_idx" ON "catalog_asset"("approvedById");

-- CreateIndex
CREATE INDEX "catalog_asset_companyId_role_sortOrder_idx" ON "catalog_asset"("companyId", "role", "sortOrder");

-- CreateIndex
CREATE INDEX "catalog_asset_consolePlatformId_role_sortOrder_idx" ON "catalog_asset"("consolePlatformId", "role", "sortOrder");

-- CreateIndex
CREATE INDEX "catalog_asset_consoleModelId_role_sortOrder_idx" ON "catalog_asset"("consoleModelId", "role", "sortOrder");

-- CreateIndex
CREATE INDEX "catalog_asset_gameId_role_sortOrder_idx" ON "catalog_asset"("gameId", "role", "sortOrder");

-- CreateIndex
CREATE INDEX "catalog_asset_gameReleaseId_role_sortOrder_idx" ON "catalog_asset"("gameReleaseId", "role", "sortOrder");

-- CreateIndex
CREATE INDEX "catalog_asset_accessoryId_role_sortOrder_idx" ON "catalog_asset"("accessoryId", "role", "sortOrder");

-- CreateIndex
CREATE INDEX "catalog_asset_accessoryVariantId_role_sortOrder_idx" ON "catalog_asset"("accessoryVariantId", "role", "sortOrder");

-- CreateIndex
CREATE INDEX "collection_item_media_collectionItemId_sortOrder_id_idx" ON "collection_item_media"("collectionItemId", "sortOrder", "id");

-- CreateIndex
CREATE INDEX "collection_item_media_assetId_idx" ON "collection_item_media"("assetId");

-- CreateIndex
CREATE INDEX "collection_item_media_publicDisplayAssetId_idx" ON "collection_item_media"("publicDisplayAssetId");

-- CreateIndex
CREATE INDEX "collection_item_media_approvedById_idx" ON "collection_item_media"("approvedById");

-- CreateIndex
CREATE INDEX "app_asset_assetId_idx" ON "app_asset"("assetId");

-- CreateIndex
CREATE INDEX "app_asset_publicDisplayAssetId_idx" ON "app_asset"("publicDisplayAssetId");

-- CreateIndex
CREATE INDEX "app_asset_approvedById_idx" ON "app_asset"("approvedById");

-- CreateIndex
CREATE UNIQUE INDEX "app_asset_appSettingsId_role_key" ON "app_asset"("appSettingsId", "role");

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "asset_dependency" ADD CONSTRAINT "asset_dependency_derivedAssetId_fkey" FOREIGN KEY ("derivedAssetId") REFERENCES "asset"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "asset_dependency" ADD CONSTRAINT "asset_dependency_sourceAssetId_fkey" FOREIGN KEY ("sourceAssetId") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "catalog_asset" ADD CONSTRAINT "catalog_asset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "catalog_asset" ADD CONSTRAINT "catalog_asset_consolePlatformId_fkey" FOREIGN KEY ("consolePlatformId") REFERENCES "console_platform"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "catalog_asset" ADD CONSTRAINT "catalog_asset_consoleModelId_fkey" FOREIGN KEY ("consoleModelId") REFERENCES "console_model"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "catalog_asset" ADD CONSTRAINT "catalog_asset_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "catalog_asset" ADD CONSTRAINT "catalog_asset_gameReleaseId_fkey" FOREIGN KEY ("gameReleaseId") REFERENCES "game_release"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "catalog_asset" ADD CONSTRAINT "catalog_asset_accessoryId_fkey" FOREIGN KEY ("accessoryId") REFERENCES "accessory"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "catalog_asset" ADD CONSTRAINT "catalog_asset_accessoryVariantId_fkey" FOREIGN KEY ("accessoryVariantId") REFERENCES "accessory_variant"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "catalog_asset" ADD CONSTRAINT "catalog_asset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "catalog_asset" ADD CONSTRAINT "catalog_asset_publicDisplayAssetId_fkey" FOREIGN KEY ("publicDisplayAssetId") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "catalog_asset" ADD CONSTRAINT "catalog_asset_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "collection_item_media" ADD CONSTRAINT "collection_item_media_collectionItemId_fkey" FOREIGN KEY ("collectionItemId") REFERENCES "collection_item"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "collection_item_media" ADD CONSTRAINT "collection_item_media_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "collection_item_media" ADD CONSTRAINT "collection_item_media_publicDisplayAssetId_fkey" FOREIGN KEY ("publicDisplayAssetId") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "collection_item_media" ADD CONSTRAINT "collection_item_media_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "app_asset" ADD CONSTRAINT "app_asset_appSettingsId_fkey" FOREIGN KEY ("appSettingsId") REFERENCES "app_settings"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "app_asset" ADD CONSTRAINT "app_asset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "app_asset" ADD CONSTRAINT "app_asset_publicDisplayAssetId_fkey" FOREIGN KEY ("publicDisplayAssetId") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "app_asset" ADD CONSTRAINT "app_asset_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE RESTRICT;


ALTER TABLE asset ADD CONSTRAINT asset_ready_metadata CHECK (
  state <> 'READY' OR ("mimeType" IS NOT NULL AND "sizeBytes" IS NOT NULL AND "sizeBytes" > 0 AND sha256 IS NOT NULL AND sha256 ~ '^[a-f0-9]{64}$'
  AND (kind <> 'IMAGE' OR (width IS NOT NULL AND height IS NOT NULL AND width > 0 AND height > 0)))) ,
  ADD CONSTRAINT asset_bounds CHECK (("sizeBytes" IS NULL OR "sizeBytes" BETWEEN 1 AND 52428800)
    AND (width IS NULL OR width > 0) AND (height IS NULL OR height > 0)
    AND ("durationSeconds" IS NULL OR "durationSeconds" >= 0)
    AND (sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$')
    AND length("objectKey") BETWEEN 1 AND 512 AND length("storageNamespace") BETWEEN 1 AND 64
    AND ("originalFilename" IS NULL OR length("originalFilename") <= 255)),
  ADD CONSTRAINT asset_json_bounds CHECK ((metadata IS NULL OR (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 16384))
    AND ("transformMetadata" IS NULL OR (jsonb_typeof("transformMetadata") = 'object' AND octet_length("transformMetadata"::text) <= 16384))),
  ADD CONSTRAINT asset_review CHECK (NOT "publicSafe" OR ("deliveryClass" = 'DISPLAY' AND "rightsStatus" = 'APPROVED' AND "reviewedAt" IS NOT NULL));
ALTER TABLE asset_dependency ADD CONSTRAINT asset_dependency_not_self CHECK ("derivedAssetId" <> "sourceAssetId");
ALTER TABLE catalog_asset ADD CONSTRAINT catalog_asset_one_target CHECK (num_nonnulls("companyId", "consolePlatformId", "consoleModelId", "gameId", "gameReleaseId", "accessoryId", "accessoryVariantId") = 1);

CREATE FUNCTION asset_has_references(asset_id uuid) RETURNS boolean LANGUAGE sql VOLATILE AS $$
 SELECT EXISTS(SELECT FROM catalog_asset WHERE "assetId"=asset_id OR "publicDisplayAssetId"=asset_id)
 OR EXISTS(SELECT FROM collection_item_media WHERE "assetId"=asset_id OR "publicDisplayAssetId"=asset_id)
 OR EXISTS(SELECT FROM app_asset WHERE "assetId"=asset_id OR "publicDisplayAssetId"=asset_id)
 OR EXISTS(SELECT FROM asset_dependency WHERE "sourceAssetId"=asset_id)
$$;
CREATE FUNCTION guard_asset_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN
   IF OLD.state <> 'DELETING' OR asset_has_references(OLD.id) THEN RAISE EXCEPTION 'Claim unused asset before deleting' USING ERRCODE='23514'; END IF;
   RETURN OLD;
 END IF;
 IF ROW(NEW.id, NEW."storageNamespace", NEW."objectKey", NEW.kind, NEW.scope, NEW."deliveryClass") IS DISTINCT FROM ROW(OLD.id, OLD."storageNamespace", OLD."objectKey", OLD.kind, OLD.scope, OLD."deliveryClass") THEN
   RAISE EXCEPTION 'Asset identity is immutable' USING ERRCODE='23514';
 END IF;
 IF (OLD.state <> 'PENDING' OR OLD.sha256 IS NOT NULL) AND ROW(NEW."mimeType",NEW."sizeBytes",NEW.sha256,NEW.width,NEW.height,NEW."durationSeconds",NEW.metadata,NEW."transformMetadata",NEW."originalFilename") IS DISTINCT FROM ROW(OLD."mimeType",OLD."sizeBytes",OLD.sha256,OLD.width,OLD.height,OLD."durationSeconds",OLD.metadata,OLD."transformMetadata",OLD."originalFilename") THEN
   RAISE EXCEPTION 'Prepared asset bytes are immutable' USING ERRCODE='23514';
 END IF;
 IF OLD.metadata IS NOT NULL AND NEW.metadata IS DISTINCT FROM OLD.metadata THEN RAISE EXCEPTION 'Upload manifest is fixed' USING ERRCODE='23514'; END IF;
 IF NEW.state <> OLD.state AND NOT ((OLD.state='PENDING' AND NEW.state IN ('READY','FAILED','DELETING')) OR (OLD.state IN ('READY','FAILED') AND NEW.state='DELETING')) THEN RAISE EXCEPTION 'Invalid asset transition' USING ERRCODE='23514'; END IF;
 IF NEW.state='DELETING' AND asset_has_references(OLD.id) THEN RAISE EXCEPTION 'Referenced asset cannot be deleted' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER asset_lifecycle BEFORE UPDATE OR DELETE ON asset FOR EACH ROW EXECUTE FUNCTION guard_asset_lifecycle();

CREATE FUNCTION guard_asset_dependency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE derived asset%ROWTYPE; source asset%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN
   SELECT * INTO derived FROM asset WHERE id=OLD."derivedAssetId" FOR UPDATE;
   IF FOUND AND derived.state <> 'DELETING' THEN RAISE EXCEPTION 'Lineage is fixed until deletion' USING ERRCODE='23514'; END IF;
   RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Lineage is immutable' USING ERRCODE='23514'; END IF;
 PERFORM id FROM asset WHERE id IN (NEW."derivedAssetId",NEW."sourceAssetId") ORDER BY id FOR UPDATE;
 SELECT * INTO derived FROM asset WHERE id=NEW."derivedAssetId";
 SELECT * INTO source FROM asset WHERE id=NEW."sourceAssetId";
 IF derived.state IS DISTINCT FROM 'PENDING' OR source.state IS DISTINCT FROM 'READY' OR derived.scope IS DISTINCT FROM source.scope THEN RAISE EXCEPTION 'Invalid lineage state or scope' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER asset_dependency_guard BEFORE INSERT OR UPDATE OR DELETE ON asset_dependency FOR EACH ROW EXECUTE FUNCTION guard_asset_dependency();

CREATE FUNCTION asset_public_eligible(asset_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 WITH RECURSIVE inputs AS (
 SELECT a.id,a.state,a."rightsStatus",0 AS depth FROM asset a WHERE a.id=asset_id
 UNION ALL SELECT a.id,a.state,a."rightsStatus",i.depth+1 FROM inputs i JOIN asset_dependency d ON d."derivedAssetId"=i.id JOIN asset a ON a.id=d."sourceAssetId" WHERE i.depth < 32
 ) SELECT EXISTS(SELECT FROM asset WHERE id=asset_id AND state='READY' AND "deliveryClass"='DISPLAY' AND "publicSafe" AND "rightsStatus"='APPROVED')
 AND NOT EXISTS(SELECT FROM inputs WHERE state<>'READY' OR "rightsStatus"<>'APPROVED' OR depth=32)
$$;
CREATE FUNCTION guard_asset_use() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE file asset%ROWTYPE; public_file asset%ROWTYPE; item_type "CollectionItemType"; expected_scope "AssetScope";
BEGIN
 PERFORM id FROM asset WHERE id IN (NEW."assetId",NEW."publicDisplayAssetId") ORDER BY id FOR UPDATE;
 SELECT * INTO file FROM asset WHERE id=NEW."assetId";
 expected_scope := CASE WHEN TG_TABLE_NAME='catalog_asset' THEN 'CATALOG'::"AssetScope" ELSE 'COLLECTION'::"AssetScope" END;
 IF file.state IS DISTINCT FROM 'READY' OR file.scope IS DISTINCT FROM expected_scope THEN RAISE EXCEPTION 'Use requires ready asset of matching scope' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='collection_item_media' THEN
   SELECT type INTO item_type FROM collection_item WHERE id=NEW."collectionItemId";
   IF (NEW.type='CUSTOM_LOGO' AND (item_type<>'CONSOLE' OR file.kind<>'IMAGE')) OR (NEW.type='CUSTOM_MODEL' AND (item_type='GAME' OR file.kind<>'MODEL_3D')) OR (NEW.type NOT IN ('CUSTOM_MODEL') AND file.kind<>'IMAGE') THEN RAISE EXCEPTION 'Invalid collection media kind' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='app_asset' THEN
   IF file.kind<>'IMAGE' THEN RAISE EXCEPTION 'Application logo must be an image' USING ERRCODE='23514'; END IF;
 ELSE
   IF (NEW.role='MODEL_3D' AND file.kind<>'MODEL_3D') OR (NEW.role='VIDEO' AND file.kind<>'VIDEO') OR (NEW.role NOT IN ('MODEL_3D','VIDEO') AND file.kind<>'IMAGE') THEN RAISE EXCEPTION 'Invalid catalog media kind' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW."publicDisplayAssetId" IS NOT NULL THEN
   SELECT * INTO public_file FROM asset WHERE id=NEW."publicDisplayAssetId";
   IF public_file.scope<>expected_scope OR NOT asset_public_eligible(public_file.id) THEN RAISE EXCEPTION 'Public display is ineligible' USING ERRCODE='23514'; END IF;
   IF public_file.id<>file.id AND NOT EXISTS(
     WITH RECURSIVE ancestors AS (SELECT file.id AS id UNION SELECT d."sourceAssetId" FROM asset_dependency d JOIN ancestors a ON d."derivedAssetId"=a.id),
     public_ancestors AS (SELECT public_file.id AS id UNION SELECT d."sourceAssetId" FROM asset_dependency d JOIN public_ancestors a ON d."derivedAssetId"=a.id)
     SELECT FROM ancestors JOIN public_ancestors USING(id)
   ) THEN RAISE EXCEPTION 'Public display must share lineage' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['updatedAt','publicApproved','approvedById','approvedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['updatedAt','publicApproved','approvedById','approvedAt']) THEN NEW."publicApproved":=false; NEW."approvedById":=NULL; NEW."approvedAt":=NULL; END IF;
 IF NEW."publicApproved" AND (NEW."publicDisplayAssetId" IS NULL OR NEW."approvedAt" IS NULL) THEN RAISE EXCEPTION 'Publication requires reviewed display' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER catalog_asset_guard BEFORE INSERT OR UPDATE ON catalog_asset FOR EACH ROW EXECUTE FUNCTION guard_asset_use();
CREATE TRIGGER collection_item_media_guard BEFORE INSERT OR UPDATE ON collection_item_media FOR EACH ROW EXECUTE FUNCTION guard_asset_use();
CREATE TRIGGER app_asset_guard BEFORE INSERT OR UPDATE ON app_asset FOR EACH ROW EXECUTE FUNCTION guard_asset_use();
CREATE UNIQUE INDEX catalog_asset_primary_companyId ON catalog_asset ("companyId", role) WHERE "isPrimary" AND "companyId" IS NOT NULL;
CREATE UNIQUE INDEX catalog_asset_primary_consolePlatformId ON catalog_asset ("consolePlatformId", role) WHERE "isPrimary" AND "consolePlatformId" IS NOT NULL;
CREATE UNIQUE INDEX catalog_asset_primary_consoleModelId ON catalog_asset ("consoleModelId", role) WHERE "isPrimary" AND "consoleModelId" IS NOT NULL;
CREATE UNIQUE INDEX catalog_asset_primary_gameId ON catalog_asset ("gameId", role) WHERE "isPrimary" AND "gameId" IS NOT NULL;
CREATE UNIQUE INDEX catalog_asset_primary_gameReleaseId ON catalog_asset ("gameReleaseId", role) WHERE "isPrimary" AND "gameReleaseId" IS NOT NULL;
CREATE UNIQUE INDEX catalog_asset_primary_accessoryId ON catalog_asset ("accessoryId", role) WHERE "isPrimary" AND "accessoryId" IS NOT NULL;
CREATE UNIQUE INDEX catalog_asset_primary_accessoryVariantId ON catalog_asset ("accessoryVariantId", role) WHERE "isPrimary" AND "accessoryVariantId" IS NOT NULL;
CREATE UNIQUE INDEX collection_item_media_primary_override ON collection_item_media ("collectionItemId", type) WHERE "isPrimary" AND type IN ('CUSTOM_LOGO','CUSTOM_MODEL');
ALTER TABLE catalog_asset ADD CONSTRAINT catalog_asset_text_bounds CHECK ((caption IS NULL OR length(caption)<=2000) AND ("altText" IS NULL OR length("altText")<=1000) AND "sortOrder">=0);
ALTER TABLE collection_item_media ADD CONSTRAINT collection_item_media_text_bounds CHECK ((caption IS NULL OR length(caption)<=2000) AND ("altText" IS NULL OR length("altText")<=1000) AND "sortOrder">=0);

COMMIT;
