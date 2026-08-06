import type { DashboardSku } from "../../../analyze-reports";
import type { AuditAccountInput } from "../../shared/audit-input";
import { currentAndPreviousPeriods } from "../../shared/audit-input";
import type { AuditFinding } from "../../shared/audit-finding";
import { confidenceFromCompleteness } from "../../shared/audit-confidence";
import { evidenceId } from "../../shared/audit-evidence";
import { buildDataReadiness } from "../../shared/data-readiness";

const round = (value: number) => Number(value.toFixed(2));

function matchingSku(sku: DashboardSku, candidates: DashboardSku[]) {
  const clean = (value?: string) => (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return candidates.find((candidate) => candidate.id === sku.id || (sku.sku && clean(candidate.sku) === clean(sku.sku)) || (sku.asin && clean(candidate.asin) === clean(sku.asin)));
}

export function auditSkuPerformance(input: AuditAccountInput, auditRunId: string) {
  const { current, previous } = currentAndPreviousPeriods(input);
  const hasFinance = Boolean(current?.reports.includes("SKU Economics"));
  const hasTraffic = Boolean(current?.reports.includes("Business Report by Child ASIN"));
  const hasAds = Boolean(current?.reports.includes("Advertised Product"));
  const hasInventory = Boolean(current?.reports.includes("Manage FBA Inventory"));
  const readiness = buildDataReadiness([
    { available: Boolean(current), issue: { code: "missing_current_period", field: "weekly period", message: "No current SKU period is available.", whyItMatters: "SKU findings require a current persisted period.", blockedRecommendation: "SKU performance audit", resolution: "Upload a current weekly package.", severity: "blocking" } },
    { available: hasFinance, issue: { code: "missing_sku_economics", field: "SKU Economics", message: "Profit and margin are unavailable.", whyItMatters: "JARVIS will not infer product profit without the finance report or saved cost assumptions.", blockedRecommendation: "profit and margin action", resolution: "Upload SKU Economics or save verified unit costs.", severity: "warning" } },
    { available: hasTraffic, issue: { code: "missing_business_report", field: "Business Report by Child ASIN", message: "Sessions and conversion are unavailable.", whyItMatters: "Listing and conversion diagnosis is lower confidence.", resolution: "Upload the Business Report by Child ASIN.", severity: "warning" } },
    { available: hasAds, issue: { code: "missing_advertised_product", field: "Advertised Product", message: "SKU advertising results are unavailable.", whyItMatters: "Ad efficiency cannot be attributed to products.", resolution: "Upload Advertised Product.", severity: "warning" } },
    { available: hasInventory, issue: { code: "missing_inventory", field: "Manage FBA Inventory", message: "Inventory safeguards are unavailable.", whyItMatters: "JARVIS cannot safely recommend ad scaling.", blockedRecommendation: "ad scaling", resolution: "Upload Manage FBA Inventory.", severity: "warning" } },
  ]);
  if (!current) return { readiness, findings: [] as AuditFinding[] };

  const confidence = confidenceFromCompleteness(readiness.completeness);
  const findings: AuditFinding[] = [];
  const add = (sku: DashboardSku, key: string, values: Omit<AuditFinding, "id" | "auditRunId" | "accountId" | "skuId" | "asin" | "confidence" | "dataCompleteness" | "timeWindow">) => {
    findings.push({ id: `${auditRunId}:${input.account.id}:${sku.id}:${key}`, auditRunId, accountId: input.account.id, skuId: sku.id, asin: sku.asin || undefined, confidence, dataCompleteness: readiness.completeness, timeWindow: current.label, ...values });
  };

  for (const sku of current.skus) {
    const prior = previous ? matchingSku(sku, previous.skus) : undefined;
    if (hasFinance && sku.netSales >= 50 && sku.profit < 0) {
      const id = `${auditRunId}:${input.account.id}:${sku.id}:revenue-with-loss`;
      add(sku, "revenue-with-loss", { severity: "critical", category: "profitability", title: "High revenue is producing a loss", explanation: `${sku.name} produced net revenue but negative persisted net proceeds.`, currentValue: sku.profit, dollarImpact: round(Math.abs(sku.profit)), evidence: [{ id: evidenceId(id, "net proceeds"), findingId: id, sourceReport: "SKU Economics", metricName: "net proceeds", currentValue: sku.profit, comparisonValue: prior?.profit, calculationMethod: "Persisted SKU Economics net proceeds", timePeriod: current.label, confidenceContribution: 1, notes: `Net revenue ${sku.netSales}.` }], recommendation: { id: `${id}:recommendation`, findingId: id, accountId: input.account.id, skuId: sku.id, actionType: "profitability_review", proposedAction: "Review verified COGS, fees, refunds, storage, price, and ad spend before scaling this SKU.", proposedPayload: { accountId: input.account.id, skuId: sku.id }, expectedImpact: round(Math.abs(sku.profit)), approvalRequired: true, requiredRole: "psm", executionCapability: "not_executable", riskLevel: "high", status: "proposed" } });
    }

    if (hasAds && sku.adSpend >= 10 && (sku.adSales === 0 || sku.adSpend / sku.adSales >= 1)) {
      const id = `${auditRunId}:${input.account.id}:${sku.id}:ad-waste`;
      add(sku, "ad-waste", { severity: sku.adSales === 0 ? "critical" : "warning", category: "advertising", title: "Ad spend is not returning sufficient attributed sales", explanation: sku.adSales === 0 ? `${sku.name} recorded ad spend with no attributed ad sales.` : `${sku.name} has ACoS at or above 100%.`, currentValue: sku.adSpend, comparisonValue: sku.adSales, dollarImpact: sku.adSales === 0 ? round(sku.adSpend) : undefined, evidence: [{ id: evidenceId(id, "ad spend"), findingId: id, sourceReport: "Advertised Product", metricName: "ad spend versus attributed sales", currentValue: sku.adSpend, comparisonValue: sku.adSales, calculationMethod: "ad spend / attributed ad sales", timePeriod: current.label, confidenceContribution: 1 }], recommendation: { id: `${id}:recommendation`, findingId: id, accountId: input.account.id, skuId: sku.id, actionType: "run_str_audit", proposedAction: "Inspect the Search Term Report before proposing bid cuts, negatives, or keyword changes.", proposedPayload: { accountId: input.account.id, skuId: sku.id }, approvalRequired: true, requiredRole: "psm", executionCapability: "not_executable", riskLevel: "medium", status: "proposed" } });
    }

    if (hasInventory && hasTraffic && sku.units > 0 && sku.inventory / sku.units < 2) {
      const id = `${auditRunId}:${input.account.id}:${sku.id}:stockout`;
      add(sku, "stockout", { severity: "critical", category: "inventory", title: "Strong demand is exposed to a near-term stockout", explanation: `${sku.name} has fewer than two weeks of supply at the current weekly unit pace.`, currentValue: round(sku.inventory / sku.units), evidence: [{ id: evidenceId(id, "weeks supply"), findingId: id, sourceReport: "Manage FBA Inventory and Business Report by Child ASIN", metricName: "weeks of supply", currentValue: round(sku.inventory / sku.units), calculationMethod: "inventory on hand / current weekly units", timePeriod: current.label, confidenceContribution: 1 }], recommendation: { id: `${id}:recommendation`, findingId: id, accountId: input.account.id, skuId: sku.id, actionType: "protect_inventory", proposedAction: "Confirm replenishment timing and avoid aggressive advertising scale until supply is safe.", proposedPayload: { accountId: input.account.id, skuId: sku.id }, approvalRequired: true, requiredRole: "manager", executionCapability: "not_executable", riskLevel: "high", status: "proposed" } });
    }

    if (hasInventory && sku.inventory > 0 && (sku.units === 0 || sku.inventory / sku.units > 12)) {
      const id = `${auditRunId}:${input.account.id}:${sku.id}:overstock`;
      const value = sku.manualCogsPerUnit ? round(sku.inventory * sku.manualCogsPerUnit) : undefined;
      add(sku, "overstock", { severity: "warning", category: "inventory", title: "Inventory is accumulating without sufficient sell-through", explanation: value === undefined ? `${sku.name} has overstock exposure, but dollar value is unavailable because verified unit COGS is missing.` : `${sku.name} has estimated inventory value at risk based on saved unit COGS.`, currentValue: sku.inventory, dollarImpact: value, evidence: [{ id: evidenceId(id, "inventory"), findingId: id, sourceReport: "Manage FBA Inventory and Business Report by Child ASIN", metricName: "weeks of supply", currentValue: sku.units ? round(sku.inventory / sku.units) : "No weekly sales", calculationMethod: "inventory on hand / current weekly units", timePeriod: current.label, confidenceContribution: value === undefined ? 0.7 : 1, notes: value === undefined ? "Missing unit COGS blocks inventory-value calculation." : `Estimated inventory value ${value}.` }], recommendation: { id: `${id}:recommendation`, findingId: id, accountId: input.account.id, skuId: sku.id, actionType: "overstock_diagnosis", proposedAction: "Diagnose price, offer, listing, reviews, and storage exposure before adding traffic.", proposedPayload: { accountId: input.account.id, skuId: sku.id }, expectedImpact: value, approvalRequired: true, requiredRole: "psm", executionCapability: "not_executable", riskLevel: "medium", status: "proposed" } });
    }

    if (hasTraffic && prior && prior.conversion > 0 && sku.sessions >= 25 && sku.conversion <= prior.conversion * 0.75) {
      const id = `${auditRunId}:${input.account.id}:${sku.id}:conversion-decline`;
      add(sku, "conversion-decline", { severity: "warning", category: "listing-offer", title: "Conversion is falling", explanation: `${sku.name} conversion declined at least 25% from the prior week. PPC may be exposing a listing, price, offer, or review constraint rather than causing it.`, currentValue: sku.conversion, comparisonValue: prior.conversion, evidence: [{ id: evidenceId(id, "conversion"), findingId: id, sourceReport: "Business Report by Child ASIN", metricName: "unit session percentage", currentValue: sku.conversion, comparisonValue: prior.conversion, calculationMethod: "current conversion compared with prior comparable week", timePeriod: `${previous?.label} compared with ${current.label}`, confidenceContribution: 1 }], recommendation: { id: `${id}:recommendation`, findingId: id, accountId: input.account.id, skuId: sku.id, actionType: "listing_offer_diagnosis", proposedAction: "Review the offer, price, listing content, reviews, and traffic mix before treating PPC as the fix.", proposedPayload: { accountId: input.account.id, skuId: sku.id }, approvalRequired: true, requiredRole: "psm", executionCapability: "not_executable", riskLevel: "medium", status: "proposed" } });
    }
  }

  if (previous) {
    const declines = current.skus.map((sku) => ({ sku, prior: matchingSku(sku, previous.skus) })).map(({ sku, prior }) => ({ sku, decline: prior ? Math.max(0, prior.netSales - sku.netSales) : 0 })).filter((item) => item.decline > 0).sort((left, right) => right.decline - left.decline);
    const total = declines.reduce((sum, item) => sum + item.decline, 0);
    const drivers = declines.filter((item) => total && item.decline / total >= 0.2).slice(0, 5);
    for (const { sku, decline } of drivers) {
      const id = `${auditRunId}:${input.account.id}:${sku.id}:decline-driver`;
      add(sku, "decline-driver", { severity: "warning", category: "revenue", title: "SKU is a material driver of account decline", explanation: `${sku.name} accounts for ${round(decline / total * 100)}% of the measured SKU revenue decline.`, currentValue: sku.netSales, comparisonValue: matchingSku(sku, previous.skus)?.netSales, dollarImpact: round(decline), evidence: [{ id: evidenceId(id, "revenue decline"), findingId: id, sourceReport: "Persisted weekly periods", metricName: "SKU net revenue decline contribution", currentValue: sku.netSales, comparisonValue: matchingSku(sku, previous.skus)?.netSales, calculationMethod: "prior SKU net revenue - current SKU net revenue; divided by total declining-SKU dollars", timePeriod: `${previous.label} compared with ${current.label}`, confidenceContribution: 1 }], recommendation: { id: `${id}:recommendation`, findingId: id, accountId: input.account.id, skuId: sku.id, actionType: "deep_sku_diagnosis", proposedAction: "Prioritize this SKU in the deep PPC, inventory, and listing diagnosis.", proposedPayload: { accountId: input.account.id, skuId: sku.id }, expectedImpact: round(decline), approvalRequired: true, requiredRole: "psm", executionCapability: "not_executable", riskLevel: "low", status: "proposed" } });
    }
  }

  return { readiness, findings };
}
