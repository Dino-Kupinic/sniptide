CREATE TYPE "moderation_state" AS ENUM('pending', 'allowed', 'quarantined', 'removed');--> statement-breakpoint
CREATE TABLE "moderation_event" (
	"command_id" uuid PRIMARY KEY,
	"fingerprint" text NOT NULL,
	"paste_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"from_state" "moderation_state" NOT NULL,
	"to_state" "moderation_state" NOT NULL,
	"reason_code" text NOT NULL,
	"case_reference" uuid NOT NULL,
	"content_version" bigint NOT NULL,
	"moderation_version" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "paste" ADD COLUMN "moderation_state" "moderation_state" DEFAULT 'allowed'::"moderation_state" NOT NULL;--> statement-breakpoint
ALTER TABLE "paste" ADD COLUMN "moderation_version" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "moderation_event_paste_idx" ON "moderation_event" ("paste_id","created_at");