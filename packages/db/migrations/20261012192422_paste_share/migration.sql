CREATE TYPE "share_access" AS ENUM('view', 'edit');--> statement-breakpoint
CREATE TABLE "paste_share" (
	"paste_id" uuid,
	"user_id" text,
	"access" "share_access" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone,
	CONSTRAINT "paste_share_pkey" PRIMARY KEY("paste_id","user_id")
);
--> statement-breakpoint
CREATE INDEX "paste_share_user_idx" ON "paste_share" ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "paste_share" ADD CONSTRAINT "paste_share_paste_id_paste_id_fkey" FOREIGN KEY ("paste_id") REFERENCES "paste"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "paste_share" ADD CONSTRAINT "paste_share_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;