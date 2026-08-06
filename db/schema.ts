import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("healthy"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const skus = sqliteTable("skus", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  payload: text("payload").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const imports = sqliteTable("imports", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  reportType: text("report_type").notNull(),
  filename: text("filename").notNull(),
  period: text("period").notNull(),
  receivedAt: text("received_at").notNull(),
  status: text("status").notNull(),
  objectKey: text("object_key"),
});

export const actions = sqliteTable("actions", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  payload: text("payload").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const reviews = sqliteTable("reviews", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  periodId: text("period_id").notNull(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const reportSummaries = sqliteTable("report_summaries", {
  id: text("id").primaryKey(),
  importId: text("import_id").notNull(),
  accountId: text("account_id").notNull(),
  periodId: text("period_id").notNull(),
  reportType: text("report_type").notNull(),
  payload: text("payload").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const periods = sqliteTable("periods", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  kind: text("kind").notNull().default("weekly"),
  label: text("label").notNull(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const accountWorkflows = sqliteTable("account_workflows", {
  accountId: text("account_id").primaryKey(),
  stage: text("stage").notNull(),
  healthStatus: text("health_status").notNull(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const psmTasks = sqliteTable("psm_tasks", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  status: text("status").notNull(),
  dueDate: text("due_date").notNull(),
  payload: text("payload").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("psm_tasks_account_due_idx").on(table.accountId, table.dueDate)]);

export const partnerRequests = sqliteTable("partner_requests", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  status: text("status").notNull(),
  dueDate: text("due_date").notNull(),
  payload: text("payload").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("partner_requests_account_due_idx").on(table.accountId, table.dueDate)]);

export const psmBlockers = sqliteTable("psm_blockers", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  status: text("status").notNull(),
  dateOpened: text("date_opened").notNull(),
  payload: text("payload").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("psm_blockers_account_opened_idx").on(table.accountId, table.dateOpened)]);

export const weeklyReviewsV2 = sqliteTable("weekly_reviews_v2", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  periodId: text("period_id").notNull(),
  status: text("status").notNull(),
  weekEnd: text("week_end").notNull(),
  payload: text("payload").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("weekly_reviews_account_week_idx").on(table.accountId, table.weekEnd)]);

export const accountEvents = sqliteTable("account_events", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  eventType: text("event_type").notNull(),
  occurredAt: text("occurred_at").notNull(),
  payload: text("payload").notNull(),
}, (table) => [index("account_events_account_time_idx").on(table.accountId, table.occurredAt)]);

export const jarvisUsers = sqliteTable("jarvis_users", {
  id: text("id").primaryKey(), name: text("name").notNull(), email: text("email"), role: text("role").notNull(), payload: text("payload").notNull(), updatedAt: text("updated_at").notNull(),
});

export const userPreferences = sqliteTable("user_preferences", {
  userId: text("user_id").primaryKey(), payload: text("payload").notNull(), updatedAt: text("updated_at").notNull(),
});

export const userCommandHistory = sqliteTable("user_command_history", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), accountId: text("account_id"), command: text("command").notNull(), intent: text("intent").notNull(), response: text("response").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [index("command_history_user_time_idx").on(table.userId, table.createdAt)]);

export const savedViews = sqliteTable("saved_views", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), name: text("name").notNull(), payload: text("payload").notNull(), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
});

export const acknowledgedAlerts = sqliteTable("acknowledged_alerts", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), accountId: text("account_id").notNull(), alertKey: text("alert_key").notNull(), acknowledgedAt: text("acknowledged_at").notNull(),
});

export const rawImports = sqliteTable("raw_imports", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull(), reportType: text("report_type").notNull(), originalFilename: text("original_filename").notNull(), originalStoragePath: text("original_storage_path").notNull(), uploadedBy: text("uploaded_by").notNull(), uploadedAt: text("uploaded_at").notNull(), fileChecksum: text("file_checksum").notNull(), fileSize: text("file_size").notNull(), reportStart: text("report_start"), reportEnd: text("report_end"), parserVersion: text("parser_version").notNull(), importStatus: text("import_status").notNull(), importErrors: text("import_errors").notNull(), payload: text("payload").notNull(),
});

export const rawReportFiles = sqliteTable("raw_report_files", {
  rawImportId: text("raw_import_id").primaryKey(), encoding: text("encoding").notNull(), data: text("data").notNull(), createdAt: text("created_at").notNull(),
});

export const normalizedReportRows = sqliteTable("normalized_report_rows", {
  id: text("id").primaryKey(), rawImportId: text("raw_import_id").notNull(), accountId: text("account_id").notNull(), periodId: text("period_id").notNull(), reportType: text("report_type").notNull(), sourceRow: text("source_row").notNull(), parserVersion: text("parser_version").notNull(), importedAt: text("imported_at").notNull(), payload: text("payload").notNull(),
}, (table) => [index("normalized_rows_account_period_idx").on(table.accountId, table.periodId)]);

export const accountStateBlocks = sqliteTable("account_state_blocks", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull(), revision: integer("revision").notNull(), createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull(), payload: text("payload").notNull(),
}, (table) => [index("state_blocks_account_revision_idx").on(table.accountId, table.revision)]);

export const auditRuns = sqliteTable("audit_runs", {
  id: text("id").primaryKey(), accountId: text("account_id"), auditType: text("audit_type").notNull(), auditVersion: text("audit_version").notNull(), playbookVersion: text("playbook_version").notNull(), startedAt: text("started_at").notNull(), completedAt: text("completed_at").notNull(), createdBy: text("created_by").notNull(), status: text("status").notNull(), payload: text("payload").notNull(),
}, (table) => [index("audit_runs_account_time_idx").on(table.accountId, table.completedAt)]);

export const auditFindings = sqliteTable("audit_findings", {
  id: text("id").primaryKey(), auditRunId: text("audit_run_id").notNull(), accountId: text("account_id").notNull(), skuId: text("sku_id"), severity: text("severity").notNull(), category: text("category").notNull(), payload: text("payload").notNull(),
}, (table) => [index("audit_findings_run_idx").on(table.auditRunId)]);

export const auditEvidence = sqliteTable("audit_evidence", {
  id: text("id").primaryKey(), findingId: text("finding_id").notNull(), rawImportId: text("raw_import_id"), sourceReport: text("source_report").notNull(), sourceRow: text("source_row"), payload: text("payload").notNull(),
}, (table) => [index("audit_evidence_finding_idx").on(table.findingId)]);

export const auditRecommendations = sqliteTable("audit_recommendations", {
  id: text("id").primaryKey(), findingId: text("finding_id").notNull(), accountId: text("account_id").notNull(), skuId: text("sku_id"), status: text("status").notNull(), requiredRole: text("required_role").notNull(), executionCapability: text("execution_capability").notNull(), payload: text("payload").notNull(), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [index("audit_recommendations_account_status_idx").on(table.accountId, table.status)]);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(), recommendationId: text("recommendation_id").notNull(), accountId: text("account_id").notNull(), userId: text("user_id").notNull(), userRole: text("user_role").notNull(), eventType: text("event_type").notNull(), occurredAt: text("occurred_at").notNull(), payload: text("payload").notNull(),
}, (table) => [index("audit_events_recommendation_time_idx").on(table.recommendationId, table.occurredAt)]);

export const integrationConnections = sqliteTable("integration_connections", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), provider: text("provider").notNull(), status: text("status").notNull(), scopes: text("scopes").notNull(), payload: text("payload").notNull(), updatedAt: text("updated_at").notNull(),
});
