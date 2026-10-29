CREATE TABLE "oauth_client" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"redirect_uris" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_code" (
	"hash" text PRIMARY KEY,
	"client_id" text NOT NULL,
	"user_id" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"scopes" text[] NOT NULL,
	"resource" text,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_token" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "api_token" ADD COLUMN "refresh_hash" text;--> statement-breakpoint
ALTER TABLE "api_token" ADD COLUMN "refresh_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "oauth_client_created_idx" ON "oauth_client" ("created_at");--> statement-breakpoint
CREATE INDEX "oauth_code_expiry_idx" ON "oauth_code" ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "api_token_refresh_hash_unique" ON "api_token" ("refresh_hash");--> statement-breakpoint
ALTER TABLE "oauth_code" ADD CONSTRAINT "oauth_code_client_id_oauth_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_client"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_code" ADD CONSTRAINT "oauth_code_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "api_token" ADD CONSTRAINT "api_token_client_id_oauth_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_client"("id") ON DELETE CASCADE;