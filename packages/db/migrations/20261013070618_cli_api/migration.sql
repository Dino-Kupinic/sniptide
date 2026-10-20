CREATE TABLE "env_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "env_variable" (
	"group_id" uuid,
	"position" integer NOT NULL,
	"name" text,
	"value" text NOT NULL,
	CONSTRAINT "env_variable_pkey" PRIMARY KEY("group_id","name")
);
--> statement-breakpoint
CREATE TABLE "api_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"hash" text NOT NULL,
	"scopes" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "paste" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "paste" ADD COLUMN "source" jsonb;--> statement-breakpoint
ALTER TABLE "paste_file" ADD COLUMN "start_line" integer;--> statement-breakpoint
ALTER TABLE "paste_file" ADD COLUMN "end_line" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "env_group_owner_slug_unique" ON "env_group" ("owner_id","slug");--> statement-breakpoint
CREATE INDEX "env_group_owner_idx" ON "env_group" ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "paste_tags_idx" ON "paste" USING gin ("tags");--> statement-breakpoint
CREATE UNIQUE INDEX "api_token_hash_unique" ON "api_token" ("hash");--> statement-breakpoint
CREATE INDEX "api_token_owner_idx" ON "api_token" ("owner_id","created_at");--> statement-breakpoint
ALTER TABLE "env_group" ADD CONSTRAINT "env_group_owner_id_user_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "env_variable" ADD CONSTRAINT "env_variable_group_id_env_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "env_group"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "api_token" ADD CONSTRAINT "api_token_owner_id_user_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE;