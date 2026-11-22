ALTER TABLE "broadcast" ADD COLUMN "kind" text DEFAULT 'update' NOT NULL;--> statement-breakpoint
ALTER TABLE "broadcast" ADD COLUMN "details" jsonb DEFAULT '{}' NOT NULL;