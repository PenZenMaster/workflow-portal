CREATE TABLE `response_recommendations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`response_id` integer NOT NULL,
	`brand_id` integer NOT NULL,
	`status` text NOT NULL,
	`rank` integer,
	`confidence` real DEFAULT 0 NOT NULL,
	`evidence_excerpt` text,
	`classifier_version` text NOT NULL,
	`human_status` text,
	`human_user_id` integer,
	`human_at` integer
);
