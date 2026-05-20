CREATE TABLE `brand_aliases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`brand_id` integer NOT NULL,
	`alias_text` text NOT NULL,
	`match_type` text DEFAULT 'exact' NOT NULL,
	`language` text
);
--> statement-breakpoint
CREATE TABLE `brands` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`canonical_name` text NOT NULL,
	`kind` text DEFAULT 'client' NOT NULL,
	`primary_domain` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `client_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`role_override` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`primary_domain` text NOT NULL,
	`geographies` text DEFAULT '[]' NOT NULL,
	`exclusions` text DEFAULT '[]' NOT NULL,
	`owner_user_id` integer,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `competitors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`brand_id` integer NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL
);
