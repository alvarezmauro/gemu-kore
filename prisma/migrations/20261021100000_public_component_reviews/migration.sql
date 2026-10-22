ALTER TABLE game_release_included_item DROP CONSTRAINT component_private_presentation;
ALTER TABLE game_release_included_item ADD COLUMN "presentationReviewedAt" timestamptz(3), ADD COLUMN "presentationReviewedById" uuid REFERENCES "user"(id) ON DELETE SET NULL ON UPDATE RESTRICT, ADD COLUMN "presentationTemplateRevision" integer;
UPDATE game_release_included_item SET "presentationApproved"=false;
CREATE INDEX component_reviewer ON game_release_included_item("presentationReviewedById");
ALTER TABLE game_release_included_item ADD CONSTRAINT component_review CHECK (NOT "presentationApproved" OR ("presentationReviewedAt" IS NOT NULL AND "presentationTemplateRevision" IS NOT NULL AND "presentationTemplateRevision">0));
CREATE FUNCTION reset_component_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['presentationApproved','presentationReviewedAt','presentationReviewedById','presentationTemplateRevision']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['presentationApproved','presentationReviewedAt','presentationReviewedById','presentationTemplateRevision']) THEN
  NEW."presentationApproved":=false;
 END IF;
 IF NOT NEW."presentationApproved" THEN NEW."presentationReviewedAt":=NULL; NEW."presentationReviewedById":=NULL; NEW."presentationTemplateRevision":=NULL; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER component_review_reset BEFORE INSERT OR UPDATE ON game_release_included_item FOR EACH ROW EXECUTE FUNCTION reset_component_review();
CREATE FUNCTION invalidate_component_binding_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE component uuid;
BEGIN
 component:=CASE WHEN TG_OP='DELETE' THEN OLD."includedItemId" ELSE NEW."includedItemId" END;
 IF TG_OP<>'UPDATE' OR to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
  UPDATE game_release_included_item SET "presentationApproved"=false WHERE id=component;
  IF TG_OP='UPDATE' AND OLD."includedItemId"<>component THEN UPDATE game_release_included_item SET "presentationApproved"=false WHERE id=OLD."includedItemId"; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER packaging_review_reset AFTER INSERT OR UPDATE OR DELETE ON packaging_texture_binding FOR EACH ROW EXECUTE FUNCTION invalidate_component_binding_review();
CREATE TRIGGER media_review_reset AFTER INSERT OR UPDATE OR DELETE ON physical_media_texture_binding FOR EACH ROW EXECUTE FUNCTION invalidate_component_binding_review();
CREATE FUNCTION invalidate_template_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
  IF TG_TABLE_NAME='packaging_template' THEN UPDATE game_release_included_item SET "presentationApproved"=false WHERE "packagingTemplateId"=NEW.id;
  ELSE UPDATE game_release_included_item SET "presentationApproved"=false WHERE "physicalMediaTemplateId"=NEW.id; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER packaging_public_review_reset AFTER UPDATE ON packaging_template FOR EACH ROW EXECUTE FUNCTION invalidate_template_review();
CREATE TRIGGER media_public_review_reset AFTER UPDATE ON physical_media_template FOR EACH ROW EXECUTE FUNCTION invalidate_template_review();

CREATE OR REPLACE FUNCTION validate_packaging_model() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."baseModelAssetId" IS NOT NULL AND NOT EXISTS(SELECT FROM asset WHERE id=NEW."baseModelAssetId" AND state='READY' AND scope='CATALOG' AND kind='MODEL_3D' AND "deliveryClass" IN ('ORIGINAL','DISPLAY') AND "mimeType"='model/gltf-binary' AND "sizeBytes" BETWEEN 1 AND 8388608) THEN RAISE EXCEPTION 'Packaging requires ready catalog geometry' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION validate_physical_media_model() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."baseModelAssetId" IS NOT NULL AND NOT EXISTS(SELECT FROM asset WHERE id=NEW."baseModelAssetId" AND state='READY' AND scope='CATALOG' AND kind='MODEL_3D' AND "deliveryClass" IN ('ORIGINAL','DISPLAY') AND "mimeType"='model/gltf-binary' AND "sizeBytes" BETWEEN 1 AND 8388608) THEN RAISE EXCEPTION 'PhysicalMedia requires ready catalog geometry' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
