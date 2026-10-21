BEGIN;
ALTER TABLE enrichment_run DROP CONSTRAINT enrichment_run_bounds;
ALTER TABLE enrichment_run ADD CONSTRAINT enrichment_run_bounds CHECK (
  "targetBaseRevision" > 0 AND "runVersion" > 0 AND "attemptCount" BETWEEN 0 AND 3
  AND "snapshotSchemaVersion" = 1 AND "pipelineVersion" = '1'
  AND "fingerprint" ~ '^[a-f0-9]{64}$' AND "provider" IN ('IGDB', 'WIKIDATA')
  AND jsonb_typeof(query) = 'object' AND jsonb_typeof("targetSnapshot") = 'object'
  AND jsonb_typeof(attempts) = 'array' AND jsonb_array_length(attempts) <= 3
  AND octet_length(concat(query::text, "targetSnapshot"::text, candidates::text, result::text, attempts::text)) <= 1048576
);

ALTER TABLE enrichment_suggestion DROP CONSTRAINT enrichment_suggestion_bounds;
ALTER TABLE enrichment_suggestion ADD CONSTRAINT enrichment_suggestion_bounds CHECK (
  "origin" IN ('PROVIDER', 'AI_ASSISTED')
  AND "fieldPath" IN ('name', 'description', 'aliases', 'developers', 'references', 'trailer', 'playtime', 'descriptionOverride', 'credits', 'markets', 'firstReleaseYear', 'releaseYear', 'producerId')
  AND ("reviewStatus" = 'PENDING') = ("reviewedAt" IS NULL)
  AND (confidence IS NULL) = ("confidenceMethod" IS NULL)
  AND ((confidence IS NULL AND "confidenceMethod" IS NULL) OR (confidence BETWEEN 0 AND 1 AND length(btrim("confidenceMethod")) > 0))
  AND (jsonb_typeof("sourceSnapshot") = 'object' AND "sourceSnapshot"->'schemaVersion' = '1'::jsonb AND jsonb_typeof("sourceSnapshot"->'data') = 'object') IS TRUE
  AND octet_length(concat("before"::text, proposed::text, "sourceSnapshot"::text)) <= 1048576
);
COMMIT;
