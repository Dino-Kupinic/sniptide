CREATE TABLE `paste` (
	`id` text PRIMARY KEY,
	`slug` text NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`visibility` text NOT NULL,
	`password_hash` text,
	`burn_after_read` integer DEFAULT false NOT NULL,
	`allow_raw` integer DEFAULT true NOT NULL,
	`collection` text,
	`views` integer DEFAULT 0 NOT NULL,
	`unique_views` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer,
	`deleted_at` integer,
	CONSTRAINT `fk_paste_owner_id_user_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `paste_file` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`paste_id` text NOT NULL,
	`position` integer NOT NULL,
	`name` text NOT NULL,
	`language` text NOT NULL,
	`content` text NOT NULL,
	CONSTRAINT `fk_paste_file_paste_id_paste_id_fk` FOREIGN KEY (`paste_id`) REFERENCES `paste`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `paste_revision` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`paste_id` text NOT NULL,
	`message` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_paste_revision_paste_id_paste_id_fk` FOREIGN KEY (`paste_id`) REFERENCES `paste`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `paste_star` (
	`user_id` text NOT NULL,
	`paste_id` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `paste_star_pk` PRIMARY KEY(`user_id`, `paste_id`),
	CONSTRAINT `fk_paste_star_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_paste_star_paste_id_paste_id_fk` FOREIGN KEY (`paste_id`) REFERENCES `paste`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `paste_view_day` (
	`paste_id` text NOT NULL,
	`day` integer NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `paste_view_day_pk` PRIMARY KEY(`paste_id`, `day`),
	CONSTRAINT `fk_paste_view_day_paste_id_paste_id_fk` FOREIGN KEY (`paste_id`) REFERENCES `paste`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `paste_slug_unique` ON `paste` (`slug`);--> statement-breakpoint
CREATE INDEX `paste_owner_idx` ON `paste` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `paste_file_paste_idx` ON `paste_file` (`paste_id`,`position`);--> statement-breakpoint
CREATE INDEX `paste_revision_paste_idx` ON `paste_revision` (`paste_id`,`created_at`);