BEGIN;
-- Content safety and licensing are independent reviews. Revoking rights must
-- immediately make a display ineligible without erasing its content review.
ALTER TABLE asset DROP CONSTRAINT asset_review;
ALTER TABLE asset ADD CONSTRAINT asset_review CHECK (
  NOT "publicSafe" OR ("deliveryClass" = 'DISPLAY' AND "reviewedAt" IS NOT NULL)
);
COMMIT;
