CREATE TABLE `periods` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`kind` text DEFAULT 'weekly' NOT NULL,
	`label` text NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `report_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`import_id` text NOT NULL,
	`account_id` text NOT NULL,
	`period_id` text NOT NULL,
	`report_type` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
