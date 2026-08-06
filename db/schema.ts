import { sql } from "drizzle-orm";
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
