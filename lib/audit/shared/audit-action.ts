export type ExecutionCapability = "garden_psm_write" | "gmail_draft" | "gmail_send" | "slack_post" | "not_executable";
export type RecommendationStatus = "proposed" | "edited" | "approved" | "rejected" | "executed" | "failed" | "rolled_back" | "canceled";

export type AuditEvent = {
  id: string;
  recommendationId: string;
  accountId: string;
  skuId?: string;
  userId: string;
  userRole: string;
  eventType: RecommendationStatus | "rollback_requested";
  originalProposal: Record<string, unknown>;
  editedProposal?: Record<string, unknown>;
  timestamp: string;
  executionResult?: Record<string, unknown>;
  failureReason?: string;
  rollbackInformation?: string;
};
