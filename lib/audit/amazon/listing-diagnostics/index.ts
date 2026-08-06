import type { AuditAccountInput } from "../../shared/audit-input";
import { currentAndPreviousPeriods } from "../../shared/audit-input";
import type { AuditFinding } from "../../shared/audit-finding";
import { evidenceId } from "../../shared/audit-evidence";

export function auditListingDiagnostics(input: AuditAccountInput, auditRunId: string): AuditFinding[] {
  const { current } = currentAndPreviousPeriods(input);
  if (!current?.reports.includes("Business Report by Child ASIN")) return [];
  return current.skus.filter((sku) => sku.sessions >= 40 && sku.conversion < 2).map((sku) => {
    const id = `${auditRunId}:${input.account.id}:${sku.id}:listing-conversion`;
    return { id, auditRunId, accountId: input.account.id, skuId: sku.id, asin: sku.asin || undefined, severity: "warning", category: "listing-offer", title: "Traffic is present but conversion is constrained", explanation: "PPC can diagnose this constraint, but price, offer, listing content, reviews, or product-market fit may be the binding issue. PPC is not presented as the fix.", currentValue: sku.conversion, timeWindow: current.label, confidence: "high", dataCompleteness: 1, evidence: [{ id: evidenceId(id, "conversion"), findingId: id, sourceReport: "Business Report by Child ASIN", metricName: "sessions and conversion", currentValue: `${sku.sessions} sessions; ${sku.conversion}% conversion`, calculationMethod: "Direct persisted business-report metrics", timePeriod: current.label, confidenceContribution: 1 }], recommendation: { id: `${id}:recommendation`, findingId: id, accountId: input.account.id, skuId: sku.id, actionType: "listing_offer_review", proposedAction: "Review offer, price, listing content, review health, and traffic relevance before increasing PPC.", proposedPayload: { accountId: input.account.id, skuId: sku.id }, approvalRequired: true, requiredRole: "psm", executionCapability: "not_executable", riskLevel: "medium", status: "proposed" } } satisfies AuditFinding;
  });
}
