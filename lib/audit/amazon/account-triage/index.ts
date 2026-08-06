import type { AuditAccountInput } from "../../shared/audit-input";
import { currentAndPreviousPeriods } from "../../shared/audit-input";
import type { AuditFinding } from "../../shared/audit-finding";
import { confidenceFromCompleteness } from "../../shared/audit-confidence";
import { evidenceId } from "../../shared/audit-evidence";
import { buildDataReadiness } from "../../shared/data-readiness";
import type { DataReadiness } from "../../shared/data-readiness";

export type FinancialAttentionResult = {
  accountId: string;
  accountName: string;
  score: number;
  priority: "critical" | "high" | "medium" | "monitor";
  primaryReason: string;
  affectedMetric: string;
  currentValue?: number | string;
  comparisonValue?: number | string;
  timePeriod: string;
  estimatedDollarImpact?: number;
  confidence: "low" | "medium" | "high";
  dataReadiness: DataReadiness;
  findings: AuditFinding[];
  recommendedNextAction: string;
};

const round = (value: number) => Number(value.toFixed(2));
const percentChange = (current: number, previous: number) => previous ? (current - previous) / Math.abs(previous) * 100 : undefined;

function priority(score: number): FinancialAttentionResult["priority"] {
  if (score >= 70) return "critical";
  if (score >= 45) return "high";
  if (score >= 20) return "medium";
  return "monitor";
}

