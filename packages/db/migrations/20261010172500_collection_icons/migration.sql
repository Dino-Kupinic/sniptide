ALTER TABLE "collection" ADD COLUMN "icon" text DEFAULT 'square' NOT NULL;--> statement-breakpoint
ALTER TABLE "collection" ADD COLUMN "hue" text DEFAULT 'blue' NOT NULL;--> statement-breakpoint
-- Carry the old four markers over: filled ones become the solid square, outlined ones the
-- outline, and "foreground" becomes the ink hue.
UPDATE "collection" SET
	"icon" = CASE WHEN "marker" LIKE 'outline-%' THEN 'outline' ELSE 'square' END,
	"hue" = CASE WHEN "marker" LIKE '%-foreground' THEN 'ink' ELSE 'blue' END;--> statement-breakpoint
ALTER TABLE "collection" DROP COLUMN "marker";
