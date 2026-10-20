BEGIN;
-- CreateEnum
CREATE TYPE "PhysicalMediaType" AS ENUM ('CARTRIDGE', 'DISC', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "PhysicalMediaTemplateStatus" AS ENUM ('DRAFT', 'READY');

-- AlterTable
ALTER TABLE "game_release_included_item" ADD COLUMN     "physicalMediaTemplateId" UUID;

-- CreateTable
CREATE TABLE "physical_media_template" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "familyKey" TEXT NOT NULL DEFAULT 'cartridge',
    "revisionNumber" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" "PhysicalMediaTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "geometryType" TEXT NOT NULL DEFAULT 'GLB',
    "type" "PhysicalMediaType" NOT NULL DEFAULT 'CARTRIDGE',
    "baseModelAssetId" UUID,
    "dimensions" JSONB NOT NULL,
    "materialSettings" JSONB NOT NULL,
    "cameraSettings" JSONB NOT NULL,
    "metadata" JSONB NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "physical_media_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "physical_media_texture_slot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "physicalMediaTemplateId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL,
    "materialName" TEXT NOT NULL,
    "target" JSONB NOT NULL,

    CONSTRAINT "physical_media_texture_slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "physical_media_texture_binding" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "includedItemId" UUID NOT NULL,
    "physicalMediaTemplateId" UUID NOT NULL,
    "physicalMediaTextureSlotId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "transform" JSONB NOT NULL,

    CONSTRAINT "physical_media_texture_binding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "physical_media_template_slug_key" ON "physical_media_template"("slug");

-- CreateIndex
CREATE INDEX "physical_media_template_baseModelAssetId_idx" ON "physical_media_template"("baseModelAssetId");

-- CreateIndex
CREATE INDEX "physical_media_template_createdById_idx" ON "physical_media_template"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "physical_media_template_familyKey_revisionNumber_key" ON "physical_media_template"("familyKey", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "physical_media_texture_slot_physicalMediaTemplateId_name_key" ON "physical_media_texture_slot"("physicalMediaTemplateId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "physical_media_slot_template_key" ON "physical_media_texture_slot"("id", "physicalMediaTemplateId");

-- CreateIndex
CREATE INDEX "physical_media_texture_binding_assetId_idx" ON "physical_media_texture_binding"("assetId");

-- CreateIndex
CREATE INDEX "physical_media_texture_binding_physicalMediaTextureSlotId_p_idx" ON "physical_media_texture_binding"("physicalMediaTextureSlotId", "physicalMediaTemplateId");

-- CreateIndex
CREATE INDEX "physical_media_texture_binding_includedItemId_physicalMedia_idx" ON "physical_media_texture_binding"("includedItemId", "physicalMediaTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "physical_media_texture_binding_includedItemId_physicalMedia_key" ON "physical_media_texture_binding"("includedItemId", "physicalMediaTextureSlotId");

-- CreateIndex
CREATE INDEX "game_release_included_item_physicalMediaTemplateId_idx" ON "game_release_included_item"("physicalMediaTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "component_physical_media_template_key" ON "game_release_included_item"("id", "physicalMediaTemplateId");

-- AddForeignKey
ALTER TABLE "game_release_included_item" ADD CONSTRAINT "game_release_included_item_physicalMediaTemplateId_fkey" FOREIGN KEY ("physicalMediaTemplateId") REFERENCES "physical_media_template"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "physical_media_template" ADD CONSTRAINT "physical_media_template_baseModelAssetId_fkey" FOREIGN KEY ("baseModelAssetId") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "physical_media_template" ADD CONSTRAINT "physical_media_template_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "physical_media_texture_slot" ADD CONSTRAINT "physical_media_texture_slot_physicalMediaTemplateId_fkey" FOREIGN KEY ("physicalMediaTemplateId") REFERENCES "physical_media_template"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "physical_media_texture_binding" ADD CONSTRAINT "physical_media_texture_binding_includedItemId_physicalMedi_fkey" FOREIGN KEY ("includedItemId", "physicalMediaTemplateId") REFERENCES "game_release_included_item"("id", "physicalMediaTemplateId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "physical_media_texture_binding" ADD CONSTRAINT "physical_media_texture_binding_physicalMediaTextureSlotId__fkey" FOREIGN KEY ("physicalMediaTextureSlotId", "physicalMediaTemplateId") REFERENCES "physical_media_texture_slot"("id", "physicalMediaTemplateId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "physical_media_texture_binding" ADD CONSTRAINT "physical_media_texture_binding_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


ALTER TABLE game_release_included_item ADD CONSTRAINT component_media_kind CHECK ("physicalMediaTemplateId" IS NULL OR kind = 'MEDIA');
ALTER TABLE game_release_included_item ADD CONSTRAINT component_template_exclusive CHECK ("packagingTemplateId" IS NULL OR "physicalMediaTemplateId" IS NULL);
ALTER TABLE physical_media_template ADD CONSTRAINT physical_media_template_bounds CHECK (
  length(btrim(name)) BETWEEN 1 AND 200 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 100
  AND "familyKey" = 'cartridge' AND type = 'CARTRIDGE' AND "revisionNumber" > 0 AND revision > 0 AND "geometryType" = 'GLB' AND (status = 'DRAFT' OR "baseModelAssetId" IS NOT NULL)
  AND (dimensions->>'schemaVersion' = '1' AND jsonb_typeof(dimensions->'widthMm') = 'number' AND jsonb_typeof(dimensions->'heightMm') = 'number' AND jsonb_typeof(dimensions->'depthMm') = 'number'
    AND (dimensions->>'widthMm')::numeric BETWEEN 0.1 AND 2000 AND (dimensions->>'heightMm')::numeric BETWEEN 0.1 AND 2000 AND (dimensions->>'depthMm')::numeric BETWEEN 0.1 AND 2000) IS TRUE
  AND jsonb_typeof("materialSettings") = 'object' AND jsonb_typeof("cameraSettings") = 'object' AND jsonb_typeof(metadata) = 'object'
  AND octet_length(concat(dimensions::text,"materialSettings"::text,"cameraSettings"::text,metadata::text)) <= 65536
);
ALTER TABLE physical_media_texture_slot ADD CONSTRAINT media_slot_target CHECK (((target->>'kind' = 'GLB_PRIMITIVE' AND target->>'schemaVersion' = '1' AND target->>'sceneIndex' = '0' AND target->>'uvChannel' = '0' AND name = 'FRONT_LABEL' AND required AND length("materialName") BETWEEN 1 AND 200 AND target->>'materialName' = "materialName" AND length(target->>'nodeName') BETWEEN 1 AND 200 AND target->>'nodeIndex' ~ '^[0-9]{1,4}$' AND (target->>'nodeIndex')::int <= 4095 AND target->>'meshIndex' ~ '^[0-9]{1,4}$' AND (target->>'meshIndex')::int <= 4095 AND target->>'primitiveIndex' ~ '^[0-9]{1,4}$' AND (target->>'primitiveIndex')::int <= 4095 AND target->>'materialIndex' ~ '^[0-9]{1,4}$' AND (target->>'materialIndex')::int <= 4095 AND jsonb_typeof(target->'artWidthMm') = 'number' AND (target->>'artWidthMm')::numeric BETWEEN 0.1 AND 2000 AND jsonb_typeof(target->'artHeightMm') = 'number' AND (target->>'artHeightMm')::numeric BETWEEN 0.1 AND 2000)) IS TRUE);
ALTER TABLE physical_media_texture_binding ADD CONSTRAINT physical_media_transform_bounds CHECK (
  (transform->>'schemaVersion' = '1' AND jsonb_typeof(transform->'crop') = 'object'
  AND jsonb_typeof(transform->'crop'->'x') = 'number' AND jsonb_typeof(transform->'crop'->'y') = 'number'
  AND jsonb_typeof(transform->'crop'->'width') = 'number' AND jsonb_typeof(transform->'crop'->'height') = 'number'
  AND (transform->'crop'->>'x')::numeric >= 0 AND (transform->'crop'->>'y')::numeric >= 0
  AND (transform->'crop'->>'width')::numeric > 0 AND (transform->'crop'->>'height')::numeric > 0
  AND (transform->'crop'->>'x')::numeric + (transform->'crop'->>'width')::numeric <= 1
  AND (transform->'crop'->>'y')::numeric + (transform->'crop'->>'height')::numeric <= 1
  AND transform->>'quarterTurns' IN ('0','1','2','3')) IS TRUE
);
CREATE FUNCTION protect_physical_media_template() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'DRAFT' THEN RAISE EXCEPTION 'Create a draft before readiness' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'READY' THEN RAISE EXCEPTION 'Archive ready template revisions' USING ERRCODE = '23514'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'READY' AND (NEW.status <> 'READY' OR ROW(NEW.id,NEW.type,NEW.slug,NEW."familyKey",NEW."revisionNumber",NEW."geometryType",NEW."baseModelAssetId",NEW.dimensions,NEW."materialSettings",NEW."cameraSettings",NEW.metadata)
    IS DISTINCT FROM ROW(OLD.id,OLD.type,OLD.slug,OLD."familyKey",OLD."revisionNumber",OLD."geometryType",OLD."baseModelAssetId",OLD.dimensions,OLD."materialSettings",OLD."cameraSettings",OLD.metadata)) THEN
    RAISE EXCEPTION 'Ready template contracts are immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.status <> 'READY' AND NEW.status = 'READY' AND (SELECT count(*) FROM physical_media_texture_slot WHERE "physicalMediaTemplateId" = OLD.id) <> 1 THEN
    RAISE EXCEPTION 'Ready cartridges require its complete slot contract' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER physical_media_template_guard BEFORE INSERT OR UPDATE OR DELETE ON physical_media_template FOR EACH ROW EXECUTE FUNCTION protect_physical_media_template();
CREATE FUNCTION protect_physical_media_slot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent uuid;
BEGIN
  parent := CASE WHEN TG_OP = 'INSERT' THEN NEW."physicalMediaTemplateId" ELSE OLD."physicalMediaTemplateId" END;
  PERFORM id FROM physical_media_template WHERE id IN (parent, CASE WHEN TG_OP = 'UPDATE' THEN NEW."physicalMediaTemplateId" ELSE parent END) ORDER BY id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM physical_media_template WHERE id = parent AND status = 'READY')
    OR (TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM physical_media_template WHERE id = NEW."physicalMediaTemplateId" AND status = 'READY')) THEN
    RAISE EXCEPTION 'Ready slots are immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER physical_media_slot_guard BEFORE INSERT OR UPDATE OR DELETE ON physical_media_texture_slot FOR EACH ROW EXECUTE FUNCTION protect_physical_media_slot();
CREATE FUNCTION validate_physical_media_model() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."baseModelAssetId" IS NOT NULL AND NOT EXISTS(SELECT FROM asset WHERE id=NEW."baseModelAssetId" AND state='READY' AND scope='CATALOG' AND kind='MODEL_3D' AND "deliveryClass"='ORIGINAL' AND "mimeType"='model/gltf-binary' AND "sizeBytes" BETWEEN 1 AND 8388608) THEN RAISE EXCEPTION 'PhysicalMedia requires ready catalog geometry' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER physical_media_model_guard BEFORE INSERT OR UPDATE ON physical_media_template FOR EACH ROW EXECUTE FUNCTION validate_physical_media_model();

CREATE FUNCTION validate_physical_media_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM id FROM asset WHERE id=NEW."assetId" FOR UPDATE;
 IF NOT EXISTS(SELECT FROM asset WHERE id=NEW."assetId" AND state='READY' AND scope='CATALOG' AND kind='IMAGE' AND "deliveryClass"='DISPLAY') THEN RAISE EXCEPTION 'Media requires ready catalog display artwork' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER physical_media_binding_guard BEFORE INSERT OR UPDATE ON physical_media_texture_binding FOR EACH ROW EXECUTE FUNCTION validate_physical_media_binding();
CREATE FUNCTION validate_media_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."physicalMediaTemplateId" IS NOT NULL AND (TG_OP='INSERT' OR NEW."physicalMediaTemplateId" IS DISTINCT FROM OLD."physicalMediaTemplateId") AND NOT EXISTS(SELECT FROM physical_media_template WHERE id=NEW."physicalMediaTemplateId" AND status='READY' AND "archivedAt" IS NULL) THEN RAISE EXCEPTION 'Choose a ready active media template' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER media_assignment_guard BEFORE INSERT OR UPDATE ON game_release_included_item FOR EACH ROW EXECUTE FUNCTION validate_media_assignment();
CREATE OR REPLACE FUNCTION asset_has_references(asset_id uuid) RETURNS boolean LANGUAGE sql VOLATILE AS $$
 SELECT EXISTS(SELECT FROM catalog_asset WHERE "assetId"=asset_id OR "publicDisplayAssetId"=asset_id)
 OR EXISTS(SELECT FROM collection_item_media WHERE "assetId"=asset_id OR "publicDisplayAssetId"=asset_id)
 OR EXISTS(SELECT FROM app_asset WHERE "assetId"=asset_id OR "publicDisplayAssetId"=asset_id)
 OR EXISTS(SELECT FROM asset_dependency WHERE "sourceAssetId"=asset_id)
 OR EXISTS(SELECT FROM packaging_template WHERE "baseModelAssetId"=asset_id)
 OR EXISTS(SELECT FROM packaging_texture_binding WHERE "assetId"=asset_id)
 OR EXISTS(SELECT FROM physical_media_template WHERE "baseModelAssetId"=asset_id)
 OR EXISTS(SELECT FROM physical_media_texture_binding WHERE "assetId"=asset_id)
$$;
COMMIT;
