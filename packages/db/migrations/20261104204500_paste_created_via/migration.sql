CREATE TYPE "paste_created_via" AS ENUM('web', 'api', 'mcp', 'cli');--> statement-breakpoint
ALTER TABLE "paste" ADD COLUMN "created_via" "paste_created_via" DEFAULT 'web'::"paste_created_via" NOT NULL;--> statement-breakpoint
ALTER TABLE "paste" ADD COLUMN "created_by_agent" text;--> statement-breakpoint
CREATE INDEX "paste_created_via_idx" ON "paste" ("owner_id","created_at") WHERE "created_via" <> 'web';
