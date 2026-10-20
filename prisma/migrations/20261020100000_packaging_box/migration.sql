-- CreateEnum
CREATE TYPE "PackagingTemplateStatus" AS ENUM ('DRAFT', 'READY');

-- AlterTable
ALTER TABLE "game_release_included_item" ADD COLUMN     "packagingTemplateId" UUID,
ADD COLUMN     "presentationApproved" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "packaging_template" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "familyKey" TEXT NOT NULL DEFAULT 'snes-cardboard',
    "revisionNumber" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" "PackagingTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "geometryType" TEXT NOT NULL DEFAULT 'PROCEDURAL_BOX',
    "dimensions" JSONB NOT NULL,
    "materialSettings" JSONB NOT NULL,
    "cameraSettings" JSONB NOT NULL,
    "metadata" JSONB NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "packaging_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packaging_texture_slot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "packagingTemplateId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL,
    "materialName" TEXT NOT NULL,
    "target" JSONB NOT NULL,

    CONSTRAINT "packaging_texture_slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packaging_texture_binding" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "includedItemId" UUID NOT NULL,
    "packagingTemplateId" UUID NOT NULL,
    "packagingTextureSlotId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "transform" JSONB NOT NULL,

    CONSTRAINT "packaging_texture_binding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "packaging_template_slug_key" ON "packaging_template"("slug");

