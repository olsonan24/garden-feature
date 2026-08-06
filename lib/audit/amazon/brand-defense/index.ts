import type { AuditAccountInput } from "../../shared/audit-input";
import { buildDataReadiness } from "../../shared/data-readiness";

export function auditBrandDefense(input: AuditAccountInput) {
  const brandTerms = input.stateBlock?.brandTerms || [];
  return {
    readiness: buildDataReadiness([{ available: brandTerms.length > 0, issue: { code: "missing_brand_terms", field: "verified brand terms", message: "Brand-defense terms are not configured.", whyItMatters: "JARVIS will not infer brand terms from the account name.", blockedRecommendation: "brand-defense actions", resolution: "Save verified brand terms in the Account State Block.", severity: "blocking" } }]),
    findings: [],
  };
}
