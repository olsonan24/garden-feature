# JARVIS Portfolio Intelligence

A Next.js dashboard for analyzing Amazon Seller Central reports, monitoring
portfolio health, and tracking account, SKU, advertising, inventory, and review
performance.

## Prerequisites

- Node.js 22
- npm 10 or newer

## Vercel deployment

The repository is configured as a native Next.js project. Import it into Vercel
and keep the framework preset on **Next.js**. `vercel.json` pins the install and
build commands used by Git deployments.

Production and preview deployments require central storage to display account
data. Missing storage returns an explicit unavailable state; production never
substitutes the bundled Caldwell fixture. Development demo data is disabled by
default and can be enabled only with `ENABLE_DEMO_DATA=true` outside production.

Configure multi-user authentication with server-only `JARVIS_USERS_JSON` and a
separate signing secret. `JARVIS_PASSCODE` remains a single-administrator
compatibility option:

```text
JARVIS_SESSION_SECRET=long-random-signing-secret
JARVIS_USERS_JSON=[{"userId":"...","name":"...","role":"psm","accountIds":["..."],"passcode":"..."}]
```

Roles are `psm`, `manager`, `administrator`, and `read-only`; capability and
account assignment checks run in every protected server route. With no auth
configuration production is read-only, but it still does not receive demo data.

Phase 1 shared data supports either existing Cloudflare D1 bindings or a Neon
Postgres database on Vercel. For Vercel, connect Neon through the Marketplace
and expose its server-only connection string as `DATABASE_URL`. The runtime
creates the dashboard, PSM, raw-report, user-preference, Account State Block,
and immutable audit tables idempotently. The checked-in Drizzle migrations are
the reviewable D1/SQLite history. Apply both files under `drizzle/postgres/` to
Neon in numeric order when migrations are managed outside runtime bootstrap.

```text
DATABASE_URL=postgresql://...
JARVIS_SESSION_SECRET=...
JARVIS_USERS_JSON=...
```

Without `DATABASE_URL`, Vercel returns no accounts and an explicit central-
storage error. With Postgres but without a write-capable configured user,
shared records remain readable but writes stay disabled.

Every authenticated import stores the original bytes, checksum, filename,
size, uploader, parser version, and lifecycle status in central storage before
parsing. An optional Cloudflare bucket copy can supplement, but never replace,
that database-backed original. Normalized rows preserve raw-import, report,
sheet/row, parser-version, and import-time lineage.

## Phase 1 PSM operating layer

- **My Day** summarizes due, overdue, blocked, partner-waiting, missing-data,
  and unhealthy-account work with compact saved views.
- **Operations** stores configurable account workflow, tasks, partner requests,
  blockers, notes, major decisions, and generated account history.
- **Weekly Business Review** includes guided revenue, ads, inventory, SKU,
  report, health, blocker, partner, and next-action fields.
- The weekly partner update is generated as an editable draft and is never sent
  automatically.
- Waiting or blocked tasks require a reason; resolved blockers require
  resolution notes; failed mutations leave the client state unchanged.

The application supports signed per-user sessions, account assignments, and
server-side role capabilities. Database-native row-level security and a partner
portal are not implemented; route authorization is therefore a required part
of every data access path.

## JARVIS command layer

The **JARVIS Command Center** adds a deterministic, evidence-first operator
layer without replacing or restyling the existing Garden views. A compact
global assistant remains available on the portfolio, account, import, review,
and PSM screens.

Supported Phase 1 commands include account navigation and analysis, mission
queues, blockers, partner requests, overdue tasks, missing reports, editable
weekly update drafts, weekly-review navigation, task proposals, blocker
escalation proposals, settings, and help. Account commands fuzzy-match real
Garden accounts and navigate to the existing account view rather than a
separate JARVIS-only account screen.

Every financial or operational finding includes evidence and every action card
requires approval. Proposals, edits, approvals, cancellations, rejections,
executions, failures, and rollback requests create audit events. Canonical
Garden writes still use `/api/psm`; successful execution must be read back from
the database before the UI receives confirmation. Command history, appearance,
saved views, and acknowledged alerts are stored per authenticated user.

Voice is optional browser push-to-talk. `getUserMedia` is called only by the
explicit **Enable Microphone** click, tracks are released after permission is
confirmed, and speech recognition starts only after the granted state. Typed
commands remain available in denied, insecure, unavailable, and unsupported
states.

Gmail and Slack are the only integration boundaries exposed. Tokens stay in
server environment variables, status is verified against each provider, reads
include source references, and sends/posts require an approved matching
recommendation plus a manager-capable session. No AI provider adapter is active
until an approved server-side implementation is configured; deterministic
commands and audits remain available without one.

## Local development

```bash
npm ci
npm run lint
npm test
npm run build
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `app/` contains the dashboard and Next.js route handlers
- `lib/` contains report parsing, analysis, authentication, and runtime adapters
- `tests/` contains rendered-page, report-analysis, audit, persistence, role,
  voice, Gmail/Slack-boundary, and AI-evidence checks
- `app/api/psm/route.ts` provides validated Phase 1 PSM reads and mutations
- `lib/persistent-database.ts` selects D1 or lazy Neon/Postgres storage
- `drizzle/0004_handy_silver_surfer.sql` adds user, raw-report, Account State,
  audit-history, recommendation, evidence, event, and integration tables
- `drizzle/postgres/0002_jarvis_audit_intelligence.sql` adds the equivalent Neon schema
- `docs/data-architecture.md` records canonical sources, permissions, lineage,
  deployment requirements, and manual verification
- `vercel.json` declares the native Vercel build configuration
- `.openai/hosting.json`, `vite.config.ts`, and `worker/` retain optional Sites compatibility

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Diagnostic Commands

- `npm run dev`: start the Next.js development server
- `npm run build`: create the Vercel-compatible Next.js production build
- `npm run start`: serve the production Next.js build
- `npm run lint`: run ESLint
- `npm test`: verify the rendered development-preview metadata
- `npm run build:sites`: build the optional Vinext/Sites artifact on Linux
- `npm run validate:artifact`: validate an existing Sites artifact
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Known Import Dependency Risk

The spreadsheet parser currently depends on `xlsx@0.18.5`. Its published npm
package has unresolved high-severity audit findings and no patched npm release.
Imports are therefore limited to 20 authenticated files per request and 20 MB
per file. Replacing the parser is deferred work and should be completed before
accepting files from untrusted users.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Next.js Documentation](https://nextjs.org/docs)
- [Vercel Next.js Documentation](https://vercel.com/docs/frameworks/nextjs)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
