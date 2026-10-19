-- CreateEnum
CREATE TYPE "EnrichmentFetchStatus" AS ENUM ('PENDING', 'RUNNING', 'NEEDS_SELECTION', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "EnrichmentReviewStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CONFLICT');

-- AlterTable
ALTER TABLE "metadata_change" ADD COLUMN     "enrichmentSuggestionId" UUID;

-- CreateTable
CREATE TABLE "enrichment_run" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requestKey" UUID NOT NULL,
    "requestedById" UUID,
    "gameId" UUID,
    "gameReleaseId" UUID,
    "accessoryId" UUID,
    "accessoryVariantId" UUID,
    "targetBaseRevision" INTEGER NOT NULL,
    "targetSnapshot" JSONB NOT NULL,
    "query" JSONB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "pipelineVersion" TEXT NOT NULL DEFAULT '1',
    "snapshotSchemaVersion" INTEGER NOT NULL DEFAULT 1,
    "fetchStatus" "EnrichmentFetchStatus" NOT NULL DEFAULT 'PENDING',
    "runVersion" INTEGER NOT NULL DEFAULT 1,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "attempts" JSONB NOT NULL DEFAULT '[]',
    "operationToken" UUID,
    "leaseUntil" TIMESTAMPTZ(3),
    "selectedCandidate" JSONB,
    "candidates" JSONB,
    "result" JSONB,
    "reviewToken" TEXT,
    "preparedChoices" JSONB,
    "receipt" JSONB,
    "failureCode" TEXT,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrichment_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrichment_suggestion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "runId" UUID NOT NULL,
    "fieldPath" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "proposed" JSONB NOT NULL,
    "sourceSnapshot" JSONB NOT NULL,
    "origin" "MetadataOrigin" NOT NULL,
    "confidence" DOUBLE PRECISION,
    "confidenceMethod" TEXT,
    "reviewStatus" "EnrichmentReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrichment_suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "enrichment_run_requestKey_key" ON "enrichment_run"("requestKey");

-- CreateIndex
CREATE INDEX "enrichment_run_gameId_startedAt_idx" ON "enrichment_run"("gameId", "startedAt");

-- CreateIndex
CREATE INDEX "enrichment_run_gameReleaseId_startedAt_idx" ON "enrichment_run"("gameReleaseId", "startedAt");

-- CreateIndex
CREATE INDEX "enrichment_run_accessoryId_startedAt_idx" ON "enrichment_run"("accessoryId", "startedAt");

-- CreateIndex
CREATE INDEX "enrichment_run_accessoryVariantId_startedAt_idx" ON "enrichment_run"("accessoryVariantId", "startedAt");

-- CreateIndex
CREATE INDEX "enrichment_run_requestedById_startedAt_idx" ON "enrichment_run"("requestedById", "startedAt");

-- CreateIndex
CREATE INDEX "enrichment_run_fetchStatus_startedAt_idx" ON "enrichment_run"("fetchStatus", "startedAt");

-- CreateIndex
CREATE INDEX "enrichment_suggestion_runId_reviewStatus_idx" ON "enrichment_suggestion"("runId", "reviewStatus");

-- CreateIndex
CREATE INDEX "enrichment_suggestion_reviewedById_idx" ON "enrichment_suggestion"("reviewedById");

-- CreateIndex
CREATE UNIQUE INDEX "enrichment_suggestion_runId_fieldPath_key" ON "enrichment_suggestion"("runId", "fieldPath");

-- CreateIndex
CREATE UNIQUE INDEX "metadata_change_enrichmentSuggestionId_key" ON "metadata_change"("enrichmentSuggestionId");

-- AddForeignKey
ALTER TABLE "metadata_change" ADD CONSTRAINT "metadata_change_enrichmentSuggestionId_fkey" FOREIGN KEY ("enrichmentSuggestionId") REFERENCES "enrichment_suggestion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "enrichment_run" ADD CONSTRAINT "enrichment_run_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrichment_run" ADD CONSTRAINT "enrichment_run_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "enrichment_run" ADD CONSTRAINT "enrichment_run_gameReleaseId_fkey" FOREIGN KEY ("gameReleaseId") REFERENCES "game_release"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "enrichment_run" ADD CONSTRAINT "enrichment_run_accessoryId_fkey" FOREIGN KEY ("accessoryId") REFERENCES "accessory"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "enrichment_run" ADD CONSTRAINT "enrichment_run_accessoryVariantId_fkey" FOREIGN KEY ("accessoryVariantId") REFERENCES "accessory_variant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "enrichment_suggestion" ADD CONSTRAINT "enrichment_suggestion_runId_fkey" FOREIGN KEY ("runId") REFERENCES "enrichment_run"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "enrichment_suggestion" ADD CONSTRAINT "enrichment_suggestion_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE enrichment_run ADD CONSTRAINT enrichment_run_one_target
  CHECK (num_nonnulls("gameId", "gameReleaseId", "accessoryId", "accessoryVariantId") = 1);
ALTER TABLE enrichment_run ADD CONSTRAINT enrichment_run_bounds CHECK (
  "targetBaseRevision" > 0 AND "runVersion" > 0 AND "attemptCount" BETWEEN 0 AND 3
  AND "snapshotSchemaVersion" = 1 AND "pipelineVersion" = '1'
  AND "fingerprint" ~ '^[a-f0-9]{64}$' AND "provider" = 'IGDB'
  AND jsonb_typeof(query) = 'object' AND jsonb_typeof("targetSnapshot") = 'object'
  AND jsonb_typeof(attempts) = 'array' AND jsonb_array_length(attempts) <= 3
  AND octet_length(concat(query::text, "targetSnapshot"::text, candidates::text, result::text, attempts::text)) <= 1048576
);
ALTER TABLE enrichment_run ADD CONSTRAINT enrichment_run_lease CHECK (
  ("fetchStatus" = 'RUNNING' AND "operationToken" IS NOT NULL AND "leaseUntil" IS NOT NULL AND "completedAt" IS NULL)
  OR ("fetchStatus" <> 'RUNNING' AND "operationToken" IS NULL AND "leaseUntil" IS NULL)
);
ALTER TABLE enrichment_run ADD CONSTRAINT enrichment_run_terminal CHECK (
  ("fetchStatus" IN ('COMPLETED', 'FAILED')) = ("completedAt" IS NOT NULL)
);
ALTER TABLE enrichment_run ADD CONSTRAINT enrichment_run_review CHECK (
  ("reviewToken" IS NULL AND "preparedChoices" IS NULL)
  OR ("reviewToken" IS NOT NULL AND "reviewToken" ~ '^[a-f0-9]{64}$' AND "preparedChoices" IS NOT NULL AND "fetchStatus" = 'COMPLETED')
);
ALTER TABLE enrichment_suggestion ADD CONSTRAINT enrichment_suggestion_bounds CHECK (
  "origin" IN ('PROVIDER', 'AI_ASSISTED')
  AND "fieldPath" IN ('name', 'description', 'aliases', 'developers', 'references', 'trailer', 'playtime', 'descriptionOverride', 'credits', 'markets', 'firstReleaseYear')
  AND ("reviewStatus" = 'PENDING') = ("reviewedAt" IS NULL)
  AND (confidence IS NULL) = ("confidenceMethod" IS NULL)
  AND ((confidence IS NULL AND "confidenceMethod" IS NULL) OR (confidence BETWEEN 0 AND 1 AND length(btrim("confidenceMethod")) > 0))
  AND (jsonb_typeof("sourceSnapshot") = 'object' AND "sourceSnapshot"->'schemaVersion' = '1'::jsonb AND jsonb_typeof("sourceSnapshot"->'data') = 'object') IS TRUE
  AND octet_length(concat("before"::text, proposed::text, "sourceSnapshot"::text)) <= 1048576
);

CREATE FUNCTION protect_enrichment_run() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."requestKey", NEW."gameId", NEW."gameReleaseId", NEW."accessoryId", NEW."accessoryVariantId", NEW."targetBaseRevision", NEW."targetSnapshot", NEW.query, NEW.fingerprint, NEW.provider, NEW."pipelineVersion", NEW."snapshotSchemaVersion", NEW."startedAt")
    IS DISTINCT FROM ROW(OLD."requestKey", OLD."gameId", OLD."gameReleaseId", OLD."accessoryId", OLD."accessoryVariantId", OLD."targetBaseRevision", OLD."targetSnapshot", OLD.query, OLD.fingerprint, OLD.provider, OLD."pipelineVersion", OLD."snapshotSchemaVersion", OLD."startedAt")
    OR (NEW."requestedById" IS DISTINCT FROM OLD."requestedById" AND NEW."requestedById" IS NOT NULL)
    OR (OLD."selectedCandidate" IS NOT NULL AND NEW."selectedCandidate" IS DISTINCT FROM OLD."selectedCandidate")
    OR (OLD.candidates IS NOT NULL AND NEW.candidates IS DISTINCT FROM OLD.candidates)
    OR (OLD.result IS NOT NULL AND NEW.result IS DISTINCT FROM OLD.result)
    OR (OLD."reviewToken" IS NOT NULL AND ROW(NEW."reviewToken", NEW."preparedChoices") IS DISTINCT FROM ROW(OLD."reviewToken", OLD."preparedChoices"))
    OR (OLD.receipt IS NOT NULL AND NEW.receipt IS DISTINCT FROM OLD.receipt)
  THEN RAISE EXCEPTION 'Enrichment intent and finalized evidence are immutable' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enrichment_run_immutable BEFORE UPDATE ON enrichment_run FOR EACH ROW EXECUTE FUNCTION protect_enrichment_run();

CREATE FUNCTION protect_enrichment_suggestion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."runId", NEW."fieldPath", NEW."before", NEW.proposed, NEW."sourceSnapshot", NEW.origin, NEW.confidence, NEW."confidenceMethod", NEW."createdAt")
    IS DISTINCT FROM ROW(OLD."runId", OLD."fieldPath", OLD."before", OLD.proposed, OLD."sourceSnapshot", OLD.origin, OLD.confidence, OLD."confidenceMethod", OLD."createdAt")
    OR (OLD."reviewStatus" <> 'PENDING' AND ROW(NEW."reviewStatus", NEW."reviewedAt") IS DISTINCT FROM ROW(OLD."reviewStatus", OLD."reviewedAt"))
    OR (OLD."reviewStatus" <> 'PENDING' AND NEW."reviewedById" IS DISTINCT FROM OLD."reviewedById" AND NEW."reviewedById" IS NOT NULL)
  THEN RAISE EXCEPTION 'Published enrichment proposals and decisions are immutable' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enrichment_suggestion_immutable BEFORE UPDATE ON enrichment_suggestion FOR EACH ROW EXECUTE FUNCTION protect_enrichment_suggestion();
