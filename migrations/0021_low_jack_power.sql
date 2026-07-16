CREATE TABLE `measurement_run_manifests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`client_id` integer NOT NULL,
	`collection_id` integer NOT NULL,
	`purpose` text DEFAULT 'ad_hoc' NOT NULL,
	`methodology_version` text NOT NULL,
	`panel_version` text,
	`scoring_version` text NOT NULL,
	`parser_version` text NOT NULL,
	`classifier_version` text NOT NULL,
	`platform_ids` text DEFAULT '[]' NOT NULL,
	`prompt_count` integer NOT NULL,
	`replicate_count` integer DEFAULT 1 NOT NULL,
	`expected_response_count` integer NOT NULL,
	`config_snapshot` text NOT NULL,
	`config_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `measurement_run_manifests_run_id_unique` ON `measurement_run_manifests` (`run_id`);