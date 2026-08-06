import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { getCloudflareRuntime, type D1Database } from "./cloudflare-runtime";

type Row = Record<string, unknown>;
type Statement = { sql: string; params?: unknown[] };

export type PersistentDatabase = {
  kind: "d1" | "postgres";
  run(sql: string, params?: unknown[]): Promise<void>;
  all<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  first<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T | null>;
  batch(statements: Statement[]): Promise<void>;
};

const schemaStatements = [
  "CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'healthy', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS skus (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS imports (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, report_type TEXT NOT NULL, filename TEXT NOT NULL, period TEXT NOT NULL, received_at TEXT NOT NULL, status TEXT NOT NULL, object_key TEXT)",
  "CREATE TABLE IF NOT EXISTS actions (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, period_id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS report_summaries (id TEXT PRIMARY KEY, import_id TEXT NOT NULL, account_id TEXT NOT NULL, period_id TEXT NOT NULL, report_type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS periods (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'weekly', label TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS account_workflows (account_id TEXT PRIMARY KEY, stage TEXT NOT NULL, health_status TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS psm_tasks (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, status TEXT NOT NULL, due_date TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS partner_requests (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, status TEXT NOT NULL, due_date TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS psm_blockers (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, status TEXT NOT NULL, date_opened TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS weekly_reviews_v2 (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, period_id TEXT NOT NULL, status TEXT NOT NULL, week_end TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS account_events (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, event_type TEXT NOT NULL, occurred_at TEXT NOT NULL, payload TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS jarvis_users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, role TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS user_preferences (user_id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS user_command_history (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT, command TEXT NOT NULL, intent TEXT NOT NULL, response TEXT NOT NULL, created_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS saved_views (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS acknowledged_alerts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL, alert_key TEXT NOT NULL, acknowledged_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS raw_imports (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, report_type TEXT NOT NULL, original_filename TEXT NOT NULL, original_storage_path TEXT NOT NULL, uploaded_by TEXT NOT NULL, uploaded_at TEXT NOT NULL, file_checksum TEXT NOT NULL, file_size TEXT NOT NULL, report_start TEXT, report_end TEXT, parser_version TEXT NOT NULL, import_status TEXT NOT NULL, import_errors TEXT NOT NULL, payload TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS raw_report_files (raw_import_id TEXT PRIMARY KEY, encoding TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS normalized_report_rows (id TEXT PRIMARY KEY, raw_import_id TEXT NOT NULL, account_id TEXT NOT NULL, period_id TEXT NOT NULL, report_type TEXT NOT NULL, source_row TEXT NOT NULL, parser_version TEXT NOT NULL, imported_at TEXT NOT NULL, payload TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS account_state_blocks (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, revision INTEGER NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS audit_runs (id TEXT PRIMARY KEY, account_id TEXT, audit_type TEXT NOT NULL, audit_version TEXT NOT NULL, playbook_version TEXT NOT NULL, started_at TEXT NOT NULL, completed_at TEXT NOT NULL, created_by TEXT NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS audit_findings (id TEXT PRIMARY KEY, audit_run_id TEXT NOT NULL, account_id TEXT NOT NULL, sku_id TEXT, severity TEXT NOT NULL, category TEXT NOT NULL, payload TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS audit_evidence (id TEXT PRIMARY KEY, finding_id TEXT NOT NULL, raw_import_id TEXT, source_report TEXT NOT NULL, source_row TEXT, payload TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS audit_recommendations (id TEXT PRIMARY KEY, finding_id TEXT NOT NULL, account_id TEXT NOT NULL, sku_id TEXT, status TEXT NOT NULL, required_role TEXT NOT NULL, execution_capability TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, recommendation_id TEXT NOT NULL, account_id TEXT NOT NULL, user_id TEXT NOT NULL, user_role TEXT NOT NULL, event_type TEXT NOT NULL, occurred_at TEXT NOT NULL, payload TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS integration_connections (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL, status TEXT NOT NULL, scopes TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS psm_tasks_account_due_idx ON psm_tasks (account_id, due_date)",
  "CREATE INDEX IF NOT EXISTS partner_requests_account_due_idx ON partner_requests (account_id, due_date)",
  "CREATE INDEX IF NOT EXISTS psm_blockers_account_opened_idx ON psm_blockers (account_id, date_opened)",
  "CREATE INDEX IF NOT EXISTS weekly_reviews_account_week_idx ON weekly_reviews_v2 (account_id, week_end)",
  "CREATE INDEX IF NOT EXISTS account_events_account_time_idx ON account_events (account_id, occurred_at)",
  "CREATE INDEX IF NOT EXISTS command_history_user_time_idx ON user_command_history (user_id, created_at)",
  "CREATE INDEX IF NOT EXISTS normalized_rows_account_period_idx ON normalized_report_rows (account_id, period_id)",
  "CREATE INDEX IF NOT EXISTS state_blocks_account_revision_idx ON account_state_blocks (account_id, revision)",
  "CREATE INDEX IF NOT EXISTS audit_runs_account_time_idx ON audit_runs (account_id, completed_at)",
  "CREATE INDEX IF NOT EXISTS audit_findings_run_idx ON audit_findings (audit_run_id)",
  "CREATE INDEX IF NOT EXISTS audit_evidence_finding_idx ON audit_evidence (finding_id)",
  "CREATE INDEX IF NOT EXISTS audit_recommendations_account_status_idx ON audit_recommendations (account_id, status)",
  "CREATE INDEX IF NOT EXISTS audit_events_recommendation_time_idx ON audit_events (recommendation_id, occurred_at)",
];

