CREATE TABLE "folder" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" text NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "paste" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "folder_root_name_unique" ON "folder" ("owner_id",lower("name")) WHERE "parent_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "folder_child_name_unique" ON "folder" ("parent_id",lower("name")) WHERE "parent_id" is not null;--> statement-breakpoint
CREATE INDEX "folder_owner_idx" ON "folder" ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "paste_folder_idx" ON "paste" ("owner_id","folder_id","updated_at","id");--> statement-breakpoint
ALTER TABLE "folder" ADD CONSTRAINT "folder_owner_id_user_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "folder" ADD CONSTRAINT "folder_parent_id_folder_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "folder"("id");--> statement-breakpoint
ALTER TABLE "paste" ADD CONSTRAINT "paste_folder_id_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folder"("id");