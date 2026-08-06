import type { Candidate, ReportSummary } from "../../../report-parser";
import type { AuditAccountInput, AuditReportSource } from "../../shared/audit-input";
import { currentAndPreviousPeriods } from "../../shared/audit-input";
import type { AuditFinding } from "../../shared/audit-finding";
import { confidenceFromCompleteness } from "../../shared/audit-confidence";
import { evidenceId } from "../../shared/audit-evidence";
import { buildDataReadiness } from "../../shared/data-readiness";

function sourceCandidates(source: AuditReportSource, recordType: "search_term" | "targeting") {
  const normalized = source.summary.normalizedRows?.filter((row) => row.recordType === recordType).map((row) => ({ candidate: row.payload as Candidate, rowNumber: row.sourceRowNumber })) || [];
  if (normalized.length) return normalized;
  return source.summary.candidates.map((candidate, index) => ({ candidate, rowNumber: index + 2 }));
}

function reportFor(input: AuditAccountInput, periodId: string | undefined, type: ReportSummary["type"]) {
  return input.reports.find((source) => source.periodId === periodId && source.summary.type === type);
}

export function auditPpcGrowthOperator(input: AuditAccountInput, auditRunId: string) {
  const { current } = currentAndPreviousPeriods(input);
  const str = reportFor(input, current?.id, "Search Term");
  const targeting = reportFor(input, current?.id, "Targeting");
  const sqp = reportFor(input, current?.id, "Search Query Performance");
  const hasInventory = Boolean(current?.reports.includes("Manage FBA Inventory"));
  const readiness = buildDataReadiness([
    { available: Boolean(str), issue: { code: "missing_str", field: "Search Term Report", message: "STR proof is missing.", whyItMatters: "Search-term waste, harvest, negatives, and bid decisions require STR as the lead evidence source.", blockedRecommendation: "PPC execution recommendations", resolution: "Upload the Search Term Report for the selected period.", severity: "blocking" } },
    { available: Boolean(targeting), issue: { code: "missing_targeting", field: "Targeting Report", message: "Targeting support is missing.", whyItMatters: "Current targets and bids cannot be cross-checked.", resolution: "Upload the Targeting Report.", severity: "warning" } },
    { available: hasInventory, issue: { code: "missing_inventory_gate", field: "Manage FBA Inventory", message: "Inventory is unknown.", whyItMatters: "Aggressive ad scaling is unsafe without inventory coverage.", blockedRecommendation: "ad scaling", resolution: "Upload Manage FBA Inventory.", severity: "warning" } },
  ]);
  const findings: AuditFinding[] = [];
  if (!current || !str) return { readiness, findings, doctrine: { lead: "STR", support: ["SQP", "Cerebro"], sqpAvailable: Boolean(sqp) } };
  const confidence = confidenceFromCompleteness(readiness.completeness, true);
  const rows = sourceCandidates(str, "search_term");
  const add = (candidate: Candidate, rowNumber: number, key: string, finding: Omit<AuditFinding, "id" | "auditRunId" | "accountId" | "skuId" | "asin" | "confidence" | "dataCompleteness" | "timeWindow" | "evidence">) => {
    const id = `${auditRunId}:${input.account.id}:ppc:${key}:${rowNumber}`;
    findings.push({ id, auditRunId, accountId: input.account.id, skuId: candidate.sku, asin: candidate.asin, confidence, dataCompleteness: readiness.completeness, timeWindow: current.label, ...finding, evidence: [{ id: evidenceId(id, "search term"), findingId: id, sourceReport: "Search Term", rawImportId: str.rawImportId, sourceRowReference: `row ${rowNumber}`, metricName: candidate.label, currentValue: `Spend ${candidate.spend}; sales ${candidate.sales}; orders ${candidate.orders}; clicks ${candidate.clicks}`, calculationMethod: "Direct Search Term Report row", timePeriod: current.label, confidenceContribution: 1, notes: candidate.campaign ? `Campaign: ${candidate.campaign}` : undefined }] });
  };

  for (const { candidate, rowNumber } of rows) {
    if (!candidate.label) continue;
    if (candidate.spend >= 15 && candidate.orders === 0 && candidate.clicks >= 8) {
      const key = `waste-${candidate.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      const findingId = `${auditRunId}:${input.account.id}:ppc:${key}:${rowNumber}`;
      add(candidate, rowNumber, key, { severity: "critical", category: "search-term-waste", title: "Search term is spending without orders", explanation: `${candidate.label} spent ${candidate.spend.toFixed(2)} across ${candidate.clicks} clicks without an attributed order. STR is the primary proof source.`, currentValue: candidate.spend, dollarImpact: candidate.spend, recommendation: { id: `${findingId}:recommendation`, findingId, accountId: input.account.id, skuId: candidate.sku, actionType: "negative_keyword_review", proposedAction: `Review ${candidate.label} for a negative keyword or bid reduction.`, proposedPayload: { searchTerm: candidate.label, campaign: candidate.campaign, currentBid: candidate.bid }, expectedImpact: candidate.spend, approvalRequired: true, requiredRole: "manager", executionCapability: "not_executable", riskLevel: "high", status: "proposed" } });
    } else if (candidate.orders >= 2 && candidate.sales > 0) {
      const key = `harvest-${candidate.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      const findingId = `${auditRunId}:${input.account.id}:ppc:${key}:${rowNumber}`;
      const inventorySafe = hasInventory && !current.skus.some((sku) => (candidate.sku && sku.sku === candidate.sku || candidate.asin && sku.asin === candidate.asin) && sku.units > 0 && sku.inventory / sku.units < 2);
      add(candidate, rowNumber, key, { severity: "info", category: "keyword-harvest", title: "Search term has repeat order evidence", explanation: inventorySafe ? `${candidate.label} has repeat STR orders and can be reviewed for exact-match harvesting.` : `${candidate.label} has repeat STR orders, but scaling is blocked until inventory is confirmed safe.`, currentValue: candidate.orders, recommendation: { id: `${findingId}:recommendation`, findingId, accountId: input.account.id, skuId: candidate.sku, actionType: "keyword_harvest_review", proposedAction: inventorySafe ? `Review ${candidate.label} for conservative exact-match harvesting.` : `Confirm inventory before harvesting or scaling ${candidate.label}.`, proposedPayload: { searchTerm: candidate.label, campaign: candidate.campaign, inventoryGatePassed: inventorySafe }, approvalRequired: true, requiredRole: "manager", executionCapability: "not_executable", riskLevel: inventorySafe ? "medium" : "high", status: "proposed" } });
    }
  }
  return { readiness, findings, doctrine: { lead: "STR", support: ["SQP", "Cerebro"], sqpAvailable: Boolean(sqp) } };
}
