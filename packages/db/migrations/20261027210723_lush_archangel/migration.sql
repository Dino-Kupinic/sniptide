CREATE TABLE "paste_visit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"paste_id" uuid NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"day" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX "paste_visit_pending_idx" ON "paste_visit" ("accepted_at","id");--> statement-breakpoint
CREATE INDEX "paste_visit_paste_idx" ON "paste_visit" ("paste_id");--> statement-breakpoint
ALTER TABLE "paste_visit" ADD CONSTRAINT "paste_visit_paste_id_paste_id_fkey" FOREIGN KEY ("paste_id") REFERENCES "paste"("id") ON DELETE CASCADE;