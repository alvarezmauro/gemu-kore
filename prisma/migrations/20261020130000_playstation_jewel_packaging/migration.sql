BEGIN;
ALTER TABLE packaging_template DROP CONSTRAINT packaging_template_bounds;
ALTER TABLE packaging_template ADD CONSTRAINT packaging_template_bounds CHECK (
  length(btrim(name)) BETWEEN 1 AND 200 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 100
  AND "revisionNumber" > 0 AND revision > 0 AND (
    ("familyKey" IN ('nes-cardboard','snes-cardboard') AND "geometryType" = 'PROCEDURAL_BOX' AND "baseModelAssetId" IS NULL)
    OR ("familyKey" IN ('genesis-clamshell','playstation-jewel') AND "geometryType" = 'GLB' AND (status = 'DRAFT' OR "baseModelAssetId" IS NOT NULL))
  )
  AND (dimensions->>'schemaVersion' = '1' AND jsonb_typeof(dimensions->'widthMm') = 'number' AND jsonb_typeof(dimensions->'heightMm') = 'number' AND jsonb_typeof(dimensions->'depthMm') = 'number'
    AND (dimensions->>'widthMm')::numeric BETWEEN 0.1 AND 2000 AND (dimensions->>'heightMm')::numeric BETWEEN 0.1 AND 2000 AND (dimensions->>'depthMm')::numeric BETWEEN 0.1 AND 2000) IS TRUE
  AND jsonb_typeof("materialSettings") = 'object' AND jsonb_typeof("cameraSettings") = 'object' AND jsonb_typeof(metadata) = 'object'
  AND octet_length(concat(dimensions::text,"materialSettings"::text,"cameraSettings"::text,metadata::text)) <= 65536
);
ALTER TABLE packaging_texture_slot DROP CONSTRAINT packaging_slot_face;
ALTER TABLE packaging_texture_slot ADD CONSTRAINT packaging_slot_face CHECK (
  (jsonb_typeof(target) = 'object' AND target->>'schemaVersion' = '1' AND target->>'kind' = 'PROCEDURAL_FACE'
  AND target->>'face' IN ('0','1','2','3','4','5') AND name = (ARRAY['EDGE_POS_X','SPINE','TOP','BOTTOM','FRONT','BACK'])[(target->>'face')::int + 1]
  AND required = ((target->>'face')::int IN (1,4,5)) AND "materialName" = 'box:' || name) IS TRUE OR (target->>'kind' = 'GLB_PRIMITIVE' AND target->>'schemaVersion' = '1' AND target->>'sceneIndex' = '0' AND target->>'uvChannel' = '0' AND name IN ('FRONT','BACK','SPINE','OPPOSITE_SPINE') AND required = (name <> 'OPPOSITE_SPINE') AND length("materialName") BETWEEN 1 AND 200 AND target->>'materialName' = "materialName" AND length(target->>'nodeName') BETWEEN 1 AND 200 AND target->>'nodeIndex' ~ '^[0-9]{1,4}$' AND (target->>'nodeIndex')::int <= 4095 AND target->>'meshIndex' ~ '^[0-9]{1,4}$' AND (target->>'meshIndex')::int <= 4095 AND target->>'primitiveIndex' ~ '^[0-9]{1,4}$' AND (target->>'primitiveIndex')::int <= 4095 AND target->>'materialIndex' ~ '^[0-9]{1,4}$' AND (target->>'materialIndex')::int <= 4095 AND jsonb_typeof(target->'artWidthMm') = 'number' AND (target->>'artWidthMm')::numeric BETWEEN 0.1 AND 2000 AND jsonb_typeof(target->'artHeightMm') = 'number' AND (target->>'artHeightMm')::numeric BETWEEN 0.1 AND 2000) IS TRUE
);
CREATE OR REPLACE FUNCTION protect_packaging_template() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'DRAFT' THEN RAISE EXCEPTION 'Create a draft before readiness' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'READY' THEN RAISE EXCEPTION 'Archive ready template revisions' USING ERRCODE = '23514'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'READY' AND (NEW.status <> 'READY' OR ROW(NEW.id,NEW.slug,NEW."familyKey",NEW."revisionNumber",NEW."geometryType",NEW."baseModelAssetId",NEW.dimensions,NEW."materialSettings",NEW."cameraSettings",NEW.metadata)
    IS DISTINCT FROM ROW(OLD.id,OLD.slug,OLD."familyKey",OLD."revisionNumber",OLD."geometryType",OLD."baseModelAssetId",OLD.dimensions,OLD."materialSettings",OLD."cameraSettings",OLD.metadata)) THEN
    RAISE EXCEPTION 'Ready template contracts are immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.status <> 'READY' AND NEW.status = 'READY' AND (SELECT count(*) FROM packaging_texture_slot WHERE "packagingTemplateId" = OLD.id) <> (CASE WHEN NEW."familyKey" = 'playstation-jewel' THEN 4 WHEN NEW."geometryType" = 'GLB' THEN 3 ELSE 6 END) THEN
    RAISE EXCEPTION 'Ready packaging requires its complete slot contract' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION match_packaging_slot_geometry() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE geometry text; family text;
BEGIN
 SELECT "geometryType", "familyKey" INTO geometry, family FROM packaging_template WHERE id=NEW."packagingTemplateId";
 IF (geometry='GLB' AND NEW.target->>'kind' <> 'GLB_PRIMITIVE') OR (family = 'genesis-clamshell' AND NEW.name = 'OPPOSITE_SPINE') OR (geometry='PROCEDURAL_BOX' AND NEW.target->>'kind' <> 'PROCEDURAL_FACE') THEN RAISE EXCEPTION 'Slot must match template geometry' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
COMMIT;
