# Garden/JARVIS data and audit architecture

Status: implemented on `feature/jarvis-command-layer` on 2026-08-06. This document distinguishes code-complete behavior from credential-dependent verification.

## Canonical sources discovered

| Domain | Canonical source | Durable | Notes |
| --- | --- | --- | --- |
| Accounts | `accounts` table | Yes | `id`, `name`, `status`; every API response is filtered through the signed principal's `accountIds`. |
| SKUs | `skus.payload` (`DashboardSku`) | Yes | Account ID, SKU, ASIN, revenue, units, persisted finance/ad/inventory fields, and optional verified manual economics. Parent/child or family values are treated as unknown unless a source supplies them. |
| Weekly/monthly results | `periods.payload` (`PeriodPayload`) | Yes | Derived only from imported report summaries; contains report presence and data-quality warnings. |
| PSM operations | `account_workflows`, `psm_tasks`, `partner_requests`, `psm_blockers`, `weekly_reviews_v2`, `account_events` | Yes | `/api/psm` validates and saves these records. `readPsmRecord` confirms approved writes after persistence. |
| Imported summaries | `imports` and `report_summaries` | Yes | Parsed aggregates used by period/SKU analysis. |
| Original reports | `raw_imports` plus `raw_report_files` | Yes | Original bytes are base64-preserved before parsing; checksum and metadata make later integrity checks possible. An R2 copy is optional supplemental storage. |
| Normalized lineage | `normalized_report_rows` | Yes | Every typed row references raw import, account, period, report type, source sheet/row, parser version, and imported time. |
| Account memory | immutable `account_state_blocks` revisions | Yes | Loaded before account audits and appended after audits and recommendation decisions. Manual targets/facts append through `/api/account-state`. |
| Audits | `audit_runs`, `audit_findings`, `audit_evidence`, `audit_recommendations`, `audit_events` | Yes | Runs/findings/evidence are insert-only; recommendation state changes retain immutable events. |
| User state | `user_preferences`, `user_command_history`, `saved_views`, `acknowledged_alerts` | Yes | Scoped to the authenticated user. |

`PersistentDatabase` is the single adapter boundary. It selects Cloudflare D1 when a binding exists or Neon/Postgres when server-only `DATABASE_URL` exists. The runtime schema is idempotent; forward-only reviewable migrations exist for SQLite/D1 and Postgres.

## Data relationships and available fields

`accountId` joins accounts, SKUs, periods, PSM records, imports, Account State Blocks, findings, recommendations, and events. `skuId` joins a recommendation/finding to a persisted Garden SKU where known. ASIN is retained in SKU and finding payloads. Parent ASIN and product family are optional finding/Account State values and are never inferred from account or product names.

The present normalized financial fields include gross and net revenue, refund amount/count, units, net proceeds/contribution result, COGS when supplied, storage charges, and optional manual unit-economics assumptions. Advertising fields include spend, attributed sales/orders, clicks, impressions where available, ACoS, TACoS only when total sales exist, search term/target/campaign labels, and bids where reported. Inventory includes on-hand, fulfillable, reserved, transfer, unsellable, researching/inbound values where reported. Traffic includes sessions, page views, conversion, and buy-box percentage where reported.

Unknown is a first-class state. Profit findings require the finance report or verified costs. TACoS requires total sales. Inventory-aware scaling requires an inventory report. Brand defense requires manually verified brand terms. Search term waste, harvest, negatives, and bid recommendations require Search Term Report evidence; SQP is explanatory support, not proof.

## Authentication and authorization

Sessions are HMAC-signed, HTTP-only, secure, same-site cookies. `JARVIS_USERS_JSON` defines each user, role, passcode, and either an account allow-list or `"*"`. `JARVIS_SESSION_SECRET` signs sessions independently of user passcodes. The single-user `JARVIS_PASSCODE` mode remains for compatibility.

Capabilities are server enforced:

| Role | Read | PSM write/import | Approve/send | Admin |
| --- | --- | --- | --- | --- |
| read-only | Yes | No | No | No |
| psm | Yes | Yes | No | No |
| manager | Yes | Yes | Yes | No |
| administrator | Yes | Yes | Yes | Yes |

Every account-scoped route also verifies the principal's account allow-list. Client-side button state is convenience only and is not an authorization boundary. Database-native row-level security is not present, so future routes must use `authorizeRequest` before reads or writes.

## Demo isolation

The bundled Caldwell data remains a development fixture only. It is returned only when both conditions hold:

1. `NODE_ENV` is not `production`.
2. `ENABLE_DEMO_DATA` is exactly `true`.

Production missing-storage and storage-error paths return empty collections, HTTP 503, and an explicit unavailable status. They never substitute Caldwell or any other account. Demo UI is visibly labeled and read-only.

## Import, lineage, and backup flow

1. Authenticate and authorize the uploader for the account.
2. Read the exact submitted bytes and write `raw_imports` plus `raw_report_files` with status `received` before parsing.
3. Store SHA-256, byte length, filename, uploader, MIME type, timestamp, parser version, and the database storage path. Optional R2 object storage is a second copy.
4. Parse the workbook/CSV and retain source sheet plus one-based source row on every normalized row.
5. Write existing report summary, period, SKU, and import records through the central adapter.
6. Update raw-import status/date range/errors and write normalized rows referencing the raw import.

The original file record is never updated or deleted by the import-completion path. Parser failures remain tied to the preserved original. Database backups must include both `raw_imports` and `raw_report_files`; an R2 lifecycle policy must not be treated as the only original unless a separately verified archival design is adopted.

