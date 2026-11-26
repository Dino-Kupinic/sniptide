CREATE TABLE "moderation_scan" (
	"paste_id" uuid PRIMARY KEY,
	"content_version" bigint NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"policy_version" text,
	"result" jsonb,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "moderation_scan_due_idx" ON "moderation_scan" ("next_attempt_at") WHERE "status" = 'queued';--> statement-breakpoint
ALTER TABLE "moderation_scan" ADD CONSTRAINT "moderation_scan_paste_id_paste_id_fkey" FOREIGN KEY ("paste_id") REFERENCES "paste"("id") ON DELETE CASCADE;