export function scoreAccountAttention(input: AuditAccountInput, auditRunId: string): FinancialAttentionResult {
  const { current, previous } = currentAndPreviousPeriods(input);
  const hasFinance = Boolean(current?.reports.includes("SKU Economics"));
  const hasAds = Boolean(current?.reports.includes("Advertised Product"));
  const hasInventory = Boolean(current?.reports.includes("Manage FBA Inventory"));
  const readiness = buildDataReadiness([
    { available: Boolean(current), issue: { code: "missing_current_period", field: "weekly period", message: "No current weekly period is available.", whyItMatters: "Financial attention cannot be measured without a current period.", blockedRecommendation: "financial ranking", resolution: "Upload the current weekly report package.", severity: "blocking" } },
    { available: Boolean(previous), issue: { code: "missing_comparison_period", field: "prior weekly period", message: "No prior weekly period is available.", whyItMatters: "Revenue, profit, margin, and conversion changes cannot be calculated.", resolution: "Upload at least two comparable weekly periods.", severity: "warning" } },
    { available: hasFinance, issue: { code: "missing_finance", field: "SKU Economics", message: "SKU Economics is missing.", whyItMatters: "Contribution profit and margin findings are unavailable.", blockedRecommendation: "profit and margin actions", resolution: "Upload the SKU Economics report.", severity: "warning" } },
    { available: hasAds, issue: { code: "missing_ads", field: "Advertised Product", message: "Advertised Product is missing.", whyItMatters: "Advertising efficiency cannot be ranked reliably.", blockedRecommendation: "bid and budget actions", resolution: "Upload the Advertised Product report.", severity: "warning" } },
    { available: hasInventory, issue: { code: "missing_inventory", field: "Manage FBA Inventory", message: "Inventory is missing.", whyItMatters: "Stockout and overstock safeguards cannot be applied.", blockedRecommendation: "aggressive ad scaling", resolution: "Upload the Manage FBA Inventory report.", severity: "warning" } },
  ]);

  const findings: AuditFinding[] = [];
  let score = 0;
  const window = current?.label || "No current period";
  const confidence = confidenceFromCompleteness(readiness.completeness, Boolean(current));
  const addFinding = (finding: Omit<AuditFinding, "auditRunId" | "accountId" | "confidence" | "dataCompleteness" | "timeWindow">, points: number) => {
    findings.push({ ...finding, auditRunId, accountId: input.account.id, confidence, dataCompleteness: readiness.completeness, timeWindow: window });
    score += points;
  };

  if (!current) {
    const id = `${auditRunId}:${input.account.id}:missing-period`;
    addFinding({ id, severity: "critical", category: "data-readiness", title: "Current financial data is unavailable", explanation: "This account cannot be ranked from production evidence until a current weekly period is imported.", currentValue: "Unavailable", evidence: [{ id: evidenceId(id, "weekly period"), findingId: id, sourceReport: "Garden periods", metricName: "current weekly period", currentValue: "missing", calculationMethod: "Newest persisted weekly period lookup", timePeriod: window, confidenceContribution: 1 }], recommendation: { id: `${id}:recommendation`, findingId: id, accountId: input.account.id, actionType: "upload_report", proposedAction: "Upload the current weekly report package.", proposedPayload: { accountId: input.account.id }, approvalRequired: true, requiredRole: "psm", executionCapability: "not_executable", riskLevel: "low", status: "proposed" } }, 55);
  } else {
    const revenueChange = previous ? percentChange(current.metrics.netSales, previous.metrics.netSales) : undefined;
    if (revenueChange !== undefined && revenueChange <= -10) {
      const impact = Math.max(0, previous!.metrics.netSales - current.metrics.netSales);
      const id = `${auditRunId}:${input.account.id}:revenue-decline`;
      addFinding({ id, severity: revenueChange <= -25 ? "critical" : "warning", category: "revenue", title: "Net revenue declined", explanation: `Net revenue declined ${Math.abs(revenueChange).toFixed(1)}% from the prior comparable week.`, currentValue: current.metrics.netSales, comparisonValue: previous!.metrics.netSales, dollarImpact: round(impact), evidence: [{ id: evidenceId(id, "net revenue"), findingId: id, sourceReport: "Persisted weekly periods", metricName: "net revenue", currentValue: current.metrics.netSales, comparisonValue: previous!.metrics.netSales, calculationMethod: "(current net revenue - prior net revenue) / absolute prior net revenue", timePeriod: `${previous!.label} compared with ${current.label}`, confidenceContribution: 1 }], recommendation: { id: `${id}:recommendation`, findingId: id, accountId: input.account.id, actionType: "deep_sku_audit", proposedAction: "Run a deep SKU audit to isolate the products responsible for the decline.", proposedPayload: { accountId: input.account.id }, expectedImpact: round(impact), approvalRequired: true, requiredRole: "psm", executionCapability: "not_executable", riskLevel: "low", status: "proposed" } }, revenueChange <= -25 ? 28 : 18);
    }

    if (hasFinance && previous) {
      const profitChange = current.metrics.netProceeds - previous.metrics.netProceeds;
      if (profitChange < -25) {
        const id = `${auditRunId}:${input.account.id}:profit-decline`;
        addFinding({ id, severity: profitChange < -100 ? "critical" : "warning", category: "profitability", title: "Contribution result deteriorated", explanation: "Net proceeds declined from the prior comparable week. This finding uses the persisted SKU Economics result and does not infer missing COGS.", currentValue: current.metrics.netProceeds, comparisonValue: previous.metrics.netProceeds, dollarImpact: round(Math.abs(profitChange)), evidence: [{ id: evidenceId(id, "net proceeds"), findingId: id, sourceReport: "SKU Economics", metricName: "net proceeds", currentValue: current.metrics.netProceeds, comparisonValue: previous.metrics.netProceeds, calculationMethod: "current net proceeds - prior net proceeds", timePeriod: `${previous.label} compared with ${current.label}`, confidenceContribution: 1 }], recommendation: { id: `${id}:recommendation`, findingId: id, accountId: input.account.id, actionType: "review_profitability", proposedAction: "Review the SKU-level contribution drivers before changing ads or inventory.", proposedPayload: { accountId: input.account.id }, expectedImpact: round(Math.abs(profitChange)), approvalRequired: true, requiredRole: "psm", executionCapability: "not_executable", riskLevel: "medium", status: "proposed" } }, profitChange < -100 ? 22 : 12);
      }
    }

    if (hasAds && current.metrics.adSpend > 0 && current.metrics.adSales > 0 && current.metrics.acos >= 60) {
      const id = `${auditRunId}:${input.account.id}:ad-overspend`;
      addFinding({ id, severity: current.metrics.acos >= 100 ? "critical" : "warning", category: "advertising", title: "Advertising efficiency needs review", explanation: `ACoS is ${current.metrics.acos.toFixed(1)}%. No target is assumed; the threshold only triggers operator review.`, currentValue: current.metrics.acos, comparisonValue: input.stateBlock?.assumptions.acosGoal, dollarImpact: undefined, evidence: [{ id: evidenceId(id, "acos"), findingId: id, sourceReport: "Advertised Product", metricName: "ACoS", currentValue: current.metrics.acos, comparisonValue: input.stateBlock?.assumptions.acosGoal ?? "No saved goal", calculationMethod: "advertising spend / attributed advertising sales", timePeriod: current.label, confidenceContribution: 1 }], recommendation: { id: `${id}:recommendation`, findingId: id, accountId: input.account.id, actionType: "run_ppc_audit", proposedAction: "Run the STR-led PPC audit before proposing bid, keyword, or negative changes.", proposedPayload: { accountId: input.account.id }, approvalRequired: true, requiredRole: "psm", executionCapability: "not_executable", riskLevel: "medium", status: "proposed" } }, current.metrics.acos >= 100 ? 18 : 10);
    }

    if (hasInventory) {
      const stockout = current.skus.filter((sku) => sku.units > 0 && sku.inventory / Math.max(sku.units, 1) < 2);
      const overstock = current.skus.filter((sku) => sku.inventory > 0 && (sku.units === 0 || sku.inventory / Math.max(sku.units, 1) > 12));
      if (stockout.length) {
        const id = `${auditRunId}:${input.account.id}:stockout-risk`;
        addFinding({ id, severity: "critical", category: "inventory", title: "Demand is exposed to stockout risk", explanation: `${stockout.length} SKU${stockout.length === 1 ? " has" : "s have"} less than two weeks of supply at the current weekly unit pace.`, currentValue: stockout.length, evidence: stockout.map((sku, index) => ({ id: evidenceId(id, "weeks of supply", index), findingId: id, sourceReport: "Manage FBA Inventory and Business Report by Child ASIN", metricName: `${sku.sku || sku.id} weeks of supply`, currentValue: round(sku.inventory / Math.max(sku.units, 1)), calculationMethod: "inventory on hand / current weekly units", timePeriod: current.label, confidenceContribution: 1, notes: `Inventory ${sku.inventory}; weekly units ${sku.units}.` })), recommendation: { id: `${id}:recommendation`, findingId: id, accountId: input.account.id, actionType: "inventory_review", proposedAction: "Confirm replenishment timing before scaling advertising.", proposedPayload: { accountId: input.account.id, skuIds: stockout.map((sku) => sku.id) }, approvalRequired: true, requiredRole: "psm", executionCapability: "not_executable", riskLevel: "high", status: "proposed" } }, 16);
      }
      if (overstock.length) {
        const id = `${auditRunId}:${input.account.id}:overstock-risk`;
        const valueAtRisk = overstock.reduce((total, sku) => total + (sku.manualCogsPerUnit ? sku.inventory * sku.manualCogsPerUnit : 0), 0);
        addFinding({ id, severity: "warning", category: "inventory", title: "Inventory is accumulating without sufficient sales", explanation: `${overstock.length} SKU${overstock.length === 1 ? " is" : "s are"} above twelve weeks of supply or recorded no weekly units.`, currentValue: overstock.length, dollarImpact: valueAtRisk ? round(valueAtRisk) : undefined, evidence: overstock.map((sku, index) => ({ id: evidenceId(id, "weeks of supply", index), findingId: id, sourceReport: "Manage FBA Inventory and Business Report by Child ASIN", metricName: `${sku.sku || sku.id} inventory exposure`, currentValue: sku.units ? round(sku.inventory / sku.units) : "No weekly units", calculationMethod: "inventory on hand / current weekly units", timePeriod: current.label, confidenceContribution: 0.8, notes: sku.manualCogsPerUnit ? `Inventory value uses saved unit COGS ${sku.manualCogsPerUnit}.` : "Dollar exposure unavailable because unit COGS is missing." })), recommendation: { id: `${id}:recommendation`, findingId: id, accountId: input.account.id, actionType: "overstock_review", proposedAction: "Review price, offer, listing, and inventory disposition before adding ad spend.", proposedPayload: { accountId: input.account.id, skuIds: overstock.map((sku) => sku.id) }, expectedImpact: valueAtRisk ? round(valueAtRisk) : undefined, approvalRequired: true, requiredRole: "psm", executionCapability: "not_executable", riskLevel: "medium", status: "proposed" } }, 10);
      }
    }
  }

  const openBlockers = input.psm.blockers.filter((item) => item.accountId === input.account.id && !["Resolved", "Canceled"].includes(item.status));
  const overdueHighTasks = input.psm.tasks.filter((item) => item.accountId === input.account.id && !["Completed", "Canceled"].includes(item.status) && item.dueDate && item.dueDate < new Date().toISOString().slice(0, 10) && ["High", "Critical"].includes(item.priority));
  if (openBlockers.length || overdueHighTasks.length) {
    const id = `${auditRunId}:${input.account.id}:operational-risk`;
    addFinding({ id, severity: openBlockers.length ? "critical" : "warning", category: "operations", title: "Unresolved work increases financial response risk", explanation: `${openBlockers.length} open blocker${openBlockers.length === 1 ? "" : "s"} and ${overdueHighTasks.length} overdue high-impact task${overdueHighTasks.length === 1 ? "" : "s"} remain unresolved.`, currentValue: openBlockers.length + overdueHighTasks.length, evidence: [...openBlockers.map((item, index) => ({ id: evidenceId(id, "blocker", index), findingId: id, sourceReport: "PSM blockers", sourceRowReference: item.id, metricName: "open blocker", currentValue: item.status, calculationMethod: "Unresolved blocker lookup", timePeriod: window, confidenceContribution: 1, notes: item.title })), ...overdueHighTasks.map((item, index) => ({ id: evidenceId(id, "overdue task", index), findingId: id, sourceReport: "PSM tasks", sourceRowReference: item.id, metricName: "overdue high-impact task", currentValue: item.dueDate, calculationMethod: "Due date before current date and status not completed/canceled", timePeriod: window, confidenceContribution: 1, notes: item.title }))], recommendation: { id: `${id}:recommendation`, findingId: id, accountId: input.account.id, actionType: "resolve_blockers", proposedAction: "Assign and resolve the highest-impact blocker or overdue task before the next review.", proposedPayload: { accountId: input.account.id, blockerIds: openBlockers.map((item) => item.id), taskIds: overdueHighTasks.map((item) => item.id) }, approvalRequired: true, requiredRole: "psm", executionCapability: "garden_psm_write", riskLevel: "low", status: "proposed" } }, Math.min(20, openBlockers.length * 8 + overdueHighTasks.length * 4));
  }

  score = Math.min(100, Math.round(score));
  const primary = [...findings].sort((left, right) => (right.dollarImpact || 0) - (left.dollarImpact || 0) || (right.severity === "critical" ? 1 : 0) - (left.severity === "critical" ? 1 : 0))[0];
  return {
    accountId: input.account.id,
    accountName: input.account.name,
    score,
    priority: priority(score),
    primaryReason: primary?.explanation || (readiness.issues.length ? readiness.issues[0].message : "No threshold-based financial issue was found in the available period."),
    affectedMetric: primary?.category || "financial attention",
    currentValue: primary?.currentValue ?? current?.metrics.netSales,
    comparisonValue: primary?.comparisonValue ?? previous?.metrics.netSales,
    timePeriod: window,
    estimatedDollarImpact: primary?.dollarImpact,
    confidence,
    dataReadiness: readiness,
    findings,
    recommendedNextAction: primary?.recommendation?.proposedAction || "Continue monitoring and import the next comparable period.",
  };
}

export function rankPortfolioAttention(inputs: AuditAccountInput[], auditRunId: string) {
  return inputs.map((input) => scoreAccountAttention(input, auditRunId)).sort((left, right) => right.score - left.score || left.accountName.localeCompare(right.accountName));
}
