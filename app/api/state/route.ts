import { isAuthorizedRequest } from "../../../lib/jarvis-auth";
import { accountsSeed, actionSeed, importSeed, seedPeriod, seedSkus } from "../../../lib/jarvis-seed";
import { getCloudflareRuntime, type D1Database } from "../../../lib/cloudflare-runtime";

type DbEnv = { DB: D1Database };

async function ensureSchema() {
  const runtime = await getCloudflareRuntime<DbEnv>();
  const db = runtime?.DB;
  if (!db) throw new Error("Persistent storage is not configured for this deployment.");
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'healthy', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS skus (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS imports (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, report_type TEXT NOT NULL, filename TEXT NOT NULL, period TEXT NOT NULL, received_at TEXT NOT NULL, status TEXT NOT NULL, object_key TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS actions (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, period_id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS report_summaries (id TEXT PRIMARY KEY, import_id TEXT NOT NULL, account_id TEXT NOT NULL, period_id TEXT NOT NULL, report_type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS periods (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'weekly', label TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
  ]);
  return db;
}

function parsePayload<T>(value: unknown): T | null {
  try { return JSON.parse(String(value)) as T; } catch { return null; }
}

export async function GET(request: Request) {
  if (!(await isAuthorizedRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const db = await ensureSchema();
    const [accounts, skus, imports, actions, periods, reviews] = await Promise.all([
      db.prepare("SELECT id, name, status FROM accounts ORDER BY created_at").all(),
      db.prepare("SELECT payload FROM skus ORDER BY created_at").all(),
      db.prepare("SELECT id, account_id AS accountId, report_type AS reportType, filename, period, received_at AS receivedAt, status FROM imports ORDER BY received_at DESC").all(),
      db.prepare("SELECT payload FROM actions ORDER BY created_at DESC").all(),
      db.prepare("SELECT payload FROM periods ORDER BY end_date DESC").all(),
      db.prepare("SELECT payload FROM reviews ORDER BY updated_at DESC").all(),
    ]);
    const savedAccounts = accounts.results;
    const savedSkus = skus.results.map((row) => parsePayload(row.payload)).filter(Boolean);
    const savedImports = imports.results;
    const savedActions = actions.results.map((row) => parsePayload(row.payload)).filter(Boolean);
    const savedPeriods = periods.results.map((row) => parsePayload(row.payload)).filter(Boolean);
    const savedReviews = reviews.results.map((row) => parsePayload(row.payload)).filter(Boolean);
    return Response.json({
      accounts: savedAccounts.length ? savedAccounts : accountsSeed,
      skus: savedSkus.length ? savedSkus : seedSkus,
      imports: savedImports.length ? savedImports : importSeed,
      actions: savedActions.length ? savedActions : actionSeed,
      periods: savedPeriods.length ? savedPeriods : [seedPeriod],
      reviews: savedReviews,
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ accounts: accountsSeed, skus: seedSkus, imports: importSeed, actions: actionSeed, periods: [seedPeriod], reviews: [] }, { headers: { "cache-control": "no-store", "x-jarvis-storage": "demo" } });
  }
}

export async function POST(request: Request) {
  if (!(await isAuthorizedRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const db = await ensureSchema();
    const kind = String(payload.kind ?? "");
    if (kind === "account") {
      await db.prepare("INSERT OR REPLACE INTO accounts (id, name, status) VALUES (?, ?, ?)").bind(String(payload.id), String(payload.name), String(payload.status ?? "healthy")).run();
    } else if (kind === "sku") {
      await db.prepare("INSERT OR REPLACE INTO skus (id, account_id, payload) VALUES (?, ?, ?)").bind(String(payload.id), String(payload.accountId), JSON.stringify(payload)).run();
    } else if (kind === "action") {
      await db.prepare("INSERT OR REPLACE INTO actions (id, account_id, payload) VALUES (?, ?, ?)").bind(String(payload.id), String(payload.accountId), JSON.stringify(payload)).run();
    } else if (kind === "review") {
      await db.prepare("INSERT OR REPLACE INTO reviews (id, account_id, period_id, payload, updated_at) VALUES (?, ?, ?, ?, ?)").bind(String(payload.id), String(payload.accountId), String(payload.periodId), JSON.stringify(payload), String(payload.updatedAt ?? new Date().toISOString())).run();
    } else {
      return Response.json({ error: "Unknown record type" }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Save failed" }, { status: 503 });
  }
}
