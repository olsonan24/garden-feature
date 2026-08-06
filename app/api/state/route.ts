import { authorizeRequest, canAccessAccount, hasConfiguredWriteAuth, isAuthorizedRequest, isAuthorizedWriteRequest, publicPrincipal } from "../../../lib/jarvis-auth";
import { accountsSeed, actionSeed, importSeed, seedPeriod, seedSkus } from "../../../lib/jarvis-seed";
import { ensurePersistentSchema, getPersistentDatabase, storageLabel } from "../../../lib/persistent-database";

export const dynamic = "force-dynamic";

function parsePayload<T>(value: unknown): T | null {
  try { return JSON.parse(String(value)) as T; }
  catch { return null; }
}

export function demoDataEnabled(env: { NODE_ENV?: string; ENABLE_DEMO_DATA?: string } = process.env) {
  return env.NODE_ENV !== "production" && env.ENABLE_DEMO_DATA === "true";
}

function emptyState(detail: string) {
  return {
    accounts: [],
    skus: [],
    imports: [],
    actions: [],
    periods: [],
    reviews: [],
    storage: { mode: "unavailable", writable: false, label: "No central data source", detail },
  };
}

function demoState() {
  return {
    accounts: accountsSeed,
    skus: seedSkus,
    imports: importSeed,
    actions: actionSeed,
    periods: [seedPeriod],
    reviews: [],
    storage: { mode: "demo", writable: false, label: "Development demo data", detail: "Explicit ENABLE_DEMO_DATA development mode is active. Sample Caldwell records are read-only and never production evidence." },
  };
}

export async function GET(request: Request) {
  if (!(await isAuthorizedRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const db = await getPersistentDatabase();
    const access = await authorizeRequest(request, "read");
    if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
    if (!db) {
      const state = demoDataEnabled() ? demoState() : emptyState("DATABASE_URL or a Cloudflare D1 binding is required. Demo data is disabled by default and cannot run in production.");
      return Response.json({ ...state, principal: publicPrincipal(access.principal) }, { status: demoDataEnabled() ? 200 : 503, headers: { "cache-control": "no-store", "x-jarvis-storage": state.storage.mode } });
    }
    await ensurePersistentSchema(db);
    const [accounts, skus, imports, actions, periods, reviews] = await Promise.all([
      db.all("SELECT id, name, status FROM accounts ORDER BY created_at"),
      db.all("SELECT payload FROM skus ORDER BY created_at"),
      db.all('SELECT id, account_id AS "accountId", report_type AS "reportType", filename, period, received_at AS "receivedAt", status FROM imports ORDER BY received_at DESC'),
      db.all("SELECT payload FROM actions ORDER BY created_at DESC"),
      db.all("SELECT payload FROM periods ORDER BY end_date DESC"),
      db.all("SELECT payload FROM reviews ORDER BY updated_at DESC"),
    ]);
    const payloads = <T>(rows: Record<string, unknown>[]) => rows.map((row) => parsePayload<T>(row.payload)).filter((item): item is T => Boolean(item));
    const writable = await hasConfiguredWriteAuth();
    const allowedAccountIds = new Set((accounts as Array<{ id: string }>).filter((account) => canAccessAccount(access.principal, account.id)).map((account) => account.id));
    const filterAccount = <T extends { accountId: string }>(items: T[]) => items.filter((item) => allowedAccountIds.has(item.accountId));
    return Response.json({
      accounts: (accounts as Array<{ id: string }>).filter((account) => allowedAccountIds.has(account.id)),
      skus: filterAccount(payloads<{ accountId: string }>(skus)),
      imports: filterAccount(imports as Array<{ accountId: string }>),
      actions: filterAccount(payloads<{ accountId: string }>(actions)),
      periods: filterAccount(payloads<{ accountId: string }>(periods)),
      reviews: filterAccount(payloads<{ accountId: string }>(reviews)),
      principal: publicPrincipal(access.principal),
      storage: { mode: db.kind, writable, label: storageLabel(db.kind), detail: writable ? "Shared dashboard data is saved centrally." : "Set JARVIS_PASSCODE before enabling production writes." },
    }, { headers: { "cache-control": "no-store", "x-jarvis-storage": db.kind } });
  } catch (error) {
    const state = emptyState("The central database could not be reached. No substitute account or metric data has been loaded.");
    return Response.json({ ...state, error: error instanceof Error ? error.message : "Storage failed" }, { status: 503, headers: { "cache-control": "no-store", "x-jarvis-storage": "unavailable" } });
  }
}

export async function POST(request: Request) {
  if (!(await isAuthorizedWriteRequest(request))) return Response.json({ error: "Protected writes require a configured JARVIS_PASSCODE and an authenticated session." }, { status: 401 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const db = await getPersistentDatabase();
    if (!db) return Response.json({ error: "Central storage is not configured. No changes were saved." }, { status: 503 });
    await ensurePersistentSchema(db);
    const kind = String(payload.kind ?? "");
    const accountIdForAccess = String(payload.accountId || payload.id || "").trim();
    const access = await authorizeRequest(request, kind === "account" ? "admin" : "write_psm", kind === "account" ? undefined : accountIdForAccess);
    if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
    if (kind === "account") {
      const id = String(payload.id || "").trim(), name = String(payload.name || "").trim();
      if (!id || !name) return Response.json({ error: "Account id and name are required." }, { status: 400 });
      await db.run("INSERT INTO accounts (id, name, status) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, status = excluded.status", [id, name, String(payload.status ?? "healthy")]);
    } else if (kind === "sku") {
      const id = String(payload.id || "").trim(), accountId = String(payload.accountId || "").trim();
      if (!id || !accountId) return Response.json({ error: "SKU id and account are required." }, { status: 400 });
      await db.run("INSERT INTO skus (id, account_id, payload) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET account_id = excluded.account_id, payload = excluded.payload", [id, accountId, JSON.stringify(payload)]);
    } else if (kind === "action") {
      const id = String(payload.id || "").trim(), accountId = String(payload.accountId || "").trim(), title = String(payload.title || "").trim();
      if (!id || !accountId || !title) return Response.json({ error: "Action id, account, and title are required." }, { status: 400 });
      await db.run("INSERT INTO actions (id, account_id, payload) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET account_id = excluded.account_id, payload = excluded.payload", [id, accountId, JSON.stringify(payload)]);
    } else if (kind === "review") {
      const id = String(payload.id || "").trim(), accountId = String(payload.accountId || "").trim(), periodId = String(payload.periodId || "").trim();
      if (!id || !accountId || !periodId) return Response.json({ error: "Review id, account, and period are required." }, { status: 400 });
      await db.run("INSERT INTO reviews (id, account_id, period_id, payload, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET account_id = excluded.account_id, period_id = excluded.period_id, payload = excluded.payload, updated_at = excluded.updated_at", [id, accountId, periodId, JSON.stringify(payload), String(payload.updatedAt ?? new Date().toISOString())]);
    } else {
      return Response.json({ error: "Unknown record type" }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Save failed" }, { status: 503 });
  }
}
