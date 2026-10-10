CREATE TABLE "collection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"marker" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "collection_owner_slug_unique" ON "collection" ("owner_id","slug");--> statement-breakpoint
CREATE INDEX "collection_owner_idx" ON "collection" ("owner_id","created_at");--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collection_owner_id_user_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- Until now a paste's collection pointed at a hard-coded list. Nobody has real collections yet,
-- so clear those labels rather than leave them dangling.
UPDATE "paste" SET "collection" = NULL WHERE "collection" IS NOT NULL;
