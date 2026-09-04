CREATE TABLE `growth_plan_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`input_hash` text NOT NULL,
	`markdown` text NOT NULL,
	`priority_actions` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `workflows` ADD `growth_plan_enabled` integer DEFAULT 0 NOT NULL;