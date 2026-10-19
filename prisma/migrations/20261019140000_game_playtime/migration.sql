CREATE TYPE "PlaytimeSourceType" AS ENUM ('MANUAL', 'PROVIDER');

CREATE TABLE "game_playtime" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "gameId" UUID,
  "gameReleaseId" UUID,
  "mainMinutes" INTEGER,
  "mainExtrasMinutes" INTEGER,
  "completionistMinutes" INTEGER,
  "sourceType" "PlaytimeSourceType" NOT NULL,
  "sourceName" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "observedAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "game_playtime_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "game_playtime_one_target" CHECK (num_nonnulls("gameId", "gameReleaseId") = 1),
  CONSTRAINT "game_playtime_nonnegative_minutes" CHECK (
    ("mainMinutes" IS NULL OR "mainMinutes" >= 0) AND
    ("mainExtrasMinutes" IS NULL OR "mainExtrasMinutes" >= 0) AND
    ("completionistMinutes" IS NULL OR "completionistMinutes" >= 0)
  ),
  CONSTRAINT "game_playtime_source_name" CHECK (length(btrim("sourceName")) BETWEEN 1 AND 200),
  CONSTRAINT "game_playtime_source_url" CHECK ("sourceUrl" IS NULL OR (length("sourceUrl") <= 2048 AND "sourceUrl" ~ '^https?://')),
  CONSTRAINT "game_playtime_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game"("id") ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT "game_playtime_gameReleaseId_fkey" FOREIGN KEY ("gameReleaseId") REFERENCES "game_release"("id") ON DELETE CASCADE ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "game_playtime_gameId_key" ON "game_playtime"("gameId");
CREATE UNIQUE INDEX "game_playtime_gameReleaseId_key" ON "game_playtime"("gameReleaseId");
