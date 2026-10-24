-- Traverse unique assets, then calculate longest paths over the bounded graph.
-- A shared source must not be expanded once per incoming path. No persistent
-- cache: every invocation evaluates current rights in its transaction snapshot.
CREATE OR REPLACE FUNCTION asset_public_eligible(asset_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE
  discovered uuid[] := ARRAY[asset_id];
  frontier uuid[] := ARRAY[asset_id];
  following uuid[];
  current_id uuid;
  parent_id uuid;
  parents uuid[];
  node asset%ROWTYPE;
  edge record;
  graph jsonb := '{}'::jsonb;
  heights jsonb := '{}'::jsonb;
  height integer;
  pass integer;
  progress boolean;
  ready boolean;
BEGIN
  IF asset_id IS NULL OR NOT EXISTS (
    SELECT FROM asset WHERE id=asset_id AND state='READY'
      AND "deliveryClass"='DISPLAY' AND "publicSafe"
      AND "reviewedAt" IS NOT NULL AND "rightsStatus"='APPROVED'
  ) THEN RETURN false; END IF;

  WHILE cardinality(frontier)>0 LOOP
    following := ARRAY[]::uuid[];
    FOREACH current_id IN ARRAY frontier LOOP
      SELECT * INTO node FROM asset WHERE id=current_id;
      IF NOT FOUND OR node.state<>'READY' OR node."rightsStatus"<>'APPROVED'
        THEN RETURN false; END IF;
      parents := ARRAY[]::uuid[];
      FOR edge IN SELECT "sourceAssetId", purpose FROM asset_dependency
        WHERE "derivedAssetId"=current_id ORDER BY "sourceAssetId" LIMIT 129
      LOOP
        IF cardinality(parents)>=128 OR edge.purpose NOT IN ('RESIZE','SANITIZE','RENDER_INPUT')
          THEN RETURN false; END IF;
        parents := array_append(parents,edge."sourceAssetId");
        IF NOT (edge."sourceAssetId"=ANY(discovered)) THEN
          IF cardinality(discovered)>=128 THEN RETURN false; END IF;
          discovered := array_append(discovered,edge."sourceAssetId");
          following := array_append(following,edge."sourceAssetId");
        END IF;
      END LOOP;
      graph := graph || jsonb_build_object(current_id::text,to_jsonb(parents));
    END LOOP;
    frontier := following;
  END LOOP;

  -- Resolve leaves first. Every asset receives one height; repeated paths reuse
  -- it. An unresolved graph after 17 passes is cyclic or exceeds depth 16.
  FOR pass IN 0..16 LOOP
    progress := false;
    FOREACH current_id IN ARRAY discovered LOOP
      IF heights ? current_id::text THEN CONTINUE; END IF;
      height := 0;
      ready := true;
      FOR parent_id IN SELECT value::uuid FROM jsonb_array_elements_text(graph->current_id::text)
      LOOP
        IF NOT (heights ? parent_id::text) THEN ready := false; EXIT; END IF;
        height := greatest(height,(heights->>parent_id::text)::integer+1);
      END LOOP;
      IF ready THEN
        IF height>16 THEN RETURN false; END IF;
        heights := heights || jsonb_build_object(current_id::text,height);
        progress := true;
      END IF;
    END LOOP;
    IF heights ? asset_id::text THEN RETURN true; END IF;
    IF NOT progress THEN RETURN false; END IF;
  END LOOP;
  RETURN false;
END
$$;
