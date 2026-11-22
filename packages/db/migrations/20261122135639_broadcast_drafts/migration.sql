CREATE TABLE "broadcast" (
	"id" text PRIMARY KEY,
	"subject" text DEFAULT '' NOT NULL,
	"preview" text DEFAULT '' NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"image_url" text,
	"body" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"provider_id" text,
	"recipients" integer
);
--> statement-breakpoint
ALTER TABLE "broadcast" ADD CONSTRAINT "broadcast_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;