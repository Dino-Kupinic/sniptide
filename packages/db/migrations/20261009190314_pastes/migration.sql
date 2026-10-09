CREATE TABLE `paste` (
	`slug` text PRIMARY KEY,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`files` text NOT NULL,
	`visibility` text NOT NULL,
	`password` text,
	`burn_after_read` integer DEFAULT false NOT NULL,
	`allow_raw` integer DEFAULT true NOT NULL,
	`collection` text,
	`owner` text,
	`views` integer DEFAULT 0 NOT NULL,
	`unique_views` integer DEFAULT 0 NOT NULL,
	`views_by_day` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer,
	`deleted_at` integer,
	`revisions` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `paste_share` (
	`slug` text PRIMARY KEY,
	`access` text NOT NULL,
	`shared_at` integer NOT NULL,
	`seen` integer DEFAULT false NOT NULL,
	CONSTRAINT `fk_paste_share_slug_paste_slug_fk` FOREIGN KEY (`slug`) REFERENCES `paste`(`slug`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `paste_star` (
	`slug` text PRIMARY KEY,
	`starred_at` integer NOT NULL,
	CONSTRAINT `fk_paste_star_slug_paste_slug_fk` FOREIGN KEY (`slug`) REFERENCES `paste`(`slug`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `paste_deleted_at_idx` ON `paste` (`deleted_at`);