-- CreateIndex
CREATE INDEX "packaging_template_createdById_idx" ON "packaging_template"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "packaging_template_familyKey_revisionNumber_key" ON "packaging_template"("familyKey", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "packaging_texture_slot_packagingTemplateId_name_key" ON "packaging_texture_slot"("packagingTemplateId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "packaging_slot_template_key" ON "packaging_texture_slot"("id", "packagingTemplateId");

-- CreateIndex
CREATE INDEX "packaging_texture_binding_assetId_idx" ON "packaging_texture_binding"("assetId");

-- CreateIndex
CREATE INDEX "packaging_texture_binding_packagingTextureSlotId_packagingT_idx" ON "packaging_texture_binding"("packagingTextureSlotId", "packagingTemplateId");

-- CreateIndex
CREATE INDEX "packaging_texture_binding_includedItemId_packagingTemplateI_idx" ON "packaging_texture_binding"("includedItemId", "packagingTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "packaging_texture_binding_includedItemId_packagingTextureSl_key" ON "packaging_texture_binding"("includedItemId", "packagingTextureSlotId");

-- CreateIndex
CREATE UNIQUE INDEX "component_packaging_template_key" ON "game_release_included_item"("id", "packagingTemplateId");

-- AddForeignKey
ALTER TABLE "game_release_included_item" ADD CONSTRAINT "game_release_included_item_packagingTemplateId_fkey" FOREIGN KEY ("packagingTemplateId") REFERENCES "packaging_template"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "packaging_template" ADD CONSTRAINT "packaging_template_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "packaging_texture_slot" ADD CONSTRAINT "packaging_texture_slot_packagingTemplateId_fkey" FOREIGN KEY ("packagingTemplateId") REFERENCES "packaging_template"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "packaging_texture_binding" ADD CONSTRAINT "packaging_texture_binding_includedItemId_packagingTemplate_fkey" FOREIGN KEY ("includedItemId", "packagingTemplateId") REFERENCES "game_release_included_item"("id", "packagingTemplateId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "packaging_texture_binding" ADD CONSTRAINT "packaging_texture_binding_packagingTextureSlotId_packaging_fkey" FOREIGN KEY ("packagingTextureSlotId", "packagingTemplateId") REFERENCES "packaging_texture_slot"("id", "packagingTemplateId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "packaging_texture_binding" ADD CONSTRAINT "packaging_texture_binding_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Only the first private procedural format. Presence/primary semantics and media
-- templates are deliberately not activated by this migration.
ALTER TABLE game_release_included_item ADD CONSTRAINT component_packaging_kind CHECK ("packagingTemplateId" IS NULL OR kind = 'PACKAGING');
ALTER TABLE game_release_included_item ADD CONSTRAINT component_private_presentation CHECK (NOT "presentationApproved");
ALTER TABLE packaging_template ADD CONSTRAINT packaging_template_bounds CHECK (
  length(btrim(name)) BETWEEN 1 AND 200 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 100
  AND "familyKey" = 'snes-cardboard' AND "revisionNumber" > 0 AND revision > 0 AND "geometryType" = 'PROCEDURAL_BOX'
  AND (dimensions->>'schemaVersion' = '1' AND jsonb_typeof(dimensions->'widthMm') = 'number' AND jsonb_typeof(dimensions->'heightMm') = 'number' AND jsonb_typeof(dimensions->'depthMm') = 'number'
    AND (dimensions->>'widthMm')::numeric BETWEEN 0.1 AND 2000 AND (dimensions->>'heightMm')::numeric BETWEEN 0.1 AND 2000 AND (dimensions->>'depthMm')::numeric BETWEEN 0.1 AND 2000) IS TRUE
  AND jsonb_typeof("materialSettings") = 'object' AND jsonb_typeof("cameraSettings") = 'object' AND jsonb_typeof(metadata) = 'object'
  AND octet_length(concat(dimensions::text,"materialSettings"::text,"cameraSettings"::text,metadata::text)) <= 65536
);
ALTER TABLE packaging_texture_slot ADD CONSTRAINT packaging_slot_face CHECK (
  (jsonb_typeof(target) = 'object' AND target->>'schemaVersion' = '1' AND target->>'kind' = 'PROCEDURAL_FACE'
  AND target->>'face' IN ('0','1','2','3','4','5') AND name = (ARRAY['EDGE_POS_X','SPINE','TOP','BOTTOM','FRONT','BACK'])[(target->>'face')::int + 1]
  AND required = ((target->>'face')::int IN (1,4,5)) AND "materialName" = 'box:' || name) IS TRUE
);
CREATE UNIQUE INDEX packaging_slot_unique_face ON packaging_texture_slot ("packagingTemplateId", (target->>'face'));
ALTER TABLE packaging_texture_binding ADD CONSTRAINT packaging_transform_bounds CHECK (
  (transform->>'schemaVersion' = '1' AND jsonb_typeof(transform->'crop') = 'object'
  AND jsonb_typeof(transform->'crop'->'x') = 'number' AND jsonb_typeof(transform->'crop'->'y') = 'number'
  AND jsonb_typeof(transform->'crop'->'width') = 'number' AND jsonb_typeof(transform->'crop'->'height') = 'number'
  AND (transform->'crop'->>'x')::numeric >= 0 AND (transform->'crop'->>'y')::numeric >= 0
  AND (transform->'crop'->>'width')::numeric > 0 AND (transform->'crop'->>'height')::numeric > 0
  AND (transform->'crop'->>'x')::numeric + (transform->'crop'->>'width')::numeric <= 1
  AND (transform->'crop'->>'y')::numeric + (transform->'crop'->>'height')::numeric <= 1
  AND transform->>'quarterTurns' IN ('0','1','2','3')) IS TRUE
);
CREATE FUNCTION protect_packaging_template() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'DRAFT' THEN RAISE EXCEPTION 'Create a draft before readiness' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'READY' THEN RAISE EXCEPTION 'Archive ready template revisions' USING ERRCODE = '23514'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'READY' AND (NEW.status <> 'READY' OR ROW(NEW.id,NEW.slug,NEW."familyKey",NEW."revisionNumber",NEW."geometryType",NEW.dimensions,NEW."materialSettings",NEW."cameraSettings",NEW.metadata)
    IS DISTINCT FROM ROW(OLD.id,OLD.slug,OLD."familyKey",OLD."revisionNumber",OLD."geometryType",OLD.dimensions,OLD."materialSettings",OLD."cameraSettings",OLD.metadata)) THEN
    RAISE EXCEPTION 'Ready template contracts are immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.status <> 'READY' AND NEW.status = 'READY' AND (SELECT count(*) FROM packaging_texture_slot WHERE "packagingTemplateId" = OLD.id) <> 6 THEN
    RAISE EXCEPTION 'Ready boxes require six verified slots' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER packaging_template_guard BEFORE INSERT OR UPDATE OR DELETE ON packaging_template FOR EACH ROW EXECUTE FUNCTION protect_packaging_template();
CREATE FUNCTION protect_packaging_slot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent uuid;
BEGIN
  parent := CASE WHEN TG_OP = 'INSERT' THEN NEW."packagingTemplateId" ELSE OLD."packagingTemplateId" END;
  IF EXISTS (SELECT 1 FROM packaging_template WHERE id = parent AND status = 'READY')
    OR (TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM packaging_template WHERE id = NEW."packagingTemplateId" AND status = 'READY')) THEN
    RAISE EXCEPTION 'Ready slots are immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER packaging_slot_guard BEFORE INSERT OR UPDATE OR DELETE ON packaging_texture_slot FOR EACH ROW EXECUTE FUNCTION protect_packaging_slot();
CREATE FUNCTION validate_packaging_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM asset WHERE id = NEW."assetId" AND state = 'READY' AND scope = 'CATALOG' AND kind = 'IMAGE' AND "deliveryClass" = 'DISPLAY') THEN
    RAISE EXCEPTION 'Packaging requires ready catalog display artwork' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER packaging_binding_guard BEFORE INSERT OR UPDATE ON packaging_texture_binding FOR EACH ROW EXECUTE FUNCTION validate_packaging_binding();


CREATE INDEX "game_release_included_item_packagingTemplateId_idx" ON game_release_included_item ("packagingTemplateId");
