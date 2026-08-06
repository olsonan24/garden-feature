CREATE TABLE `account_state_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`revision` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `state_blocks_account_revision_idx` ON `account_state_blocks` (`account_id`,`revision`);--> statement-breakpoint
CREATE TABLE `acknowledged_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`alert_key` text NOT NULL,
	`acknowledged_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`recommendation_id` text NOT NULL,
	`account_id` text NOT NULL,
	`user_id` text NOT NULL,
	`user_role` text NOT NULL,
	`event_type` text NOT NULL,
	`occurred_at` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_events_recommendation_time_idx` ON `audit_events` (`recommendation_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `audit_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`finding_id` text NOT NULL,
	`raw_import_id` text,
	`source_report` text NOT NULL,
	`source_row` text,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_evidence_finding_idx` ON `audit_evidence` (`finding_id`);--> statement-breakpoint
CREATE TABLE `audit_findings` (
	`id` text PRIMARY KEY NOT NULL,
	`audit_run_id` text NOT NULL,
	`account_id` text NOT NULL,
	`sku_id` text,
	`severity` text NOT NULL,
	`category` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_findings_run_idx` ON `audit_findings` (`audit_run_id`);--> statement-breakpoint
CREATE TABLE `audit_recommendations` (
	`id` text PRIMARY KEY NOT NULL,
	`finding_id` text NOT NULL,
	`account_id` text NOT NULL,
	`sku_id` text,
	`status` text NOT NULL,
	`required_role` text NOT NULL,
	`execution_capability` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_recommendations_account_status_idx` ON `audit_recommendations` (`account_id`,`status`);--> statement-breakpoint
CREATE TABLE `audit_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text,
	`audit_type` text NOT NULL,
	`audit_version` text NOT NULL,
	`playbook_version` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text NOT NULL,
	`created_by` text NOT NULL,
	`status` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_runs_account_time_idx` ON `audit_runs` (`account_id`,`completed_at`);--> statement-breakpoint
CREATE TABLE `integration_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`scopes` text NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `jarvis_users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`role` text NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `normalized_report_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`raw_import_id` text NOT NULL,
	`account_id` text NOT NULL,
	`period_id` text NOT NULL,
	`report_type` text NOT NULL,
	`source_row` text NOT NULL,
	`parser_version` text NOT NULL,
	`imported_at` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `normalized_rows_account_period_idx` ON `normalized_report_rows` (`account_id`,`period_id`);--> statement-breakpoint
CREATE TABLE `raw_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`report_type` text NOT NULL,
	`original_filename` text NOT NULL,
	`original_storage_path` text NOT NULL,
	`uploaded_by` text NOT NULL,
	`uploaded_at` text NOT NULL,
	`file_checksum` text NOT NULL,
	`file_size` text NOT NULL,
	`report_start` text,
	`report_end` text,
	`parser_version` text NOT NULL,
	`import_status` text NOT NULL,
	`import_errors` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `raw_report_files` (
	`raw_import_id` text PRIMARY KEY NOT NULL,
	`encoding` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `saved_views` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_command_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text,
	`command` text NOT NULL,
	`intent` text NOT NULL,
	`response` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `command_history_user_time_idx` ON `user_command_history` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
