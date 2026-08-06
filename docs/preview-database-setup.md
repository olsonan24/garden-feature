# Garden/JARVIS isolated Preview database setup

Status: planned, not executed. This runbook deliberately excludes Production and `main`.

## Isolation decision

Create a new Neon project for JARVIS Preview QA. Do not create a branch from the existing Garden production project: a database branch inherits its parent data, which would violate the no-production-customer-data requirement. Record the new Neon project ID in the deployment ticket and verify that it differs from every production project ID.

Use this exact database name inside that project:

```text
garden_preview_qa
```

The seed script refuses to run if `current_database()` is anything else.

## One-time schema and fixture load

1. Create the isolated Neon project and a database named `garden_preview_qa`.
2. From Neon's Connect dialog, obtain:
   - a direct (non-pooler) connection for schema changes and the fixture load;
   - a pooled connection, whose host contains `-pooler`, for the running Next.js app.
3. In the Neon SQL Editor, select `garden_preview_qa` and run these files in order:
   1. `drizzle/postgres/0001_jarvis_phase1.sql`
   2. `drizzle/postgres/0002_jarvis_audit_intelligence.sql`
   3. `tests/fixtures/postgres/preview-qa-reset.sql`
4. Do not put either connection string in Git, an issue, a build log, or a screenshot.

The fixture is destructive by design, but only after its exact-database-name guard succeeds. It loads two synthetic accounts, four synthetic SKUs, two weeks per account, minimal raw-import lineage, and PSM workflow data. It contains no Caldwell or production record.

If `psql` is already installed, the same operation can be run from the repository root without saving the direct URL to disk:

```powershell
$env:JARVIS_QA_DIRECT_URL = Read-Host 'Paste the direct garden_preview_qa connection string'
psql "$env:JARVIS_QA_DIRECT_URL" -v ON_ERROR_STOP=1 -f .\drizzle\postgres\0001_jarvis_phase1.sql
psql "$env:JARVIS_QA_DIRECT_URL" -v ON_ERROR_STOP=1 -f .\drizzle\postgres\0002_jarvis_audit_intelligence.sql
psql "$env:JARVIS_QA_DIRECT_URL" -v ON_ERROR_STOP=1 -f .\tests\fixtures\postgres\preview-qa-reset.sql
Remove-Item Env:JARVIS_QA_DIRECT_URL
```

## Pre-connection SQL verification

Run this in the QA database before adding any Vercel variable:

```sql
SELECT current_database();
SELECT id, name, status FROM accounts ORDER BY id;
SELECT account_id, count(*) AS periods FROM periods GROUP BY account_id ORDER BY account_id;
SELECT count(*) AS caldwell_rows
FROM accounts
WHERE lower(id) LIKE '%caldwell%' OR lower(name) LIKE '%caldwell%';
```

Expected: database `garden_preview_qa`, exactly `qa-harbor-kitchen` and `qa-northstar-home`, two periods for each, and `caldwell_rows = 0`. The separate Neon project ID, not the name check alone, is the evidence that production was not cloned or connected.

## Preview-only Vercel configuration

In Vercel, open **garden-feature > Settings > Environment Variables**. Add the following variables to **Preview** only and restrict each one to Git branch `feature/jarvis-command-layer`:

- `DATABASE_URL`: the pooled `garden_preview_qa` connection string.
- `JARVIS_SESSION_SECRET`: a new random secret used only by this Preview.
- `JARVIS_USERS_JSON`: two QA-only users, one manager and one read-only user, with distinct random passcodes and both fake account IDs assigned.

Template for `JARVIS_USERS_JSON` (replace both passcode placeholders before saving):

```json
[{"userId":"preview-qa-manager","name":"Preview QA Manager","role":"manager","accountIds":["qa-northstar-home","qa-harbor-kitchen"],"passcode":"REPLACE_WITH_RANDOM_MANAGER_PASSCODE"},{"userId":"preview-qa-reader","name":"Preview QA Reader","role":"read-only","accountIds":["qa-northstar-home","qa-harbor-kitchen"],"passcode":"REPLACE_WITH_RANDOM_READER_PASSCODE"}]
```

Do not add `JARVIS_PASSCODE` when using `JARVIS_USERS_JSON`. Do not copy the existing Production `DATABASE_URL`, `POSTGRES_URL`, Neon integration variables, passcodes, or session secret into Preview. The application reads `DATABASE_URL`; the generated `POSTGRES_*` variables are not a substitute.

Environment changes apply only to a new deployment. Redeploy the latest `feature/jarvis-command-layer` commit as a Preview after saving the variables. Do not promote it and do not deploy it with the Production target.

## Acceptance verification

1. Confirm the redeployment is a Preview for `feature/jarvis-command-layer` and its commit matches the reviewed branch head.
2. Before login, `GET /api/state` may be unauthorized or anonymous read-only depending on auth configuration, but it must not return demo Caldwell data.
3. Sign in as `preview-qa-manager`. Confirm `GET /api/state` returns HTTP 200, header `X-Jarvis-Storage: postgres`, `storage.writable: true`, and exactly the two QA accounts.
4. Verify account loading and navigation: overview, My Day, Northstar Home QA, Harbor Kitchen QA, weekly periods, SKU details, tasks, requests, and blockers.
5. Run Portfolio Triage. Northstar should rank above Harbor because the fixture contains a revenue/profit decline, ad inefficiency, inventory risk, an open blocker, and an overdue critical task.
6. Run a Northstar deep account audit. Confirm findings cite persisted QA evidence. Confirm PPC operator, listing optimizer, and brand-defense readiness stay blocked/scaffolded; they must not emit source-invented recommendations.
7. Approve one recommendation that has `executionCapability: not_executable`. Refresh the page and confirm the approved status persists in audit history without changing Amazon, advertising, listing, or inventory state.
8. Sign out, sign in as `preview-qa-reader`, and attempt an audit or recommendation approval. The write must return HTTP 403 and create no audit/event row.
9. Repeat the manager audit once. Confirm Account State Block revision history increments rather than overwriting the prior revision.

Database evidence after those tests:

```sql
SELECT account_id, max(revision) AS latest_revision
FROM account_state_blocks
GROUP BY account_id
ORDER BY account_id;

SELECT account_id, audit_type, status, count(*)
FROM audit_runs
GROUP BY account_id, audit_type, status
ORDER BY account_id, audit_type, status;

SELECT account_id, status, execution_capability, count(*)
FROM audit_recommendations
GROUP BY account_id, status, execution_capability
ORDER BY account_id, status, execution_capability;

SELECT account_id, event_type, count(*)
FROM audit_events
GROUP BY account_id, event_type
ORDER BY account_id, event_type;
```

## Stop conditions

Stop without proceeding if any of these occur:

- the Neon project ID matches a production project;
- the database was branched from a project containing customer data;
- the database name is not `garden_preview_qa`;
- Vercel shows `DATABASE_URL` in Production or in all Preview branches instead of the named feature branch;
- `/api/state` returns Caldwell or any account outside the two `qa-*` fixtures;
- the deployment target is Production;
- approval triggers an external Amazon or advertising write;
- a scaffolded Amazon skill emits a threshold-based recommendation despite its readiness gate.
