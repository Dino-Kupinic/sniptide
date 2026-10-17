CREATE TYPE "notification_email_status" AS ENUM('disabled', 'pending', 'sent', 'skipped', 'failed');--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "in_app" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "email_status" "notification_email_status" DEFAULT 'disabled'::"notification_email_status" NOT NULL;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "email_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "email_next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "email_claim_token" uuid;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "email_sent_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "notification_email_due_idx" ON "notification" ("email_next_attempt_at","id") WHERE "email_status" = 'pending';