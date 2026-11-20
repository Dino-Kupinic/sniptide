CREATE TABLE "broadcast_subscription" (
	"user_id" text PRIMARY KEY,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "broadcast_subscription" ADD CONSTRAINT "broadcast_subscription_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;