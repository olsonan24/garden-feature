-- Destructive only inside the dedicated Garden/JARVIS Preview QA database.
-- Never run this file against an existing, shared, or production database.

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'garden_preview_qa' THEN
    RAISE EXCEPTION
      'Refusing to reset database %. Expected garden_preview_qa.',
      current_database();
  END IF;
END
$guard$;

-- A deterministic reset makes repeated Preview acceptance tests comparable.
DELETE FROM audit_events;
DELETE FROM audit_evidence;
DELETE FROM audit_recommendations;
DELETE FROM audit_findings;
DELETE FROM audit_runs;
DELETE FROM account_state_blocks;
DELETE FROM normalized_report_rows;
DELETE FROM raw_report_files;
DELETE FROM raw_imports;
DELETE FROM integration_connections;
DELETE FROM acknowledged_alerts;
DELETE FROM saved_views;
DELETE FROM user_command_history;
DELETE FROM user_preferences;
DELETE FROM jarvis_users;
DELETE FROM account_events;
DELETE FROM weekly_reviews_v2;
DELETE FROM psm_blockers;
DELETE FROM partner_requests;
DELETE FROM psm_tasks;
DELETE FROM account_workflows;
DELETE FROM reviews;
DELETE FROM actions;
DELETE FROM report_summaries;
DELETE FROM imports;
DELETE FROM periods;
DELETE FROM skus;
DELETE FROM accounts;

INSERT INTO accounts (id, name, status, created_at) VALUES
  ('qa-northstar-home', 'Northstar Home QA', 'critical', '2026-08-06T18:00:00Z'),
  ('qa-harbor-kitchen', 'Harbor Kitchen QA', 'healthy', '2026-08-06T18:00:00Z');

CREATE TEMP TABLE qa_period_skus (
  period_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  payload JSONB NOT NULL
) ON COMMIT DROP;

