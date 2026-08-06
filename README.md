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

No environment variables are required for the seeded demonstration dashboard.
To protect the deployed dashboard with its passcode screen, add this variable
to the Production, Preview, and Development environments:

```text
JARVIS_PASSCODE=your-private-passcode
```

When neither a passcode nor central database is configured, the deployment
opens directly in labeled, read-only demo mode. Production mutation routes
require both a configured passcode and an authenticated session.

Phase 1 shared data supports either existing Cloudflare D1 bindings or a Neon
Postgres database on Vercel. For Vercel, connect Neon through the Marketplace
and expose its server-only connection string as `DATABASE_URL`. The runtime
creates the existing dashboard and Phase 1 tables idempotently; the checked-in
Drizzle migration is the reviewable D1/SQLite schema history. Teams that apply
database changes before deployment can run
`drizzle/postgres/0001_jarvis_phase1.sql` against Neon; the runtime bootstrap
uses the same idempotent schema.

```text
DATABASE_URL=postgresql://...
JARVIS_PASSCODE=your-private-passcode
```

Without `DATABASE_URL`, Vercel serves the bundled Caldwell sample with visible
"Demo data" and "not synced" indicators. It does not pretend that edits were
saved. With Postgres but without `JARVIS_PASSCODE`, shared records remain
readable but writes stay disabled.

Parsed report summaries, calculated periods, and SKU data persist in the
database. Original uploaded files are additionally retained only when the
Cloudflare `BUCKET` binding is available; Vercel/Neon deployments clearly state
that original-file retention is not configured rather than claiming otherwise.

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

The application currently uses one shared passcode/session boundary. It does
not yet provide per-user roles, row-level security, or a partner portal; those
remain explicit future security/product work.

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

All recommendations include source evidence when the corresponding Garden
record exists. Task and blocker mutations are presented as editable approval
cards and use the existing protected `/api/psm` save path only after approval.
Read-only or unavailable storage produces a real error and retains the proposal
without showing a success state. No external connector, message send, API key,
camera, screen, file-system, browser-control, or desktop-control capability is
included.

Voice is optional browser push-to-talk. The microphone is not requested until
the user clicks it, and typed commands remain available when browser speech
recognition is unsupported or permission is denied. Command history and
appearance settings are session-only in this phase.

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
- `tests/` contains rendered-page and report-analysis checks
- `app/api/psm/route.ts` provides validated Phase 1 PSM reads and mutations
- `lib/persistent-database.ts` selects D1 or lazy Neon/Postgres storage
- `drizzle/0003_tan_sphinx.sql` adds the Phase 1 PSM schema
- `drizzle/postgres/0001_jarvis_phase1.sql` bootstraps the equivalent Neon schema
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
