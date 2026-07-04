CREATE TABLE `workflow_input_values` (
	`workflow_id` integer NOT NULL,
	`label` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`workflow_id`, `label`)
);
