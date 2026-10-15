CREATE TYPE "notification_kind" AS ENUM('shared', 'burned', 'expiring', 'views');--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"paste_id" uuid NOT NULL,
	"actor_id" text,
	"count" integer,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "notification_user_idx" ON "notification" ("user_id","created_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "notification_unread_idx" ON "notification" ("user_id") WHERE "read_at" is null;--> statement-breakpoint
CREATE INDEX "notification_paste_idx" ON "notification" ("paste_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_dedupe_unique" ON "notification" ("user_id","dedupe_key");--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_paste_id_paste_id_fkey" FOREIGN KEY ("paste_id") REFERENCES "paste"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_actor_id_user_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE SET NULL;