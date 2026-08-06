import { authorizeRequest, canAccessAccount } from "../../../lib/jarvis-auth";
import { ensurePersistentSchema, getPersistentDatabase } from "../../../lib/persistent-database";

export const dynamic = "force-dynamic";

const parse = <T>(value: unknown): T | null => { try { return JSON.parse(String(value)) as T; } catch { return null; } };

export async function GET(request: Request) {
  const access = await authorizeRequest(request, "read");
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const db = await getPersistentDatabase();
  if (!db) return Response.json({ preferences: null, history: [], savedViews: [], acknowledgedAlerts: [], error: "Central storage is required for cross-session settings." }, { status: 503 });
  await ensurePersistentSchema(db);
  const [preferenceRow, historyRows, viewRows, alertRows] = await Promise.all([
    db.first("SELECT payload FROM user_preferences WHERE user_id = ?", [access.principal.userId]),
    db.all("SELECT account_id AS \"accountId\", command, intent, response, created_at AS \"timestamp\", id FROM user_command_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", [access.principal.userId]),
    db.all("SELECT payload FROM saved_views WHERE user_id = ? ORDER BY updated_at DESC", [access.principal.userId]),
    db.all("SELECT account_id AS \"accountId\", alert_key AS \"alertKey\", acknowledged_at AS \"acknowledgedAt\", id FROM acknowledged_alerts WHERE user_id = ? ORDER BY acknowledged_at DESC", [access.principal.userId]),
  ]);
  return Response.json({ preferences: preferenceRow ? parse(preferenceRow.payload) : null, history: historyRows, savedViews: viewRows.map((row) => parse(row.payload)).filter(Boolean), acknowledgedAlerts: alertRows }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const access = await authorizeRequest(request, "read");
  if (!access.ok || access.principal.userId === "anonymous-read-only") return Response.json({ error: "An authenticated user is required to save settings." }, { status: 401 });
  const db = await getPersistentDatabase();
  if (!db) return Response.json({ error: "Central storage is required for cross-session settings." }, { status: 503 });
  await ensurePersistentSchema(db);
  const input = await request.json().catch(() => ({})) as Record<string, unknown>;
  const operation = String(input.operation || "");
  const now = new Date().toISOString();
  if (operation === "preferences") {
    const payload = input.preferences && typeof input.preferences === "object" && !Array.isArray(input.preferences) ? input.preferences : {};
    if (JSON.stringify(payload).length > 10_000) return Response.json({ error: "Preferences payload is too large." }, { status: 413 });
    await db.run("INSERT INTO user_preferences (user_id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at", [access.principal.userId, JSON.stringify(payload), now]);
    return Response.json({ ok: true, preferences: payload, updatedAt: now });
  }
  if (operation === "history") {
    const command = String(input.command || "").trim().slice(0, 1_000);
    const response = String(input.response || "").trim().slice(0, 5_000);
    const intent = String(input.intent || "UNKNOWN_COMMAND").slice(0, 100);
    const accountId = String(input.accountId || "").trim() || null;
    if (!command || !response) return Response.json({ error: "Command and response are required." }, { status: 400 });
    if (accountId && !canAccessAccount(access.principal, accountId)) return Response.json({ error: "This user is not assigned to that account." }, { status: 403 });
    const id = `history-${crypto.randomUUID()}`;
    await db.run("INSERT INTO user_command_history (id, user_id, account_id, command, intent, response, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [id, access.principal.userId, accountId, command, intent, response, now]);
    return Response.json({ ok: true, id, timestamp: now });
  }
  if (operation === "saved_view") {
    const name = String(input.name || "").trim().slice(0, 100);
    if (!name || !input.view || typeof input.view !== "object") return Response.json({ error: "Saved view name and configuration are required." }, { status: 400 });
    const id = String(input.id || `view-${crypto.randomUUID()}`);
    const payload = { id, name, view: input.view, createdAt: String(input.createdAt || now), updatedAt: now };
    await db.run("INSERT INTO saved_views (id, user_id, name, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, payload = excluded.payload, updated_at = excluded.updated_at", [id, access.principal.userId, name, JSON.stringify(payload), payload.createdAt, now]);
    return Response.json({ ok: true, savedView: payload });
  }
  if (operation === "acknowledge") {
    const accountId = String(input.accountId || "").trim(), alertKey = String(input.alertKey || "").trim();
    if (!accountId || !alertKey) return Response.json({ error: "Account and alert key are required." }, { status: 400 });
    if (!canAccessAccount(access.principal, accountId)) return Response.json({ error: "This user is not assigned to that account." }, { status: 403 });
    const id = `${access.principal.userId}:${accountId}:${alertKey}`;
    await db.run("INSERT INTO acknowledged_alerts (id, user_id, account_id, alert_key, acknowledged_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET acknowledged_at = excluded.acknowledged_at", [id, access.principal.userId, accountId, alertKey, now]);
    return Response.json({ ok: true, id, acknowledgedAt: now });
  }
  return Response.json({ error: "Unknown user-settings operation." }, { status: 400 });
}
