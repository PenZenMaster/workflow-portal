CREATE TABLE `prompt_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`collection_id` integer NOT NULL,
	`batch_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`triggered_by` text DEFAULT 'manual' NOT NULL,
	`triggered_by_user_id` integer,
	`total_prompts` integer DEFAULT 0 NOT NULL,
	`completed_prompts` integer DEFAULT 0 NOT NULL,
	`failed_prompts` integer DEFAULT 0 NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `responses_raw` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`prompt_id` integer NOT NULL,
	`platform_id` integer NOT NULL,
	`query_text` text NOT NULL,
	`locale` text,
	`geo` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`response_text` text,
	`response_summary_block` text,
	`model_variant` text,
	`latency_ms` integer,
	`raw_payload` text,
	`error_message` text,
	`captured_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `run_schedules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`collection_id` integer NOT NULL,
	`platform_ids` text DEFAULT '[]' NOT NULL,
	`cadence` text DEFAULT 'weekly' NOT NULL,
	`day_of_week` integer,
	`day_of_month` integer,
	`hour_utc` integer DEFAULT 0 NOT NULL,
	`last_fired_at` integer,
	`next_fire_at` integer NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
