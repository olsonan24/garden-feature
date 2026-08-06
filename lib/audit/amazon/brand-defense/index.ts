import type { AuditAccountInput } from "../../shared/audit-input";
import { buildDataReadiness } from "../../shared/data-readiness";

export function auditBrandDefense(input: AuditAccountInput) {
  const brandTerms = input.stateBlock?.brandTerms || [];
  return {
    readiness: buildDataReadiness([
      { available: false, issue: { code: "brand_defense_scaffold_only", field: "Brand Defense Audit source", message: "Brand defense is scaffolded only; no sourced scoring or campaign-gap rule is active.", whyItMatters: "The available source provides only the skill title and description, not its deterministic audit logic.", blockedRecommendation: "brand-defense findings and actions", resolution: "Provide the original /brand-defense-audit .skill or .zip package and all referenced files.", severity: "blocking" } },
      { available: brandTerms.length > 0, issue: { code: "missing_brand_terms", field: "verified brand terms", message: "Brand-defense terms are not configured.", whyItMatters: "JARVIS will not infer brand terms from the account name.", blockedRecommendation: "brand-defense actions", resolution: "Save verified brand terms in the Account State Block.", severity: "blocking" } },
    ]),
    findings: [],
  };
}