INSERT INTO qa_period_skus (period_id, account_id, sku_id, payload) VALUES
  (
    'qa-northstar-2026-07-26', 'qa-northstar-home', 'qa-ns-lamp',
    jsonb_build_object(
      'id', 'qa-ns-lamp', 'accountId', 'qa-northstar-home', 'name', 'Northstar Reading Lamp',
      'sku', 'QA-NS-LAMP', 'asin', 'B0QATEST001', 'sales', 1200, 'netSales', 1200,
      'sessions', 800, 'units', 60, 'refunds', 0, 'conversion', 7.5,
      'adSpend', 120, 'adSales', 500, 'adOrders', 25, 'clicks', 200,
      'profit', 240, 'storage', 20, 'cogs', 500, 'inventory', 240,
      'fulfillable', 230, 'reserved', 10, 'transfer', 0, 'unsellable', 0, 'inbound', 0,
      'status', 'healthy', 'issue', 'QA prior-period baseline.',
      'recommendation', 'Use only as a comparison-period fixture.'
    )
  ),
  (
    'qa-northstar-2026-07-26', 'qa-northstar-home', 'qa-ns-tray',
    jsonb_build_object(
      'id', 'qa-ns-tray', 'accountId', 'qa-northstar-home', 'name', 'Northstar Serving Tray',
      'sku', 'QA-NS-TRAY', 'asin', 'B0QATEST002', 'sales', 800, 'netSales', 800,
      'sessions', 500, 'units', 40, 'refunds', 0, 'conversion', 8,
      'adSpend', 80, 'adSales', 300, 'adOrders', 15, 'clicks', 140,
      'profit', 160, 'storage', 15, 'cogs', 320, 'inventory', 160,
      'fulfillable', 155, 'reserved', 5, 'transfer', 0, 'unsellable', 0, 'inbound', 0,
      'status', 'healthy', 'issue', 'QA prior-period baseline.',
      'recommendation', 'Use only as a comparison-period fixture.'
    )
  ),
  (
    'qa-northstar-2026-08-02', 'qa-northstar-home', 'qa-ns-lamp',
    jsonb_build_object(
      'id', 'qa-ns-lamp', 'accountId', 'qa-northstar-home', 'name', 'Northstar Reading Lamp',
      'sku', 'QA-NS-LAMP', 'asin', 'B0QATEST001', 'sales', 520, 'netSales', 500,
      'sessions', 600, 'units', 25, 'refunds', 1, 'conversion', 4.17,
      'adSpend', 180, 'adSales', 120, 'adOrders', 6, 'clicks', 250,
      'profit', -120, 'storage', 30, 'cogs', 300, 'inventory', 30,
      'fulfillable', 25, 'reserved', 5, 'transfer', 0, 'unsellable', 0, 'inbound', 0,
      'status', 'critical', 'issue', 'QA decline, loss, inefficient ads, and stockout-risk fixture.',
      'recommendation', 'Run evidence-backed diagnostics; do not execute marketplace changes.'
    )
  ),
  (
    'qa-northstar-2026-08-02', 'qa-northstar-home', 'qa-ns-tray',
    jsonb_build_object(
      'id', 'qa-ns-tray', 'accountId', 'qa-northstar-home', 'name', 'Northstar Serving Tray',
      'sku', 'QA-NS-TRAY', 'asin', 'B0QATEST002', 'sales', 420, 'netSales', 400,
      'sessions', 450, 'units', 20, 'refunds', 1, 'conversion', 4.44,
      'adSpend', 100, 'adSales', 250, 'adOrders', 10, 'clicks', 180,
      'profit', 20, 'storage', 25, 'cogs', 250, 'inventory', 300,
      'fulfillable', 290, 'reserved', 10, 'transfer', 0, 'unsellable', 0, 'inbound', 0,
      'status', 'attention', 'issue', 'QA conversion decline and overstock fixture.',
      'recommendation', 'Review offer and inventory evidence before adding spend.'
    )
  ),
  (
    'qa-harbor-2026-07-26', 'qa-harbor-kitchen', 'qa-hk-rack',
    jsonb_build_object(
      'id', 'qa-hk-rack', 'accountId', 'qa-harbor-kitchen', 'name', 'Harbor Dish Rack',
      'sku', 'QA-HK-RACK', 'asin', 'B0QATEST003', 'sales', 650, 'netSales', 650,
      'sessions', 500, 'units', 30, 'refunds', 0, 'conversion', 6,
      'adSpend', 70, 'adSales', 300, 'adOrders', 14, 'clicks', 120,
      'profit', 130, 'storage', 10, 'cogs', 260, 'inventory', 150,
      'fulfillable', 145, 'reserved', 5, 'transfer', 0, 'unsellable', 0, 'inbound', 0,
      'status', 'healthy', 'issue', 'QA stable baseline.', 'recommendation', 'Continue monitoring.'
    )
  ),
  (
    'qa-harbor-2026-07-26', 'qa-harbor-kitchen', 'qa-hk-bin',
    jsonb_build_object(
      'id', 'qa-hk-bin', 'accountId', 'qa-harbor-kitchen', 'name', 'Harbor Pantry Bin',
      'sku', 'QA-HK-BIN', 'asin', 'B0QATEST004', 'sales', 350, 'netSales', 350,
      'sessions', 300, 'units', 20, 'refunds', 0, 'conversion', 6.67,
      'adSpend', 30, 'adSales', 150, 'adOrders', 8, 'clicks', 70,
      'profit', 70, 'storage', 6, 'cogs', 140, 'inventory', 100,
      'fulfillable', 96, 'reserved', 4, 'transfer', 0, 'unsellable', 0, 'inbound', 0,
      'status', 'healthy', 'issue', 'QA stable baseline.', 'recommendation', 'Continue monitoring.'
    )
  ),
  (
    'qa-harbor-2026-08-02', 'qa-harbor-kitchen', 'qa-hk-rack',
    jsonb_build_object(
      'id', 'qa-hk-rack', 'accountId', 'qa-harbor-kitchen', 'name', 'Harbor Dish Rack',
      'sku', 'QA-HK-RACK', 'asin', 'B0QATEST003', 'sales', 680, 'netSales', 680,
      'sessions', 520, 'units', 32, 'refunds', 0, 'conversion', 6.15,
      'adSpend', 72, 'adSales', 320, 'adOrders', 15, 'clicks', 124,
      'profit', 140, 'storage', 10, 'cogs', 270, 'inventory', 155,
      'fulfillable', 150, 'reserved', 5, 'transfer', 0, 'unsellable', 0, 'inbound', 0,
      'status', 'healthy', 'issue', 'QA stable current period.', 'recommendation', 'Continue monitoring.'
    )
  ),
  (
    'qa-harbor-2026-08-02', 'qa-harbor-kitchen', 'qa-hk-bin',
    jsonb_build_object(
      'id', 'qa-hk-bin', 'accountId', 'qa-harbor-kitchen', 'name', 'Harbor Pantry Bin',
      'sku', 'QA-HK-BIN', 'asin', 'B0QATEST004', 'sales', 370, 'netSales', 370,
      'sessions', 310, 'units', 21, 'refunds', 0, 'conversion', 6.77,
      'adSpend', 32, 'adSales', 160, 'adOrders', 8, 'clicks', 72,
      'profit', 75, 'storage', 6, 'cogs', 145, 'inventory', 105,
      'fulfillable', 101, 'reserved', 4, 'transfer', 0, 'unsellable', 0, 'inbound', 0,
      'status', 'healthy', 'issue', 'QA stable current period.', 'recommendation', 'Continue monitoring.'
    )
  );

