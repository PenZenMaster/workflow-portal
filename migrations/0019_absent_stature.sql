CREATE TABLE `source_domains` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`root_domain` text NOT NULL,
	`source_class` text DEFAULT 'unknown_or_low_trust' NOT NULL,
	`rationale` text,
	`classified_by` text DEFAULT 'seed' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_domains_root_domain_unique` ON `source_domains` (`root_domain`);--> statement-breakpoint
ALTER TABLE `response_citations` ADD `source_class` text DEFAULT 'unknown_or_low_trust' NOT NULL;