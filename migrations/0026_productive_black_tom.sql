CREATE TABLE `measurement_health_overrides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`status` text NOT NULL,
	`reason` text NOT NULL,
	`overridden_by_user_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `measurement_health_overrides_run_id_unique` ON `measurement_health_overrides` (`run_id`);