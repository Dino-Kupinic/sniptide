ALTER TABLE "paste" ADD COLUMN "version" bigint;
--> statement-breakpoint
UPDATE "paste" SET "version" = floor(extract(epoch from "updated_at") * 1000);
--> statement-breakpoint
ALTER TABLE "paste" ALTER COLUMN "version" SET DEFAULT floor(extract(epoch from clock_timestamp()) * 1000);
--> statement-breakpoint
ALTER TABLE "paste" ALTER COLUMN "version" SET NOT NULL;
