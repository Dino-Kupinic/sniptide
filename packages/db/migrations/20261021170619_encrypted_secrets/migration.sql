CREATE TABLE "env_share" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"group_id" uuid NOT NULL,
	"token_hash" text NOT NULL UNIQUE,
	"password_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "env_group" ADD COLUMN "project" text;--> statement-breakpoint
ALTER TABLE "env_group" ADD COLUMN "environment" text;--> statement-breakpoint
ALTER TABLE "env_group" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "env_share_group_idx" ON "env_share" ("group_id");--> statement-breakpoint
ALTER TABLE "env_share" ADD CONSTRAINT "env_share_group_id_env_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "env_group"("id") ON DELETE CASCADE;