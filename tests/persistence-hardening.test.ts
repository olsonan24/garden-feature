import assert from "node:assert/strict";
import test from "node:test";
import { persistAuditRun, recordRecommendationStateBlockRevision } from "../lib/audit/audit-service.ts";
import type { AccountStateBlock } from "../lib/audit/shared/account-state-block.ts";
import type { AuditRecommendation } from "../lib/audit/shared/audit-recommendation.ts";
import { auditRuleVersion, PARSER_VERSION } from "../lib/audit/shared/audit-versioning.ts";
import type { JarvisPrincipal } from "../lib/jarvis-auth.ts";
import type { PersistentDatabase } from "../lib/persistent-database.ts";
import { finishRawReportImport, preserveRawReport } from "../lib/report-storage.ts";

class CaptureDatabase implements PersistentDatabase {
  kind = "postgres" as const;
  statements: Array<{ sql: string; params: unknown[] }> = [];
  stateBlock: AccountStateBlock | null = null;
  auditRunIds = new Set<string>();
  async run(sql: string, params: unknown[] = []) {
    this.statements.push({ sql, params });
    if (/INSERT INTO account_state_blocks/i.test(sql)) this.stateBlock = JSON.parse(String(params[5])) as AccountStateBlock;
  }
  async all<T extends Record<string, unknown>>() { return [] as T[]; }
  async first<T extends Record<string, unknown>>(sql: string) {
    if (/FROM account_state_blocks/i.test(sql) && this.stateBlock) return { revision: this.stateBlock.version, payload: JSON.stringify(this.stateBlock) } as unknown as T;
    return null;
  }
  async batch(statements: Array<{ sql: string; params?: unknown[] }>) {
    for (const statement of statements) {
      const params = statement.params || [];
      if (/INSERT INTO audit_runs/i.test(statement.sql)) {
        const id = String(params[0]);
        if (this.auditRunIds.has(id)) throw new Error("duplicate audit run id");
        this.auditRunIds.add(id);
      }
      this.statements.push({ sql: statement.sql, params });
    }
  }
}

test("raw reports are preserved byte-for-byte before normalized lineage is written", async () => {
  const db = new CaptureDatabase();
  const source = new TextEncoder().encode("Search Term,Spend,Orders\nblue widget,25,0\n");
  const bytes = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  const uploadedAt = "2026-08-06T12:00:00.000Z";
  const raw = await preserveRawReport(db, { id: "raw-1", accountId: "account-a", filename: "str.csv", reportType: "Unclassified Report", bytes, uploadedBy: "user-1", uploadedAt, contentType: "text/csv" });
  const fileInsert = db.statements.find((statement) => /INSERT INTO raw_report_files/i.test(statement.sql));
  assert.ok(fileInsert);
  assert.deepEqual(Buffer.from(String(fileInsert.params[2]), "base64"), Buffer.from(source));
  assert.match(raw.fileChecksum, /^[a-f0-9]{64}$/);
  assert.equal(raw.parserVersion, PARSER_VERSION);

  await finishRawReportImport(db, { rawImportId: "raw-1", accountId: "account-a", periodId: "period-1", uploadedBy: "user-1", uploadedAt, filename: "str.csv", storagePath: raw.originalStoragePath, fileChecksum: raw.fileChecksum, fileSize: raw.fileSize, status: "processed", errors: [], summary: { type: "Search Term", filename: "str.csv", products: [], daily: [], candidates: [], placements: [], funnel: [], normalizedRows: [{ sourceRowNumber: 2, sourceSheet: "Search Term", recordType: "search_term", payload: { label: "blue widget", spend: 25, orders: 0 } }], dateMin: "2026-07-30", dateMax: "2026-08-06", warnings: [] } });
  const normalized = db.statements.find((statement) => /INSERT INTO normalized_report_rows/i.test(statement.sql));
  assert.ok(normalized);
  assert.equal(normalized.params[1], "raw-1");
  assert.equal(normalized.params[5], "Search Term:2");
  assert.equal(normalized.params[6], PARSER_VERSION);
});

test("audit runs are insert-only, versioned, and duplicate IDs cannot overwrite history", async () => {
  const db = new CaptureDatabase();
  const run = { id: "audit-immutable-1", accountId: "account-a", auditType: "account-deep" as const, versions: auditRuleVersion("skuPerformance"), startedAt: "2026-08-06T12:00:00Z", completedAt: "2026-08-06T12:00:01Z", createdBy: "user-1", status: "completed" as const, dataReadiness: { completeness: 1, status: "ready" as const, issues: [] }, sourceReports: ["SKU Economics"], sourceAccountStateBlockVersion: 3, findings: [] };
  await persistAuditRun(db, run);
  assert.equal(db.statements.filter((statement) => /INSERT INTO audit_runs/i.test(statement.sql)).length, 1);
  assert.equal(db.statements.some((statement) => /UPDATE audit_runs/i.test(statement.sql)), false);
  await assert.rejects(() => persistAuditRun(db, run), /duplicate audit run id/);
});

test("recommendation decisions append Account State Block revisions instead of overwriting prior memory", async () => {
  const db = new CaptureDatabase();
  db.stateBlock = { id: "state-1", accountId: "account-a", accountName: "Account A", version: 1, primarySkus: [], assumptions: {}, inventoryStatus: [], pricingChanges: [], promotionChanges: [], listingChanges: [], reviewIssues: [], campaignChanges: [], brandTerms: [], harvestedKeywords: [], negatives: [], openBlockerIds: [], openTaskIds: [], partnerRequestIds: [], previousApprovedActionIds: [], unresolvedRecommendationIds: ["recommendation-1"], doNotRepeatRecommendationIds: [], sources: [], createdAt: "2026-08-01T00:00:00Z", createdBy: "user-1" };
  const recommendation: AuditRecommendation = { id: "recommendation-1", findingId: "finding-1", accountId: "account-a", actionType: "task", proposedAction: "Create task", proposedPayload: { entity: "task" }, approvalRequired: true, requiredRole: "psm", executionCapability: "garden_psm_write", riskLevel: "low", status: "executed" };
  const principal: JarvisPrincipal = { userId: "manager-1", name: "Manager", role: "manager", accountIds: ["account-a"] };
  const next = await recordRecommendationStateBlockRevision(db, principal, recommendation, "executed");
  assert.equal(next?.version, 2);
  assert.deepEqual(next?.previousApprovedActionIds, ["recommendation-1"]);
  assert.deepEqual(next?.unresolvedRecommendationIds, []);
  assert.deepEqual(next?.doNotRepeatRecommendationIds, ["recommendation-1"]);
  assert.equal(db.statements.some((statement) => /UPDATE account_state_blocks/i.test(statement.sql)), false);
  assert.equal(db.statements.filter((statement) => /INSERT INTO account_state_blocks/i.test(statement.sql)).length, 1);
});
