CREATE TABLE `factory_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` text NOT NULL,
	`client_id` integer NOT NULL,
	`contract_version` text NOT NULL,
	`job_type` text NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`input` text DEFAULT '{}' NOT NULL,
	`dry_run` integer DEFAULT 0 NOT NULL,
	`approval_required` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `factory_jobs_job_id_unique` ON `factory_jobs` (`job_id`);