CREATE TABLE "abuse_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"deduplication_key" text NOT NULL UNIQUE,
	"target" text NOT NULL,
	"category" text NOT NULL,
	"explanation" text NOT NULL,
	"contact" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"outcome" text,
	"decision_command_id" uuid
);
--> statement-breakpoint
CREATE TABLE "abuse_review_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"report_id" uuid,
	"actor" text NOT NULL,
	"operation" text NOT NULL,
	"outcome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "abuse_report_queue_idx" ON "abuse_report" ("resolved_at","created_at");