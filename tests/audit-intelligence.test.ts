import assert from "node:assert/strict";
import test from "node:test";
import type { DashboardMetrics, DashboardSku, PeriodPayload } from "../lib/analyze-reports.ts";
import { auditPpcGrowthOperator } from "../lib/audit/amazon/ppc-growth-operator/index.ts";
import { rankPortfolioAttention, scoreAccountAttention } from "../lib/audit/amazon/account-triage/index.ts";
import { auditSkuPerformance } from "../lib/audit/amazon/sku-performance/index.ts";
import type { AuditAccountInput } from "../lib/audit/shared/audit-input.ts";
import { auditRuleVersion, AUDIT_ENGINE_VERSION, PARSER_VERSION } from "../lib/audit/shared/audit-versioning.ts";
import { transitionRecommendation, type AuditRecommendation } from "../lib/audit/shared/audit-recommendation.ts";
import type { ReportSummary } from "../lib/report-parser.ts";
import { emptyPsmState } from "../lib/psm-types.ts";
import { demoDataEnabled } from "../app/api/state/route.ts";

const reports: PeriodPayload["reports"] = ["SKU Economics", "Business Report by Child ASIN", "Advertised Product", "Search Term", "Targeting", "Placement", "Manage FBA Inventory"];

function sku(accountId: string, id: string, overrides: Partial<DashboardSku> = {}): DashboardSku {
  return {
    id, accountId, name: id, sku: id.toUpperCase(), asin: `ASIN-${id}`,
    sales: 0, netSales: 0, sessions: 0, units: 0, refunds: 0, conversion: 0,
    adSpend: 0, adSales: 0, adOrders: 0, clicks: 0, profit: 0, storage: 0,
    cogs: 0, inventory: 0, fulfillable: 0, reserved: 0, transfer: 0,
    unsellable: 0, inbound: 0, status: "healthy", issue: "", recommendation: "",
    ...overrides,
  };
}

function metrics(skus: DashboardSku[]): DashboardMetrics {
  const sum = (field: keyof DashboardSku) => skus.reduce((total, item) => total + (typeof item[field] === "number" ? Number(item[field]) : 0), 0);
  const grossSales = sum("sales"), netSales = sum("netSales"), adSpend = sum("adSpend"), adSales = sum("adSales"), sessions = sum("sessions"), units = sum("units");
  return { grossSales, netSales, netProceeds: sum("profit"), storage: sum("storage"), adSpend, adSales, clicks: sum("clicks"), adOrders: sum("adOrders"), sessions, units, refunds: sum("refunds"), inventory: sum("inventory"), fulfillable: sum("fulfillable"), acos: adSales ? adSpend / adSales * 100 : adSpend ? 999 : 0, tacos: grossSales ? adSpend / grossSales * 100 : adSpend ? 999 : 0, conversion: sessions ? units / sessions * 100 : 0 };
}

function period(accountId: string, id: string, endDate: string, skus: DashboardSku[], availableReports = reports): PeriodPayload {
  return { id, accountId, startDate: "2026-07-01", endDate, label: id, kind: "weekly", status: "healthy", metrics: metrics(skus), wow: {}, daily: [], skus, insights: [], recommendations: [], dataQuality: [], reports: availableReports, placements: [], funnel: [], generatedAt: `${endDate}T12:00:00Z` };
}

function input(accountId: string, periods: PeriodPayload[], sourceReports: AuditAccountInput["reports"] = []): AuditAccountInput {
  return { account: { id: accountId, name: `Account ${accountId}`, status: "healthy" }, skus: periods[0]?.skus || [], periods, reports: sourceReports, psm: emptyPsmState({ mode: "postgres", writable: true, label: "Test", detail: "Test fixture" }) };
}

test("portfolio financial attention ranks every supplied real account deterministically", () => {
  const highCurrentSku = sku("account-high", "loss-leader", { sales: 120, netSales: 100, profit: -80, adSpend: 60, adSales: 30, units: 10, inventory: 5, sessions: 100 });
  const highPreviousSku = sku("account-high", "loss-leader", { sales: 500, netSales: 480, profit: 100, adSpend: 20, adSales: 100, units: 30, inventory: 200, sessions: 300 });
  const stableCurrent = sku("account-stable", "steady", { sales: 300, netSales: 300, profit: 80, adSpend: 20, adSales: 120, units: 20, inventory: 100, sessions: 200 });
  const stablePrevious = sku("account-stable", "steady", { ...stableCurrent, accountId: "account-stable", netSales: 295, sales: 295 });
  const ranked = rankPortfolioAttention([
    input("account-stable", [period("account-stable", "stable-current", "2026-08-06", [stableCurrent]), period("account-stable", "stable-prior", "2026-07-30", [stablePrevious])]),
    input("account-high", [period("account-high", "high-current", "2026-08-06", [highCurrentSku]), period("account-high", "high-prior", "2026-07-30", [highPreviousSku])]),
  ], "audit-real-accounts");
  assert.deepEqual(ranked.map((item) => item.accountId), ["account-high", "account-stable"]);
  assert.ok(ranked[0].score > ranked[1].score);
  assert.ok(ranked[0].findings.every((finding) => finding.evidence.length > 0));
  assert.ok(ranked[0].findings.every((finding) => finding.recommendation?.approvalRequired === true));
});

