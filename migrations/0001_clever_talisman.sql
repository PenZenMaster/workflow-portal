ALTER TABLE `users` ADD `email` text;--> statement-breakpoint
ALTER TABLE `users` ADD `reset_token_hash` text;--> statement-breakpoint
ALTER TABLE `users` ADD `reset_token_expiry` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);