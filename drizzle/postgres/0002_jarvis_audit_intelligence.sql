-- Forward-only Postgres schema for authenticated JARVIS preferences, raw report
-- lineage, immutable Account State Blocks, audit history, and integration state.

CREATE TABLE IF NOT EXISTS jarvis_users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, role TEXT NOT NULL,
  payload TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_command_history (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT,
  command TEXT NOT NULL, intent TEXT NOT NULL, response TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_views (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
  payload TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS acknowledged_alerts (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL,
  alert_key TEXT NOT NULL, acknowledged_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS raw_imports (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL, report_type TEXT NOT NULL,
  original_filename TEXT NOT NULL, original_storage_path TEXT NOT NULL,
  uploaded_by TEXT NOT NULL, uploaded_at TEXT NOT NULL,
  file_checksum TEXT NOT NULL, file_size TEXT NOT NULL,
  report_start TEXT, report_end TEXT, parser_version TEXT NOT NULL,
  import_status TEXT NOT NULL, import_errors TEXT NOT NULL, payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS raw_report_files (
  raw_import_id TEXT PRIMARY KEY, encoding TEXT NOT NULL,
  data TEXT NOT NULL, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS normalized_report_rows (
  id TEXT PRIMARY KEY, raw_import_id TEXT NOT NULL, account_id TEXT NOT NULL,
  period_id TEXT NOT NULL, report_type TEXT NOT NULL, source_row TEXT NOT NULL,
  parser_version TEXT NOT NULL, imported_at TEXT NOT NULL, payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS account_state_blocks (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL, revision INTEGER NOT NULL,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_runs (
  id TEXT PRIMARY KEY, account_id TEXT, audit_type TEXT NOT NULL,
  audit_version TEXT NOT NULL, playbook_version TEXT NOT NULL,
  started_at TEXT NOT NULL, completed_at TEXT NOT NULL, created_by TEXT NOT NULL,
  status TEXT NOT NULL, payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_findings (
  id TEXT PRIMARY KEY, audit_run_id TEXT NOT NULL, account_id TEXT NOT NULL,
  sku_id TEXT, severity TEXT NOT NULL, category TEXT NOT NULL, payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_evidence (
  id TEXT PRIMARY KEY, finding_id TEXT NOT NULL, raw_import_id TEXT,
  source_report TEXT NOT NULL, source_row TEXT, payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_recommendations (
  id TEXT PRIMARY KEY, finding_id TEXT NOT NULL, account_id TEXT NOT NULL,
  sku_id TEXT, status TEXT NOT NULL, required_role TEXT NOT NULL,
  execution_capability TEXT NOT NULL, payload TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY, recommendation_id TEXT NOT NULL, account_id TEXT NOT NULL,
  user_id TEXT NOT NULL, user_role TEXT NOT NULL, event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL, payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS integration_connections (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL,
  status TEXT NOT NULL, scopes TEXT NOT NULL, payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS command_history_user_time_idx ON user_command_history (user_id, created_at);
CREATE INDEX IF NOT EXISTS normalized_rows_account_period_idx ON normalized_report_rows (account_id, period_id);
CREATE INDEX IF NOT EXISTS state_blocks_account_revision_idx ON account_state_blocks (account_id, revision);
CREATE INDEX IF NOT EXISTS audit_runs_account_time_idx ON audit_runs (account_id, completed_at);
CREATE INDEX IF NOT EXISTS audit_findings_run_idx ON audit_findings (audit_run_id);
CREATE INDEX IF NOT EXISTS audit_evidence_finding_idx ON audit_evidence (finding_id);
CREATE INDEX IF NOT EXISTS audit_recommendations_account_status_idx ON audit_recommendations (account_id, status);
CREATE INDEX IF NOT EXISTS audit_events_recommendation_time_idx ON audit_events (recommendation_id, occurred_at);
