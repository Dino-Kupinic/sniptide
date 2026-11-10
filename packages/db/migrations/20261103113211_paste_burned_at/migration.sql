ALTER TABLE "paste" ADD COLUMN "burned_at" timestamp with time zone;--> statement-breakpoint
-- A burned paste is trashed and has its one counted read. Unread burn-after-read pastes never
-- count a view, so this marks the ones read before the column existed.
UPDATE "paste" SET "burned_at" = "deleted_at" WHERE "burn_after_read" AND "deleted_at" IS NOT NULL AND "views" > 0;
