import type { AuditAccountInput } from "../../shared/audit-input";
import type { AuditFinding } from "../../shared/audit-finding";
import { buildDataReadiness } from "../../shared/data-readiness";

export const LISTING_OPTIMIZER_MISSING_SOURCE = "the original /amazon-listing-optimizer .skill or .zip package and all referenced files";

export function auditListingDiagnostics(input: AuditAccountInput, auditRunId: string): AuditFinding[] {
  void input;
  void auditRunId;
  return [];
}

export function listingDiagnosticsReadiness() {
  return buildDataReadiness([{
    available: false,
    issue: {
      code: "listing_optimizer_scaffold_only",
      field: "Amazon Listing Optimizer source",
      message: "Listing optimization is scaffolded only; no sourced threshold or rewrite rule is active.",
      whyItMatters: "The available source names the skill and its outputs but does not include its audit logic.",
      blockedRecommendation: "listing audit and rewrite recommendations",
      resolution: `Provide ${LISTING_OPTIMIZER_MISSING_SOURCE}.`,
      severity: "blocking",
    },
  }]);
}
