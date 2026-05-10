CREATE TABLE `metric_snapshots_daily` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`date_iso` text NOT NULL,
	`scope_kind` text DEFAULT 'overall' NOT NULL,
	`scope_value` text,
	`citation_count` integer DEFAULT 0 NOT NULL,
	`mention_count` integer DEFAULT 0 NOT NULL,
	`all_brand_mentions` integer DEFAULT 0 NOT NULL,
	`visibility_score_sum` real DEFAULT 0 NOT NULL,
	`prompt_response_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `response_citations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`response_id` integer NOT NULL,
	`url` text NOT NULL,
	`root_domain` text NOT NULL,
	`owned_by_brand_id` integer,
	`position` integer NOT NULL,
	`is_trusted_third_party` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `response_mentions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`response_id` integer NOT NULL,
	`brand_id` integer NOT NULL,
	`matched_text` text NOT NULL,
	`match_type` text DEFAULT 'exact' NOT NULL,
	`section` text DEFAULT 'body' NOT NULL,
	`recommendation_rank` integer,
	`confidence` real DEFAULT 1 NOT NULL,
	`evidence_excerpt` text
);