## Audit flow and immutability

The daily Vercel cron invokes fast portfolio triage. It ranks every account visible to the service principal using deterministic rules. A PSM opens an account before running the deeper SKU, PPC, inventory, listing, blocker, and task diagnosis. Historical scores remain in each run's metadata rather than being recalculated when displayed.

Every run stores engine, playbook, and parser versions, source reports, data window, data readiness, creator, timestamps, state-block input version, status, and errors when present. Findings and evidence are separate records. There is no update path for an audit run, finding, or evidence record. A repeated run gets a new UUID.

Account State Blocks are immutable revisions. They hold verified targets/assumptions, product identity, inventory flags, changes, open work, previous audit summary, prior approved actions, unresolved recommendations, and do-not-repeat decisions. Sources identify whether each fact came from account/SKU/report/workflow/task/blocker/request/audit/manual input. `/api/account-state` appends and reads back manual revisions; it never overwrites history.

## Approval and execution

1. A finding produces an evidence-linked `proposed` recommendation.
2. The user may edit, cancel, or reject; each creates an audit event.
3. Approval is checked against the recommendation's required role on the server.
4. Garden PSM execution calls canonical `savePsmRecord`, reads the saved record back with `readPsmRecord`, and returns success only after confirmation.
5. Gmail/Slack actions require an already approved recommendation whose execution capability matches the requested operation. They never execute during retrieval, summarization, or drafting UI display.
6. Executed, failed, approved, canceled, and rejected decisions append Account State memory. Rollback requests are recorded with operator instructions, but the system explicitly reports that no rollback occurred until a capability-specific rollback is implemented and verified.

Recommendation statuses are `proposed`, `edited`, `approved`, `rejected`, `executed`, `failed`, `rolled_back`, and `canceled`. There is currently no automatic rollback executor.

## Gmail, Slack, and AI boundaries

Only Gmail and Slack appear in settings. Access tokens are server environment values and are never returned. Gmail uses profile/read/compose/send endpoints and returns message IDs/URLs as source references. Slack reads only channel IDs listed in `SLACK_CHANNEL_IDS`; posts to any other channel are rejected. Provider status distinguishes not configured, expired, disconnected, error, and authenticated checks. A successful status check is not the same as verified end-to-end send/post.

The AI provider interface accepts a question plus retrieved `AuditEvidence`. Its validator rejects missing or invented evidence IDs and any proposed action that does not require approval. No provider adapter is enabled in this release, so the API returns not configured or configured-not-verified and makes no model call.

## Server-only environment variables

See `.env.example`. Required for a persistent preview: `DATABASE_URL`, `JARVIS_SESSION_SECRET`, and `JARVIS_USERS_JSON` (or compatibility `JARVIS_PASSCODE`). `CRON_SECRET` protects scheduled triage. Gmail requires `GMAIL_ACCESS_TOKEN`; Slack requires `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_IDS`. `JARVIS_AI_PROVIDER` and `OPENAI_API_KEY` are configuration placeholders until an approved adapter exists. No value belongs in `NEXT_PUBLIC_*`.

## Migration and operational notes

- D1/SQLite: apply `drizzle/0004_handy_silver_surfer.sql` after migrations 0000-0003.
- Neon/Postgres: apply `drizzle/postgres/0001_jarvis_phase1.sql`, then `0002_jarvis_audit_intelligence.sql`.
- Runtime bootstrap creates missing tables and indexes idempotently but is not a substitute for reviewed production migration practice.
- The project still uses `xlsx@0.18.5`, whose npm package has unresolved audit findings. Upload size/count limits remain defense-in-depth, not a library fix.

## Exact HTTPS preview manual QA

1. Open the preview URL in a private browser window. Confirm no account data appears if `DATABASE_URL` is intentionally absent and that Caldwell is not substituted.
2. With preview database/auth configured, sign in as a PSM assigned to at least two non-demo accounts. Confirm only assigned accounts load and open a non-Caldwell account and its real SKUs.
3. Import one real report package. Confirm the UI shows success, then verify database rows for the raw import/checksum/file and normalized source row lineage.
4. Run portfolio triage. Confirm rankings display reason, values, period, impact when supported, completeness, evidence, and next action. Open evidence.
5. Run a deep audit. Confirm missing reports produce warnings and no invented profit, TACoS, inventory, or PPC claim.
6. Propose a Garden task, edit it, cancel one proposal, and approve another. Confirm no write occurs before approval; after approval confirm the read-back result, reload, and verify the task plus events remain.
7. Repeat an approval as a read-only user and as a PSM for a manager-required recommendation. Confirm HTTP 403 and no write/event claiming execution.
8. Choose **Enable Microphone**. Confirm the browser prompt appears only after that click. Allow it, confirm `granted`, then press push-to-talk and observe `listening`, `processing`, and `stopped`. Revoke permission in browser site settings, reload, click again, and confirm `denied` plus browser-specific recovery guidance. Automated QA is not proof of the real prompt.
9. Confirm Gmail and Slack show their real provider state. With test credentials, retrieve permitted messages and inspect source references. Create/edit a draft, approve it explicitly with a manager, and only then test send/post in a controlled destination. Reload and verify the audit event. Without credentials, leave status not configured.
10. Check desktop and mobile layouts, all original Garden/PSM tabs, upload/review paths, and the browser console. Record any provider or database credential blocker rather than marking the path verified.
