import assert from "node:assert/strict";
import test from "node:test";
import { generatePartnerUpdateDraft, daysSince, freshness, savePsmRecord } from "../lib/psm-service.ts";
import type { PersistentDatabase } from "../lib/persistent-database.ts";

class MemoryDatabase implements PersistentDatabase {
  kind = "postgres" as const;
  rows = new Map<string, Record<string, unknown>>();
  async run(sql: string, params: unknown[] = []) {
    const table = sql.match(/INSERT INTO ([a-z0-9_]+)/i)?.[1] || "unknown";
    const id = String(params[0]);
    const payloadIndex = table === "account_events" ? 4 : table === "account_workflows" ? 3 : table === "weekly_reviews_v2" ? 5 : 4;
    this.rows.set(`${table}:${id}`, { payload: params[payloadIndex] });
  }
  async all<T extends Record<string, unknown>>() { return [] as T[]; }
  async first<T extends Record<string, unknown>>(sql: string, params: unknown[] = []) {
    const table = sql.match(/FROM ([a-z0-9_]+)/i)?.[1] || "unknown";
    return (this.rows.get(`${table}:${String(params[0])}`) || null) as T | null;
  }
  async batch() {}
}

test("requires a reason for blocked and waiting tasks", async () => {
  const db = new MemoryDatabase();
  await assert.rejects(() => savePsmRecord(db, "task", {
    accountId: "caldwell", title: "Need access", owner: "Alex", responsibleParty: "Partner", priority: "High", status: "Waiting on partner", source: "Manual entry",
  }), /reason is required/i);
});

test("rejects invalid calendar dates", async () => {
  const db = new MemoryDatabase();
  await assert.rejects(
    savePsmRecord(db, "task", {
      accountId: "account-1",
      title: "Impossible due date",
      owner: "Alex",
      responsibleParty: "Angora",
      dueDate: "2026-02-31",
      priority: "Normal",
      status: "Not started",
      source: "Manual entry",
    }),
    /valid YYYY-MM-DD date/,
  );
});

test("records completion history when a task is completed", async () => {
  const db = new MemoryDatabase();
  const saved = await savePsmRecord(db, "task", {
    id: "task-1", accountId: "caldwell", title: "Confirm COGS", owner: "Alex", responsibleParty: "Both", dueDate: "2026-08-06", priority: "Critical", status: "Completed", notes: "Confirmed", source: "Manual entry",
  });
  assert.equal((saved.record as { id: string }).id, "task-1");
  assert.equal((saved.record as { completionHistory: unknown[] }).completionHistory.length, 1);
});

test("generates an editable partner update from review fields", () => {
  const draft = generatePartnerUpdateDraft({ healthStatus: "At risk", completedWork: "Updated bids", openBlockers: "Missing COGS", partnerRequests: "Send COGS", reportsStatus: "Partial", nextActions: "Review margin", partnerUpdateNotes: "Launch delayed" });
  assert.match(draft, /Updated bids/);
  assert.match(draft, /Missing COGS/);
  assert.match(draft, /Send COGS/);
  assert.match(draft, /Launch delayed/);
});

test("computes freshness and days waiting deterministically", () => {
  const now = new Date("2026-08-06T12:00:00Z");
  assert.equal(daysSince("2026-08-01", now), 5);
  assert.equal(freshness("2026-08-05T12:00:00Z", now), "Current");
  assert.equal(freshness("2026-07-01T12:00:00Z", now), "Stale");
  assert.equal(freshness("", now), "Missing");
});