test("missing financial data is blocked and reported as unavailable without fabricated dollars", () => {
  const result = scoreAccountAttention(input("empty-account", []), "audit-missing");
  assert.equal(result.dataReadiness.status, "blocked");
  assert.equal(result.currentValue, "Unavailable");
  assert.equal(result.estimatedDollarImpact, undefined);
  assert.match(result.primaryReason, /cannot be ranked|unavailable/i);
});

test("SKU audit calculates supported loss and decline impact and preserves approval gates", () => {
  const currentSku = sku("sku-account", "sku-one", { sales: 150, netSales: 120, profit: -45, cogs: 100, adSpend: 40, adSales: 0, units: 10, inventory: 8, sessions: 100, conversion: 10 });
  const priorSku = sku("sku-account", "sku-one", { sales: 450, netSales: 420, profit: 90, cogs: 200, units: 30, inventory: 90, sessions: 200, conversion: 15 });
  const result = auditSkuPerformance(input("sku-account", [period("sku-account", "current", "2026-08-06", [currentSku]), period("sku-account", "prior", "2026-07-30", [priorSku])]), "audit-sku");
  const loss = result.findings.find((finding) => finding.title === "High revenue is producing a loss");
  const driver = result.findings.find((finding) => finding.title === "SKU is a material driver of account decline");
  assert.equal(loss?.dollarImpact, 45);
  assert.equal(driver?.dollarImpact, 300);
  assert.ok(result.findings.every((finding) => finding.evidence.length > 0));
  assert.ok(result.findings.every((finding) => finding.recommendation?.approvalRequired === true));
});

test("PPC doctrine requires STR and uses row-level STR evidence when available", () => {
  const accountId = "ppc-account";
  const product = sku(accountId, "sku-ppc", { sales: 100, netSales: 100, units: 10, inventory: 100 });
  const current = period(accountId, "ppc-period", "2026-08-06", [product]);
  const summary: ReportSummary = { type: "Search Term", filename: "str.csv", products: [], daily: [], candidates: [{ sku: product.sku, campaign: "Campaign 1", label: "waste query", spend: 25, sales: 0, orders: 0, clicks: 12 }], placements: [], funnel: [], normalizedRows: [{ sourceRowNumber: 7, sourceSheet: "Search Term", recordType: "search_term", sku: product.sku, payload: { sku: product.sku, campaign: "Campaign 1", label: "waste query", spend: 25, sales: 0, orders: 0, clicks: 12 } }], warnings: [] };
  const withStr = auditPpcGrowthOperator(input(accountId, [current], [{ rawImportId: "raw-str-1", periodId: current.id, summary }]), "audit-ppc");
  assert.equal(withStr.doctrine.lead, "STR");
  assert.equal(withStr.findings[0].evidence[0].rawImportId, "raw-str-1");
  assert.equal(withStr.findings[0].evidence[0].sourceRowReference, "row 7");
  assert.equal(withStr.findings[0].recommendation?.requiredRole, "manager");

  const withoutStr = auditPpcGrowthOperator(input(accountId, [current], [{ rawImportId: "raw-sqp-1", periodId: current.id, summary: { ...summary, type: "Search Query Performance", normalizedRows: [] } }]), "audit-no-str");
  assert.equal(withoutStr.readiness.status, "blocked");
  assert.equal(withoutStr.findings.length, 0);
  assert.match(withoutStr.readiness.issues[0].message, /STR proof is missing/);
});

test("demo data is opt-in development-only and audit versions are explicit", () => {
  assert.equal(demoDataEnabled({ NODE_ENV: "production", ENABLE_DEMO_DATA: "true" }), false);
  assert.equal(demoDataEnabled({ NODE_ENV: "development", ENABLE_DEMO_DATA: "false" }), false);
  assert.equal(demoDataEnabled({ NODE_ENV: "development", ENABLE_DEMO_DATA: "true" }), true);
  assert.deepEqual(auditRuleVersion("ppcGrowthOperator"), { engine: AUDIT_ENGINE_VERSION, playbook: "1.0.0", parser: PARSER_VERSION });
});

test("recommendation edit, cancel, and reject transitions are explicit and terminal states cannot change", () => {
  const proposal: AuditRecommendation = {
    id: "recommendation-transition",
    findingId: "finding-transition",
    accountId: "account-transition",
    actionType: "create_task",
    proposedAction: "Create the original task",
    proposedPayload: { entity: "task", record: { title: "Original" } },
    approvalRequired: true,
    requiredRole: "psm",
    executionCapability: "garden_psm_write",
    riskLevel: "low",
    status: "proposed",
  };
  const edited = transitionRecommendation(proposal, "edit", { proposedAction: "Create the edited task", proposedPayload: { entity: "task", record: { title: "Edited" } } });
  assert.equal(edited.status, "edited");
  assert.equal(edited.proposedAction, "Create the edited task");
  assert.deepEqual(proposal.proposedPayload, { entity: "task", record: { title: "Original" } });
  assert.equal(transitionRecommendation(edited, "cancel").status, "canceled");
  assert.equal(transitionRecommendation(proposal, "reject").status, "rejected");
  assert.throws(() => transitionRecommendation({ ...proposal, status: "executed" }, "edit"), /already executed/i);
});
