BEGIN;
ALTER TABLE packaging_template DROP CONSTRAINT packaging_template_bounds;
ALTER TABLE packaging_template ADD CONSTRAINT packaging_template_bounds CHECK (
  length(btrim(name)) BETWEEN 1 AND 200 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 100
  AND "revisionNumber" > 0 AND revision > 0 AND (
    ("familyKey" IN ('nes-cardboard','snes-cardboard') AND "geometryType" = 'PROCEDURAL_BOX' AND "baseModelAssetId" IS NULL)
    OR ("familyKey" IN ('genesis-clamshell','playstation-jewel','ps2-dvd') AND "geometryType" = 'GLB' AND (status = 'DRAFT' OR "baseModelAssetId" IS NOT NULL))
  )
  AND (dimensions->>'schemaVersion' = '1' AND jsonb_typeof(dimensions->'widthMm') = 'number' AND jsonb_typeof(dimensions->'heightMm') = 'number' AND jsonb_typeof(dimensions->'depthMm') = 'number'
    AND (dimensions->>'widthMm')::numeric BETWEEN 0.1 AND 2000 AND (dimensions->>'heightMm')::numeric BETWEEN 0.1 AND 2000 AND (dimensions->>'depthMm')::numeric BETWEEN 0.1 AND 2000) IS TRUE
  AND jsonb_typeof("materialSettings") = 'object' AND jsonb_typeof("cameraSettings") = 'object' AND jsonb_typeof(metadata) = 'object'
  AND octet_length(concat(dimensions::text,"materialSettings"::text,"cameraSettings"::text,metadata::text)) <= 65536
);
CREATE OR REPLACE FUNCTION match_packaging_slot_geometry() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE geometry text; family text;
BEGIN
 SELECT "geometryType", "familyKey" INTO geometry, family FROM packaging_template WHERE id=NEW."packagingTemplateId";
 IF (geometry='GLB' AND NEW.target->>'kind' <> 'GLB_PRIMITIVE') OR (family IN ('genesis-clamshell','ps2-dvd') AND NEW.name = 'OPPOSITE_SPINE') OR (geometry='PROCEDURAL_BOX' AND NEW.target->>'kind' <> 'PROCEDURAL_FACE') THEN RAISE EXCEPTION 'Slot must match template geometry' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
COMMIT;