INSERT INTO skus (id, account_id, payload, created_at)
SELECT sku_id, account_id, payload::text, '2026-08-06T18:00:00Z'
FROM qa_period_skus
WHERE period_id IN ('qa-northstar-2026-08-02', 'qa-harbor-2026-08-02');

CREATE TEMP TABLE qa_periods (
  period_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL,
  metrics JSONB NOT NULL
) ON COMMIT DROP;

INSERT INTO qa_periods VALUES
  ('qa-northstar-2026-07-26', 'qa-northstar-home', '2026-07-20', '2026-07-26', 'Jul 20 to Jul 26, 2026', 'healthy',
    jsonb_build_object('grossSales', 2000, 'netSales', 2000, 'netProceeds', 400, 'storage', 35, 'adSpend', 200, 'adSales', 800, 'clicks', 340, 'adOrders', 40, 'sessions', 1300, 'units', 100, 'refunds', 0, 'inventory', 400, 'fulfillable', 385, 'acos', 25, 'tacos', 10, 'conversion', 7.69)),
  ('qa-northstar-2026-08-02', 'qa-northstar-home', '2026-07-27', '2026-08-02', 'Jul 27 to Aug 2, 2026', 'critical',
    jsonb_build_object('grossSales', 940, 'netSales', 900, 'netProceeds', -100, 'storage', 55, 'adSpend', 280, 'adSales', 370, 'clicks', 430, 'adOrders', 16, 'sessions', 1050, 'units', 45, 'refunds', 2, 'inventory', 330, 'fulfillable', 315, 'acos', 75.68, 'tacos', 29.79, 'conversion', 4.29)),
  ('qa-harbor-2026-07-26', 'qa-harbor-kitchen', '2026-07-20', '2026-07-26', 'Jul 20 to Jul 26, 2026', 'healthy',
    jsonb_build_object('grossSales', 1000, 'netSales', 1000, 'netProceeds', 200, 'storage', 16, 'adSpend', 100, 'adSales', 450, 'clicks', 190, 'adOrders', 22, 'sessions', 800, 'units', 50, 'refunds', 0, 'inventory', 250, 'fulfillable', 241, 'acos', 22.22, 'tacos', 10, 'conversion', 6.25)),
  ('qa-harbor-2026-08-02', 'qa-harbor-kitchen', '2026-07-27', '2026-08-02', 'Jul 27 to Aug 2, 2026', 'healthy',
    jsonb_build_object('grossSales', 1050, 'netSales', 1050, 'netProceeds', 215, 'storage', 16, 'adSpend', 104, 'adSales', 480, 'clicks', 196, 'adOrders', 23, 'sessions', 830, 'units', 53, 'refunds', 0, 'inventory', 260, 'fulfillable', 251, 'acos', 21.67, 'tacos', 9.9, 'conversion', 6.39));

INSERT INTO periods (id, account_id, start_date, end_date, kind, label, payload, updated_at)
SELECT
  period_id,
  account_id,
  start_date,
  end_date,
  'weekly',
  label,
  jsonb_build_object(
    'id', period_id,
    'accountId', account_id,
    'startDate', start_date,
    'endDate', end_date,
    'label', label,
    'kind', 'weekly',
    'status', status,
    'metrics', metrics,
    'wow', jsonb_build_object(),
    'daily', jsonb_build_array(),
    'skus', (SELECT jsonb_agg(payload ORDER BY sku_id) FROM qa_period_skus WHERE qa_period_skus.period_id = qa_periods.period_id),
    'insights', jsonb_build_array(),
    'recommendations', jsonb_build_array(),
    'dataQuality', jsonb_build_array('Synthetic Preview QA fixture; not customer evidence.'),
    'reports', jsonb_build_array('SKU Economics', 'Business Report by Child ASIN', 'Advertised Product', 'Search Term', 'Targeting', 'Placement', 'Manage FBA Inventory'),
    'placements', jsonb_build_array(),
    'funnel', jsonb_build_array(),
    'generatedAt', '2026-08-06T18:00:00Z'
  )::text,
  '2026-08-06T18:00:00Z'
