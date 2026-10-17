-- Phase 11 basic expected contents only. Templates, primary-package semantics,
-- presentation approvals and actual owned presence remain Phase 14.
CREATE TYPE "ReleaseComponentKind" AS ENUM ('PACKAGING', 'MEDIA', 'MANUAL', 'EXTRA');
CREATE TABLE game_release_included_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "gameReleaseId" uuid NOT NULL REFERENCES game_release(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  name text NOT NULL CHECK (btrim(name) <> ''),
  kind "ReleaseComponentKind" NOT NULL,
  description text,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  "sortOrder" integer NOT NULL DEFAULT 0 CHECK ("sortOrder" >= 0)
);
CREATE INDEX game_release_included_item_release_order ON game_release_included_item ("gameReleaseId", "sortOrder", id);
ALTER TABLE catalog_asset ADD COLUMN "includedItemId" uuid REFERENCES game_release_included_item(id) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE catalog_asset DROP CONSTRAINT catalog_asset_one_target;
ALTER TABLE catalog_asset ADD CONSTRAINT catalog_asset_one_target CHECK (num_nonnulls("companyId", "consolePlatformId", "consoleModelId", "gameId", "gameReleaseId", "accessoryId", "accessoryVariantId", "includedItemId") = 1);
CREATE INDEX catalog_asset_included_item_role_order ON catalog_asset ("includedItemId", role, "sortOrder");
CREATE UNIQUE INDEX catalog_asset_primary_included_item ON catalog_asset ("includedItemId", role) WHERE "isPrimary" AND "includedItemId" IS NOT NULL;
