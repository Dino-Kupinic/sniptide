ALTER TABLE "api_token" ADD COLUMN "previous_refresh_hash" text;--> statement-breakpoint
CREATE INDEX "api_token_previous_refresh_hash_idx" ON "api_token" ("previous_refresh_hash");
