CREATE TABLE "highlight_cache" (
	"key" text PRIMARY KEY,
	"runs" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "highlight_cache_created_idx" ON "highlight_cache" ("created_at");