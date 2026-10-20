-- Add the next closed cardboard format without rewriting any template, slot,
-- binding, measurement or immutable READY contract.
BEGIN;
ALTER TABLE packaging_template DROP CONSTRAINT packaging_template_bounds;
ALTER TABLE packaging_template ADD CONSTRAINT packaging_template_bounds CHECK (
  length(btrim(name)) BETWEEN 1 AND 200 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 100
  AND "familyKey" IN ('nes-cardboard', 'snes-cardboard') AND "revisionNumber" > 0 AND revision > 0 AND "geometryType" = 'PROCEDURAL_BOX'
  AND (dimensions->>'schemaVersion' = '1' AND jsonb_typeof(dimensions->'widthMm') = 'number' AND jsonb_typeof(dimensions->'heightMm') = 'number' AND jsonb_typeof(dimensions->'depthMm') = 'number'
    AND (dimensions->>'widthMm')::numeric BETWEEN 0.1 AND 2000 AND (dimensions->>'heightMm')::numeric BETWEEN 0.1 AND 2000 AND (dimensions->>'depthMm')::numeric BETWEEN 0.1 AND 2000) IS TRUE
  AND jsonb_typeof("materialSettings") = 'object' AND jsonb_typeof("cameraSettings") = 'object' AND jsonb_typeof(metadata) = 'object'
  AND octet_length(concat(dimensions::text,"materialSettings"::text,"cameraSettings"::text,metadata::text)) <= 65536
);
COMMIT;
