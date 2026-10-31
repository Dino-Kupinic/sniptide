CREATE TABLE "signup_source" (
	"user_id" text PRIMARY KEY,
	"source" text NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "signup_source" ADD CONSTRAINT "signup_source_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;