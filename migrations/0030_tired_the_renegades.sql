CREATE TABLE `rankrocket_question_options` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rankrocket_question_options_label_unique` ON `rankrocket_question_options` (`label`);