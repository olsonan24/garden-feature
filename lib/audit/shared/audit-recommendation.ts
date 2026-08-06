import type { ExecutionCapability, RecommendationStatus } from "./audit-action";

export type AuditRecommendation = {
  id: string;
  findingId: string;
  accountId: string;
  skuId?: string;
  actionType: string;
  proposedAction: string;
  proposedPayload: Record<string, unknown>;
  expectedImpact?: number;
  approvalRequired: true;
  requiredRole: "psm" | "manager" | "administrator";
  executionCapability: ExecutionCapability;
  riskLevel: "low" | "medium" | "high";
  status: RecommendationStatus;
};

export type RecommendationTransition = "edit" | "cancel" | "reject";

export function transitionRecommendation(
  recommendation: AuditRecommendation,
  operation: RecommendationTransition,
  changes: { proposedAction?: string; proposedPayload?: Record<string, unknown> } = {},
): AuditRecommendation {
  if (!(["proposed", "edited"] as RecommendationStatus[]).includes(recommendation.status)) {
    throw new Error(`Recommendation is already ${recommendation.status}.`);
  }
  if (operation === "edit") {
    return {
      ...recommendation,
      proposedAction: changes.proposedAction || recommendation.proposedAction,
      proposedPayload: changes.proposedPayload || recommendation.proposedPayload,
      status: "edited",
    };
  }
  return { ...recommendation, status: operation === "cancel" ? "canceled" : "rejected" };
}
