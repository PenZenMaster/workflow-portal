CREATE TABLE `prompt_generation_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`collection_id` integer NOT NULL,
	`requested_count` integer NOT NULL,
	`adapter_slug` text NOT NULL,
	`model_variant` text,
	`methodology_version` text NOT NULL,
	`context_snapshot` text DEFAULT '{}' NOT NULL,
	`raw_output` text NOT NULL,
	`valid_count` integer DEFAULT 0 NOT NULL,
	`invalid_count` integer DEFAULT 0 NOT NULL,
	`warnings` text DEFAULT '[]' NOT NULL,
	`invalid_items` text DEFAULT '[]' NOT NULL,
	`created_by_user_id` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `prompts` ADD `generation_run_id` integer;