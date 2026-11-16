CREATE TABLE "account_activity_day" (
	"owner_id" text,
	"day" integer,
	"surface" text,
	"creates" bigint DEFAULT 0 NOT NULL,
	"edits" bigint DEFAULT 0 NOT NULL,
	"reads" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "account_activity_day_pkey" PRIMARY KEY("owner_id","day","surface")
);
--> statement-breakpoint
CREATE TABLE "instance_activity" (
	"id" integer PRIMARY KEY,
	"observed_since_day" integer DEFAULT floor(extract(epoch from now()) / 86400) NOT NULL,
	"activation_day" integer,
	"tracking" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX "account_activity_day_day_idx" ON "account_activity_day" ("day");--> statement-breakpoint
ALTER TABLE "account_activity_day" ADD CONSTRAINT "account_activity_day_owner_id_user_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
-- Existing pastes establish activation, but not historical account activity.
INSERT INTO instance_activity (id, activation_day)
SELECT 1, floor(extract(epoch from min(created_at)) / 86400)::int FROM paste;
