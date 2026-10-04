-- DropIndex
DROP INDEX "owned_game_collectionItemId_gameReleaseId_key";
-- Task 4.2: preserve applied migrations and validate the tightened contracts.
-- No catalog/history values are rewritten to make inconsistent data pass.
BEGIN;

LOCK TABLE "collection_item", "owned_console", "owned_game", "owned_accessory"
  IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "collection_item" i
    WHERE NOT CASE i."type"
      WHEN 'CONSOLE' THEN EXISTS (SELECT 1 FROM "owned_console" c WHERE c."collectionItemId" = i."id")
      WHEN 'GAME' THEN EXISTS (SELECT 1 FROM "owned_game" g WHERE g."collectionItemId" = i."id")
      WHEN 'ACCESSORY' THEN EXISTS (SELECT 1 FROM "owned_accessory" a WHERE a."collectionItemId" = i."id")
      ELSE false END
  ) THEN
    RAISE EXCEPTION 'Repair orphan collection aggregates before applying the schema review migration.'
      USING ERRCODE = '23514', CONSTRAINT = 'collection_item_required_subtype';
  END IF;
END;
$$;

CREATE FUNCTION "keep_collection_id"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id" THEN
    RAISE EXCEPTION 'Collection item ID is immutable.'
      USING ERRCODE = '23514', CONSTRAINT = 'collection_item_id_immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "collection_item_id_immutable" BEFORE UPDATE OF "id" ON "collection_item"
FOR EACH ROW EXECUTE FUNCTION "keep_collection_id"();

-- Prisma String[] means a required flat list of nonnull strings.
-- Empty lists are valid; unknown descriptive entries are not SQL NULL lists.
ALTER TABLE "company" ALTER COLUMN "aliases" SET NOT NULL;
ALTER TABLE "console_platform" ALTER COLUMN "aliases" SET NOT NULL;
ALTER TABLE "game" ALTER COLUMN "aliases" SET NOT NULL;
ALTER TABLE "game_release" ALTER COLUMN "languages" SET NOT NULL;

ALTER TABLE "company" ADD CONSTRAINT "company_aliases_string_list" CHECK (
  CASE WHEN cardinality("aliases") = 0 THEN true
    WHEN array_ndims("aliases") = 1 THEN array_position("aliases", NULL) IS NULL
    ELSE false END);
ALTER TABLE "console_platform" ADD CONSTRAINT "console_platform_aliases_string_list" CHECK (
  CASE WHEN cardinality("aliases") = 0 THEN true
    WHEN array_ndims("aliases") = 1 THEN array_position("aliases", NULL) IS NULL
    ELSE false END);
ALTER TABLE "game" ADD CONSTRAINT "game_aliases_string_list" CHECK (
  CASE WHEN cardinality("aliases") = 0 THEN true
    WHEN array_ndims("aliases") = 1 THEN array_position("aliases", NULL) IS NULL
    ELSE false END);
ALTER TABLE "game_release" ADD CONSTRAINT "game_release_languages_string_list" CHECK (
  CASE WHEN cardinality("languages") = 0 THEN true
    WHEN array_ndims("languages") = 1 THEN array_position("languages", NULL) IS NULL
    ELSE false END);

-- The copy PK already makes this tuple unique. Reintroduce the candidate
-- key with the future OwnedGameComponent FK, when it has an actual consumer.
-- CreateIndex
CREATE INDEX "metadata_change_companyId_createdAt_id_idx" ON "metadata_change"("companyId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "metadata_change_regionId_createdAt_id_idx" ON "metadata_change"("regionId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "metadata_change_platformId_createdAt_id_idx" ON "metadata_change"("platformId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "metadata_change_consoleModelId_createdAt_id_idx" ON "metadata_change"("consoleModelId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "metadata_change_gameId_createdAt_id_idx" ON "metadata_change"("gameId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "metadata_change_gameReleaseId_createdAt_id_idx" ON "metadata_change"("gameReleaseId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "metadata_change_accessoryId_createdAt_id_idx" ON "metadata_change"("accessoryId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "metadata_change_accessoryVariantId_createdAt_id_idx" ON "metadata_change"("accessoryVariantId", "createdAt", "id");

COMMIT;