const postgresSchemaStatements = schemaStatements.map((statement) => statement.replace(
  /(created_at|updated_at) TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP/g,
  "$1 TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP",
));

let neonClient: NeonQueryFunction<false, false> | null = null;
let initializedKind: PersistentDatabase["kind"] | null = null;

function postgresSql(sql: string) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function d1Adapter(db: D1Database): PersistentDatabase {
  return {
    kind: "d1",
    async run(sql, params = []) { await db.prepare(sql).bind(...params).run(); },
    async all<T extends Row>(sql: string, params: unknown[] = []) { return (await db.prepare(sql).bind(...params).all<T>()).results; },
    async first<T extends Row>(sql: string, params: unknown[] = []) { return db.prepare(sql).bind(...params).first<T>(); },
    async batch(statements) { await db.batch(statements.map((item) => db.prepare(item.sql).bind(...(item.params || [])))); },
  };
}

function postgresAdapter(sql: NeonQueryFunction<false, false>): PersistentDatabase {
  return {
    kind: "postgres",
    async run(query, params = []) { await sql.query(postgresSql(query), params); },
    async all<T extends Row>(query: string, params: unknown[] = []) { return await sql.query(postgresSql(query), params) as T[]; },
    async first<T extends Row>(query: string, params: unknown[] = []) { const rows = await sql.query(postgresSql(query), params) as T[]; return (rows[0] || null) as T | null; },
    async batch(statements) {
      await sql.transaction((transaction) => statements.map((item) => transaction.query(postgresSql(item.sql), item.params || [])));
    },
  };
}

export async function getPersistentDatabase(): Promise<PersistentDatabase | null> {
  const runtime = await getCloudflareRuntime<{ DB?: D1Database }>();
  if (runtime?.DB) return d1Adapter(runtime.DB);

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return null;
  neonClient ??= neon(databaseUrl);
  return postgresAdapter(neonClient);
}

export async function ensurePersistentSchema(db: PersistentDatabase) {
  if (initializedKind === db.kind) return;
  const statements = db.kind === "postgres" ? postgresSchemaStatements : schemaStatements;
  await db.batch(statements.map((sql) => ({ sql })));
  initializedKind = db.kind;
}

export function storageLabel(kind: PersistentDatabase["kind"]) {
  return kind === "postgres" ? "Central Postgres" : "Central D1";
}
