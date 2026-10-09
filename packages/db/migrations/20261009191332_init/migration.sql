CREATE TYPE "visibility" AS ENUM('public', 'unlisted', 'private');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"username" text,
	"display_username" text,
	"preferences" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paste" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"slug" text NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"visibility" "visibility" NOT NULL,
	"password_hash" text,
	"burn_after_read" boolean DEFAULT false NOT NULL,
	"allow_raw" boolean DEFAULT true NOT NULL,
	"collection" text,
	"views" integer DEFAULT 0 NOT NULL,
	"unique_views" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "paste_file" (
	"id" serial PRIMARY KEY,
	"paste_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"language" text NOT NULL,
	"content" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paste_revision" (
	"id" serial PRIMARY KEY,
	"paste_id" uuid NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paste_star" (
	"user_id" text,
	"paste_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paste_star_pkey" PRIMARY KEY("user_id","paste_id")
);
--> statement-breakpoint
CREATE TABLE "paste_view_day" (
	"paste_id" uuid,
	"day" integer,
	"views" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "paste_view_day_pkey" PRIMARY KEY("paste_id","day")
);
--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_username_unique" ON "user" ("username");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "paste_slug_unique" ON "paste" ("slug");--> statement-breakpoint
CREATE INDEX "paste_owner_idx" ON "paste" ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "paste_file_paste_idx" ON "paste_file" ("paste_id","position");--> statement-breakpoint
CREATE INDEX "paste_revision_paste_idx" ON "paste_revision" ("paste_id","created_at");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "paste" ADD CONSTRAINT "paste_owner_id_user_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "paste_file" ADD CONSTRAINT "paste_file_paste_id_paste_id_fkey" FOREIGN KEY ("paste_id") REFERENCES "paste"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "paste_revision" ADD CONSTRAINT "paste_revision_paste_id_paste_id_fkey" FOREIGN KEY ("paste_id") REFERENCES "paste"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "paste_star" ADD CONSTRAINT "paste_star_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "paste_star" ADD CONSTRAINT "paste_star_paste_id_paste_id_fkey" FOREIGN KEY ("paste_id") REFERENCES "paste"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "paste_view_day" ADD CONSTRAINT "paste_view_day_paste_id_paste_id_fkey" FOREIGN KEY ("paste_id") REFERENCES "paste"("id") ON DELETE CASCADE;