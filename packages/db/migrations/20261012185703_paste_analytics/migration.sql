CREATE TYPE "breakdown_dimension" AS ENUM('referrer', 'country', 'device');--> statement-breakpoint
CREATE TYPE "event_kind" AS ENUM('view', 'raw', 'copy');--> statement-breakpoint
CREATE TABLE "analytics_rollup" (
	"id" integer PRIMARY KEY,
	"finalized_day" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_salt" (
	"day" integer PRIMARY KEY,
	"salt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paste_breakdown_day" (
	"paste_id" uuid,
	"day" integer,
	"dimension" "breakdown_dimension",
	"key" text,
	"hits" integer NOT NULL,
	CONSTRAINT "paste_breakdown_day_pkey" PRIMARY KEY("paste_id","day","dimension","key")
);
--> statement-breakpoint
CREATE TABLE "paste_event" (
	"id" bigserial PRIMARY KEY,
	"paste_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" "event_kind" NOT NULL,
	"visitor" text NOT NULL,
	"referrer" text,
	"country" text,
	"device" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paste_stats_day" (
	"paste_id" uuid,
	"day" integer,
	"views" integer DEFAULT 0 NOT NULL,
	"uniques" integer DEFAULT 0 NOT NULL,
	"raw" integer DEFAULT 0 NOT NULL,
	"copies" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "paste_stats_day_pkey" PRIMARY KEY("paste_id","day")
);
--> statement-breakpoint
CREATE INDEX "paste_breakdown_day_retention_idx" ON "paste_breakdown_day" ("day","paste_id");--> statement-breakpoint
CREATE INDEX "paste_event_at_idx" ON "paste_event" ("at");--> statement-breakpoint
CREATE INDEX "paste_event_paste_idx" ON "paste_event" ("paste_id","at");--> statement-breakpoint
CREATE INDEX "paste_stats_day_retention_idx" ON "paste_stats_day" ("day","paste_id");--> statement-breakpoint
ALTER TABLE "paste_breakdown_day" ADD CONSTRAINT "paste_breakdown_day_paste_id_paste_id_fkey" FOREIGN KEY ("paste_id") REFERENCES "paste"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "paste_event" ADD CONSTRAINT "paste_event_paste_id_paste_id_fkey" FOREIGN KEY ("paste_id") REFERENCES "paste"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "paste_stats_day" ADD CONSTRAINT "paste_stats_day_paste_id_paste_id_fkey" FOREIGN KEY ("paste_id") REFERENCES "paste"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- Keep the views the charts already have, and start the rollup after them. Days from today on are
-- counted from events, which only exist from this migration on, so today's earlier views stay out.
INSERT INTO "paste_stats_day" ("paste_id", "day", "views") SELECT "paste_id", "day", "views" FROM "paste_view_day" WHERE "day" < floor(extract(epoch FROM now()) / 86400)::int;
--> statement-breakpoint
INSERT INTO "analytics_rollup" ("id", "finalized_day") VALUES (1, floor(extract(epoch FROM now()) / 86400)::int - 1);
