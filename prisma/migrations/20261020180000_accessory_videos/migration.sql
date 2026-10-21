-- Reuse the structured game video contract; all new values start private/empty.
ALTER TABLE "accessory"
  ADD COLUMN "trailerProvider" "TrailerProvider",
  ADD COLUMN "trailerId" TEXT,
  ADD COLUMN "trailerUrl" TEXT,
  ADD COLUMN "trailerPublicApproved" BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT "accessory_trailer_group_check" CHECK (
    ("trailerProvider" IS NULL AND "trailerId" IS NULL AND "trailerUrl" IS NULL AND NOT "trailerPublicApproved") OR
    ("trailerProvider" IS NOT NULL AND (
      ("trailerProvider" = 'YOUTUBE' AND "trailerId" IS NOT NULL AND "trailerId" ~ '^[A-Za-z0-9_-]{11}$' AND "trailerUrl" IS NULL) OR
      ("trailerProvider" = 'DIRECT_URL' AND "trailerId" IS NULL AND "trailerUrl" IS NOT NULL AND "trailerUrl" ~ '^https://' AND length("trailerUrl") <= 2048)
    ))
  );
ALTER TABLE "accessory_variant"
  ADD COLUMN "trailerProvider" "TrailerProvider",
  ADD COLUMN "trailerId" TEXT,
  ADD COLUMN "trailerUrl" TEXT,
  ADD COLUMN "trailerPublicApproved" BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT "accessory_variant_trailer_group_check" CHECK (
    ("trailerProvider" IS NULL AND "trailerId" IS NULL AND "trailerUrl" IS NULL AND NOT "trailerPublicApproved") OR
    ("trailerProvider" IS NOT NULL AND (
      ("trailerProvider" = 'YOUTUBE' AND "trailerId" IS NOT NULL AND "trailerId" ~ '^[A-Za-z0-9_-]{11}$' AND "trailerUrl" IS NULL) OR
      ("trailerProvider" = 'DIRECT_URL' AND "trailerId" IS NULL AND "trailerUrl" IS NOT NULL AND "trailerUrl" ~ '^https://' AND length("trailerUrl") <= 2048)
    ))
  );
