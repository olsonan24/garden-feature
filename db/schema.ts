import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

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
