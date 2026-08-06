CREATE TABLE `account_events` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`event_type` text NOT NULL,
	`occurred_at` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `account_events_account_time_idx` ON `account_events` (`account_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `account_workflows` (
	`account_id` text PRIMARY KEY NOT NULL,
	`stage` text NOT NULL,
	`health_status` text NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `partner_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`status` text NOT NULL,
	`due_date` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `partner_requests_account_due_idx` ON `partner_requests` (`account_id`,`due_date`);--> statement-breakpoint
CREATE TABLE `psm_blockers` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`status` text NOT NULL,
	`date_opened` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `psm_blockers_account_opened_idx` ON `psm_blockers` (`account_id`,`date_opened`);--> statement-breakpoint
CREATE TABLE `psm_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`status` text NOT NULL,
	`due_date` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `psm_tasks_account_due_idx` ON `psm_tasks` (`account_id`,`due_date`);--> statement-breakpoint
CREATE TABLE `weekly_reviews_v2` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`period_id` text NOT NULL,
	`status` text NOT NULL,
	`week_end` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `weekly_reviews_account_week_idx` ON `weekly_reviews_v2` (`account_id`,`week_end`);