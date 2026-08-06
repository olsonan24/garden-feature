import assert from "node:assert/strict";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import test from "node:test";
import type { DashboardSku, PeriodPayload } from "../lib/analyze-reports.ts";
import { executeApprovedGardenRecommendation } from "../app/api/recommendations/route.ts";
import { accountStateBlockHistory, latestAuditHistory, runDeepAccountAudit, runPortfolioTriage } from "../lib/audit/audit-service.ts";
import type { AuditRecommendation } from "../lib/audit/shared/audit-recommendation.ts";
import type { JarvisPrincipal } from "../lib/jarvis-auth.ts";
import { ensurePersistentSchema, type PersistentDatabase } from "../lib/persistent-database.ts";
import { readPsmRecord, savePsmRecord } from "../lib/psm-service.ts";

class SqliteDatabase implements PersistentDatabase {
  kind = "d1" as const;
  constructor(readonly database: DatabaseSync) {}
  async run(sql: string, params: unknown[] = []) { this.database.prepare(sql).run(...params as SQLInputValue[]); }
  async all<T extends Record<string, unknown>>(sql: string, params: unknown[] = []) { return this.database.prepare(sql).all(...params as SQLInputValue[]) as T[]; }
  async first<T extends Record<string, unknown>>(sql: string, params: unknown[] = []) { return (this.database.prepare(sql).get(...params as SQLInputValue[]) || null) as T | null; }
  async batch(statements: Array<{ sql: string; params?: unknown[] }>) {
    this.database.exec("BEGIN");
    try {
      for (const statement of statements) this.database.prepare(statement.sql).run(...(statement.params || []) as SQLInputValue[]);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function sku(accountId: string, id: string, netSales: number, profit: number): DashboardSku {
  return { id, accountId, name: id, sku: id.toUpperCase(), asin: `ASIN-${id}`, sales: netSales, netSales, sessions: 100, units: 10, refunds: 0, conversion: 10, adSpend: 20, adSales: 100, adOrders: 5, clicks: 30, profit, storage: 2, cogs: Math.max(0, netSales - profit), inventory: 80, fulfillable: 75, reserved: 5, transfer: 0, unsellable: 0, inbound: 10, status: profit < 0 ? "critical" : "healthy", issue: "", recommendation: "" };
}

function period(accountId: string, id: string, endDate: string, item: DashboardSku): PeriodPayload {
  return { id, accountId, startDate: endDate === "2026-08-06" ? "2026-07-31" : "2026-07-24", endDate, label: id, kind: "weekly", status: item.status, metrics: { grossSales: item.sales, netSales: item.netSales, netProceeds: item.profit, storage: item.storage, adSpend: item.adSpend, adSales: item.adSales, clicks: item.clicks, adOrders: item.adOrders, sessions: item.sessions, units: item.units, refunds: item.refunds, inventory: item.inventory, fulfillable: item.fulfillable, acos: 20, tacos: item.sales ? item.adSpend / item.sales * 100 : 0, conversion: item.conversion }, wow: {}, daily: [], skus: [item], insights: [], recommendations: [], dataQuality: [], reports: ["SKU Economics", "Business Report by Child ASIN", "Advertised Product", "Manage FBA Inventory"], placements: [], funnel: [], generatedAt: `${endDate}T12:00:00Z` };
}

test("real SQLite persistence supports multi-account triage, immutable history, read-back, and reload", async () => {
  const databasePath = join(tmpdir(), `jarvis-sqlite-integration-${crypto.randomUUID()}.db`);
  let native = new DatabaseSync(databasePath);
  let db = new SqliteDatabase(native);
  const principal: JarvisPrincipal = { userId: "integration-psm", name: "Integration PSM", role: "administrator", accountIds: "*" };
  try {
    await ensurePersistentSchema(db);
    await db.run("INSERT INTO accounts (id, name, status) VALUES (?, ?, ?)", ["northstar", "Northstar Goods", "critical"]);
    await db.run("INSERT INTO accounts (id, name, status) VALUES (?, ?, ?)", ["harbor", "Harbor Home", "healthy"]);
    const northCurrent = sku("northstar", "north-a", 100, -80), northPrior = sku("northstar", "north-a", 500, 100);
    const harborCurrent = sku("harbor", "harbor-a", 500, 150), harborPrior = sku("harbor", "harbor-a", 490, 145);
    for (const item of [northCurrent, harborCurrent]) await db.run("INSERT INTO skus (id, account_id, payload) VALUES (?, ?, ?)", [item.id, item.accountId, JSON.stringify(item)]);
    for (const item of [period("northstar", "north-current", "2026-08-06", northCurrent), period("northstar", "north-prior", "2026-07-30", northPrior), period("harbor", "harbor-current", "2026-08-06", harborCurrent), period("harbor", "harbor-prior", "2026-07-30", harborPrior)]) await db.run("INSERT INTO periods (id, account_id, start_date, end_date, kind, label, payload, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [item.id, item.accountId, item.startDate, item.endDate, item.kind, item.label, JSON.stringify(item), item.generatedAt]);

    const portfolio = await runPortfolioTriage(db, principal);
    assert.deepEqual(portfolio.rankings.map((item) => item.accountId), ["northstar", "harbor"]);
    assert.ok(portfolio.rankings[0].score > portfolio.rankings[1].score);
    const deep = await runDeepAccountAudit(db, principal, "northstar");
    assert.ok(deep.run.findings.some((finding) => finding.skuId === "north-a" && finding.evidence.length > 0));
    assert.equal((await latestAuditHistory(db, principal)).length, 2);
    assert.equal((await accountStateBlockHistory(db, principal, "northstar")).length, 2);
    assert.equal((await db.first<{ count: number }>("SELECT COUNT(*) AS count FROM audit_runs"))?.count, 2);
    assert.ok(Number((await db.first<{ count: number }>("SELECT COUNT(*) AS count FROM audit_evidence"))?.count) > 0);

    const saved = await savePsmRecord(db, "task", { id: "persisted-task", accountId: "northstar", title: "Confirm replenishment", owner: "Integration PSM", responsibleParty: "Angora", dueDate: "2026-08-07", priority: "Critical", status: "Not started", source: "Manual entry" });
    const confirmed = await readPsmRecord(db, "task", saved.record as unknown as Record<string, unknown>);
    assert.equal((confirmed as { id?: string } | null)?.id, "persisted-task");

    const recommendation = (id: string, record: Record<string, unknown>): AuditRecommendation => ({ id, findingId: `finding-${id}`, accountId: "northstar", actionType: "create_task", proposedAction: "Create a verified task", proposedPayload: { entity: "task", record }, approvalRequired: true, requiredRole: "psm", executionCapability: "garden_psm_write", riskLevel: "low", status: "proposed" });
    const successful = recommendation("approval-success", { id: "approved-task", accountId: "northstar", title: "Approved replenishment task", owner: "Integration PSM", responsibleParty: "Angora", dueDate: "2026-08-08", priority: "High", status: "Not started", source: "Manual entry" });
    await db.run("INSERT INTO audit_recommendations (id, finding_id, account_id, sku_id, status, required_role, execution_capability, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [successful.id, successful.findingId, successful.accountId, null, successful.status, successful.requiredRole, successful.executionCapability, JSON.stringify(successful), "2026-08-06T12:00:00Z", "2026-08-06T12:00:00Z"]);
    const execution = await executeApprovedGardenRecommendation(db, successful, principal);
    assert.equal(execution.recommendation.status, "executed");
    assert.equal((execution.confirmedRecord as { id?: string }).id, "approved-task");
    const successfulEvents = await db.all<{ eventType: string }>('SELECT event_type AS "eventType" FROM audit_events WHERE recommendation_id = ? ORDER BY occurred_at', [successful.id]);
    assert.deepEqual(successfulEvents.map((event) => event.eventType), ["approved", "executed"]);

    const failing = recommendation("approval-failure", { id: "failed-task", accountId: "northstar", title: "Invalid blocked task", owner: "Integration PSM", responsibleParty: "Angora", dueDate: "2026-08-08", priority: "High", status: "Blocked", source: "Manual entry" });
    await db.run("INSERT INTO audit_recommendations (id, finding_id, account_id, sku_id, status, required_role, execution_capability, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [failing.id, failing.findingId, failing.accountId, null, failing.status, failing.requiredRole, failing.executionCapability, JSON.stringify(failing), "2026-08-06T12:00:00Z", "2026-08-06T12:00:00Z"]);
    await assert.rejects(() => executeApprovedGardenRecommendation(db, failing, principal), /reason is required/i);
    const failedStatus = await db.first<{ status: string }>("SELECT status FROM audit_recommendations WHERE id = ?", [failing.id]);
    assert.equal(failedStatus?.status, "failed");
    const failingEvents = await db.all<{ eventType: string }>('SELECT event_type AS "eventType" FROM audit_events WHERE recommendation_id = ? ORDER BY occurred_at', [failing.id]);
    assert.deepEqual(failingEvents.map((event) => event.eventType), ["approved", "failed"]);

    native.close();
    native = new DatabaseSync(databasePath);
    db = new SqliteDatabase(native);
    const afterReload = await readPsmRecord(db, "task", { id: "persisted-task" });
    assert.equal((afterReload as { title?: string } | null)?.title, "Confirm replenishment");
    const approvedAfterReload = await readPsmRecord(db, "task", { id: "approved-task" });
    assert.equal((approvedAfterReload as { title?: string } | null)?.title, "Approved replenishment task");
  } finally {
    try { native.close(); } catch {}
    if (existsSync(databasePath)) unlinkSync(databasePath);
  }
});
