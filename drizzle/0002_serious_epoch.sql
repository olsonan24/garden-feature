CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`period_id` text NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