FROM qa_periods;

CREATE TEMP TABLE qa_reports (
  import_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  period_id TEXT NOT NULL,
  report_type TEXT NOT NULL,
  filename TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO qa_reports VALUES
  ('qa-ns-search-term', 'qa-northstar-home', 'qa-northstar-2026-08-02', 'Search Term', 'qa_northstar_search_term.csv'),
  ('qa-ns-targeting', 'qa-northstar-home', 'qa-northstar-2026-08-02', 'Targeting', 'qa_northstar_targeting.csv'),
  ('qa-hk-search-term', 'qa-harbor-kitchen', 'qa-harbor-2026-08-02', 'Search Term', 'qa_harbor_search_term.csv'),
  ('qa-hk-targeting', 'qa-harbor-kitchen', 'qa-harbor-2026-08-02', 'Targeting', 'qa_harbor_targeting.csv');

INSERT INTO imports (id, account_id, report_type, filename, period, received_at, status)
SELECT import_id, account_id, report_type, filename, 'Jul 27 to Aug 2, 2026', '2026-08-06T18:00:00Z', 'Imported'
FROM qa_reports;

INSERT INTO raw_imports (
  id, account_id, report_type, original_filename, original_storage_path,
  uploaded_by, uploaded_at, file_checksum, file_size, report_start, report_end,
  parser_version, import_status, import_errors, payload
)
SELECT
  import_id, account_id, report_type, filename, 'qa-fixture://' || filename,
  'preview-qa-fixture', '2026-08-06T18:00:00Z', 'synthetic-preview-qa', '0',
  '2026-07-27', '2026-08-02', 'qa-fixture-v1', 'imported', '[]',
  jsonb_build_object('synthetic', true, 'customerData', false)::text
FROM qa_reports;

INSERT INTO report_summaries (id, import_id, account_id, period_id, report_type, payload, created_at)
SELECT
  import_id || '-summary', import_id, account_id, period_id, report_type,
  jsonb_build_object(
    'type', report_type,
    'filename', filename,
    'products', jsonb_build_array(),
    'daily', jsonb_build_array(),
    'candidates', jsonb_build_array(),
    'placements', jsonb_build_array(),
    'funnel', jsonb_build_array(),
    'normalizedRows', jsonb_build_array(),
    'dateMin', '2026-07-27',
    'dateMax', '2026-08-02',
    'warnings', jsonb_build_array('Synthetic Preview QA fixture; no marketplace action may be inferred.')
  )::text,
  '2026-08-06T18:00:00Z'
FROM qa_reports;

INSERT INTO account_workflows (account_id, stage, health_status, payload, updated_at) VALUES
  (
    'qa-northstar-home', 'At risk', 'Critical',
    jsonb_build_object(
      'accountId', 'qa-northstar-home', 'stage', 'At risk', 'healthStatus', 'Critical',
      'healthReason', 'Synthetic decline and inventory-risk fixture.',
      'nextAction', 'Run portfolio triage and deep account audit.', 'psmOwner', 'Preview QA Manager',
      'lastWeeklyReview', '2026-08-02', 'updatedAt', '2026-08-06T18:00:00Z', 'source', 'Manual entry'
    )::text,
    '2026-08-06T18:00:00Z'
  ),
  (
    'qa-harbor-kitchen', 'Optimization', 'Healthy',
    jsonb_build_object(
      'accountId', 'qa-harbor-kitchen', 'stage', 'Optimization', 'healthStatus', 'Healthy',
      'healthReason', 'Synthetic stable comparison account.',
      'nextAction', 'Continue weekly monitoring.', 'psmOwner', 'Preview QA Manager',
      'lastWeeklyReview', '2026-08-02', 'updatedAt', '2026-08-06T18:00:00Z', 'source', 'Manual entry'
    )::text,
    '2026-08-06T18:00:00Z'
  );

INSERT INTO psm_tasks (id, account_id, status, due_date, payload, created_at, updated_at) VALUES
  (
    'qa-task-ns-replenishment', 'qa-northstar-home', 'In progress', '2026-08-05',
    jsonb_build_object(
      'id', 'qa-task-ns-replenishment', 'accountId', 'qa-northstar-home',
      'title', 'Confirm synthetic lamp replenishment', 'owner', 'Preview QA Manager',
      'responsibleParty', 'Both', 'dueDate', '2026-08-05', 'priority', 'Critical',
      'status', 'In progress', 'blockedReason', 'Awaiting the QA partner response.',
      'notes', 'Synthetic task for overdue-work verification.', 'completionHistory', jsonb_build_array(),
      'createdAt', '2026-08-01T18:00:00Z', 'updatedAt', '2026-08-06T18:00:00Z',
      'completedAt', NULL, 'source', 'Manual entry'
    )::text,
    '2026-08-01T18:00:00Z', '2026-08-06T18:00:00Z'
  ),
  (
    'qa-task-hk-review', 'qa-harbor-kitchen', 'Not started', '2026-08-12',
    jsonb_build_object(
      'id', 'qa-task-hk-review', 'accountId', 'qa-harbor-kitchen',
      'title', 'Complete synthetic weekly review', 'owner', 'Preview QA Manager',
      'responsibleParty', 'Angora', 'dueDate', '2026-08-12', 'priority', 'Normal',
      'status', 'Not started', 'blockedReason', '', 'notes', 'Synthetic navigation fixture.',
      'completionHistory', jsonb_build_array(), 'createdAt', '2026-08-06T18:00:00Z',
      'updatedAt', '2026-08-06T18:00:00Z', 'completedAt', NULL, 'source', 'Manual entry'
    )::text,
    '2026-08-06T18:00:00Z', '2026-08-06T18:00:00Z'
  );

INSERT INTO partner_requests (id, account_id, status, due_date, payload, created_at, updated_at) VALUES
  (
    'qa-request-ns-inventory', 'qa-northstar-home', 'Waiting', '2026-08-07',
    jsonb_build_object(
      'id', 'qa-request-ns-inventory', 'accountId', 'qa-northstar-home',
      'title', 'Provide synthetic inbound inventory date', 'requestType', 'Inventory information',
      'description', 'QA-only request used to verify partner-request workflows.',
      'responsibleParty', 'Partner', 'dateRequested', '2026-08-01', 'dueDate', '2026-08-07',
      'status', 'Waiting', 'lastFollowUpDate', '2026-08-05', 'blocksAccount', true,
      'relatedTaskId', 'qa-task-ns-replenishment', 'relatedBlockerId', 'qa-blocker-ns-inventory',
      'notes', 'Synthetic Preview QA data.', 'createdAt', '2026-08-01T18:00:00Z',
      'updatedAt', '2026-08-06T18:00:00Z', 'source', 'Manual entry'
    )::text,
    '2026-08-01T18:00:00Z', '2026-08-06T18:00:00Z'
  );

INSERT INTO psm_blockers (id, account_id, status, date_opened, payload, created_at, updated_at) VALUES
  (
    'qa-blocker-ns-inventory', 'qa-northstar-home', 'Open', '2026-08-01',
    jsonb_build_object(
      'id', 'qa-blocker-ns-inventory', 'accountId', 'qa-northstar-home',
      'title', 'Synthetic inbound date is unavailable', 'category', 'Inventory issue',
      'responsibleParty', 'Partner', 'status', 'Open', 'dateOpened', '2026-08-01',
      'dateResolved', '', 'relatedTaskId', 'qa-task-ns-replenishment',
      'relatedPartnerRequestId', 'qa-request-ns-inventory', 'resolutionNotes', '',
      'notes', 'Synthetic blocker for operational-risk verification.',
      'createdAt', '2026-08-01T18:00:00Z', 'updatedAt', '2026-08-06T18:00:00Z',
      'source', 'Manual entry'
    )::text,
    '2026-08-01T18:00:00Z', '2026-08-06T18:00:00Z'
  );

INSERT INTO actions (id, account_id, payload, created_at) VALUES
  (
    'qa-action-ns-verify', 'qa-northstar-home',
    jsonb_build_object(
      'id', 'qa-action-ns-verify', 'accountId', 'qa-northstar-home', 'skuId', 'qa-ns-lamp',
      'title', 'Verify synthetic Northstar evidence',
      'detail', 'QA-only saved action; no Amazon execution capability.',
      'status', 'planned', 'createdAt', 'Aug 6, 2026'
    )::text,
    '2026-08-06T18:00:00Z'
  );

COMMIT;

-- Expected after a clean load:
--   accounts=2, skus=4, periods=4, imports=4, raw_imports=4,
--   report_summaries=4, workflows=2, tasks=2, partner_requests=1, blockers=1.
