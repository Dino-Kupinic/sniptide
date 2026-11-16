CREATE TABLE "integration_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"account_id" text NOT NULL,
	"account_name" text NOT NULL,
	"scope" text DEFAULT '' NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "integration_connection_user_provider_unique" ON "integration_connection" ("user_id","provider");--> statement-breakpoint
ALTER TABLE "integration_connection" ADD CONSTRAINT "integration_connection_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;