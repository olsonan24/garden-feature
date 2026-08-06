import type { JarvisPrincipal } from "../jarvis-auth";
import type { PersistentDatabase } from "../persistent-database";
import type { AuditRecommendation } from "../audit/shared/audit-recommendation";
import type { ExecutionCapability } from "../audit/shared/audit-action";

const parse = <T>(value: unknown): T | null => { try { return JSON.parse(String(value)) as T; } catch { return null; } };

export async function requireApprovedExternalRecommendation(db: PersistentDatabase, recommendationId: string, capability: ExecutionCapability, accountId: string) {
  const row = await db.first("SELECT payload FROM audit_recommendations WHERE id = ?", [recommendationId]);
  const recommendation = row ? parse<AuditRecommendation>(row.payload) : null;
  if (!recommendation) throw new Error("Approved recommendation not found.");
  if (recommendation.accountId !== accountId || recommendation.executionCapability !== capability) throw new Error("Recommendation scope does not match this external action.");
  if (recommendation.status !== "approved") throw new Error("External actions require an approved recommendation.");
  return recommendation;
}

export async function recordExternalExecution(db: PersistentDatabase, recommendation: AuditRecommendation, principal: JarvisPrincipal, result?: Record<string, unknown>, failureReason?: string) {
  const now = new Date().toISOString();
  const status = failureReason ? "failed" : "executed";
  const updated = { ...recommendation, status } as AuditRecommendation;
  await db.batch([
    { sql: "UPDATE audit_recommendations SET status = ?, payload = ?, updated_at = ? WHERE id = ?", params: [status, JSON.stringify(updated), now, recommendation.id] },
    { sql: "INSERT INTO audit_events (id, recommendation_id, account_id, user_id, user_role, event_type, occurred_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", params: [`audit-event-${crypto.randomUUID()}`, recommendation.id, recommendation.accountId, principal.userId, principal.role, status, now, JSON.stringify({ recommendationId: recommendation.id, accountId: recommendation.accountId, userId: principal.userId, userRole: principal.role, eventType: status, originalProposal: recommendation.proposedPayload, timestamp: now, executionResult: result, failureReason })] },
  ]);
}
