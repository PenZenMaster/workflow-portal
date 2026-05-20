CREATE TABLE `annotations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scope_kind` text DEFAULT 'response' NOT NULL,
	`scope_id` integer NOT NULL,
	`author_user_id` integer NOT NULL,
	`body` text NOT NULL,
	`visibility` text DEFAULT 'internal' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `report_exports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`kind` text DEFAULT 'csv-executive' NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`file_path` text,
	`last_error` text,
	`requested_by_user_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `response_sentiment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`response_id` integer NOT NULL,
	`brand_id` integer NOT NULL,
	`label` text DEFAULT 'neutral' NOT NULL,
	`score` real DEFAULT 0 NOT NULL,
	`confidence` real DEFAULT 0 NOT NULL,
	`evidence_excerpt` text,
	`facet_labels` text DEFAULT '[]' NOT NULL,
	`reviewed_by_user_id` integer,
	`reviewed_at` integer,
	`override_label` text,
	`created_at` integer NOT NULL
);
