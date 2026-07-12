CREATE TABLE `prompt_methodologies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`version` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`quotas` text DEFAULT '{}' NOT NULL,
	`validation_rules` text DEFAULT '{}' NOT NULL,
	`effective_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prompt_methodologies_version_unique` ON `prompt_methodologies` (`version`);--> statement-breakpoint
ALTER TABLE `clients` ADD `core_services` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `metric_snapshots_daily` ADD `methodology_version` text DEFAULT '1.0' NOT NULL;--> statement-breakpoint
ALTER TABLE `prompts` ADD `intent_type` text;--> statement-breakpoint
ALTER TABLE `prompts` ADD `brand_in_prompt` integer;--> statement-breakpoint
ALTER TABLE `prompts` ADD `service` text;--> statement-breakpoint
ALTER TABLE `prompts` ADD `prompt_family` text;--> statement-breakpoint
ALTER TABLE `prompts` ADD `commercial_value` text;--> statement-breakpoint
ALTER TABLE `prompts` ADD `measurement_purpose` text;--> statement-breakpoint
UPDATE `prompts` SET `intent_type` = CASE `category`
	WHEN 'informational' THEN 'provider_recommendation'
	WHEN 'comparative' THEN 'comparison'
	WHEN 'commercial' THEN 'provider_recommendation'
	WHEN 'local' THEN 'geographic_discovery'
	WHEN 'problem_aware' THEN 'problem_solution'
	WHEN 'alternative' THEN 'alternative'
	ELSE NULL
END WHERE `intent_type` IS NULL;