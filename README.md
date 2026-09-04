# The Garden Portfolio Intelligence

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

When no passcode is configured, the deployment opens directly in demo mode.
Vercel serves the bundled demonstration data without external storage. D1/R2
writes remain available only when the app runs in a compatible Cloudflare
runtime with `DB` and `BUCKET` bindings; write endpoints return a clear `503`
on a storage-free Vercel demo rather than crashing the deployment.

## Local development

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `app/` contains the dashboard and Next.js route handlers
- `lib/` contains report parsing, analysis, authentication, and runtime adapters
- `tests/` contains rendered-page and report-analysis checks
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

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Next.js Documentation](https://nextjs.org/docs)
- [Vercel Next.js Documentation](https://vercel.com/docs/frameworks/nextjs)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
