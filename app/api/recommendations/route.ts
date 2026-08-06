import { authorizeRequest, meetsRequiredRole } from "../../../lib/jarvis-auth";
import { ensurePersistentSchema, getPersistentDatabase, type PersistentDatabase } from "../../../lib/persistent-database";
import { readPsmRecord, savePsmRecord, type PsmEntity } from "../../../lib/psm-service";
import type { AuditEvent } from "../../../lib/audit/shared/audit-action";
import { transitionRecommendation, type AuditRecommendation } from "../../../lib/audit/shared/audit-recommendation";
import { recordRecommendationStateBlockRevision } from "../../../lib/audit/audit-service";
import type { JarvisPrincipal } from "../../../lib/jarvis-auth";

export const dynamic = "force-dynamic";

const parse = <T>(value: unknown): T | null => { try { return JSON.parse(String(value)) as T; } catch { return null; } };

async function writeEvent(db: PersistentDatabase, event: AuditEvent) {
  await db.run("INSERT INTO audit_events (id, recommendation_id, account_id, user_id, user_role, event_type, occurred_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [event.id, event.recommendationId, event.accountId, event.userId, event.userRole, event.eventType, event.timestamp, JSON.stringify(event)]);
}

async function writeEventAndRemember(db: PersistentDatabase, event: AuditEvent, principal: JarvisPrincipal, recommendation: AuditRecommendation) {
  await writeEvent(db, event);
  if (event.eventType !== "rollback_requested" && event.eventType !== "rolled_back") await recordRecommendationStateBlockRevision(db, principal, recommendation, event.eventType);
}

async function loadRecommendation(db: PersistentDatabase, id: string) {
  const row = await db.first("SELECT payload FROM audit_recommendations WHERE id = ?", [id]);
  return row ? parse<AuditRecommendation>(row.payload) : null;
}

export async function executeApprovedGardenRecommendation(db: PersistentDatabase, recommendation: AuditRecommendation, principal: JarvisPrincipal) {
  const entity = String(recommendation.proposedPayload.entity || "") as PsmEntity;
  const record = recommendation.proposedPayload.record;
  if (!["workflow", "task", "partnerRequest", "blocker", "weeklyReview", "event"].includes(entity) || !record || typeof record !== "object" || Array.isArray(record)) throw new Error("The approved Garden action payload is invalid.");
  const approvedAt = new Date().toISOString();
  const approved = { ...recommendation, status: "approved" as const };
  try {
    await db.run("UPDATE audit_recommendations SET status = ?, payload = ?, updated_at = ? WHERE id = ?", [approved.status, JSON.stringify(approved), approvedAt, recommendation.id]);
    await writeEventAndRemember(db, { id: `audit-event-${crypto.randomUUID()}`, recommendationId: recommendation.id, accountId: recommendation.accountId, skuId: recommendation.skuId, userId: principal.userId, userRole: principal.role, eventType: "approved", originalProposal: recommendation.proposedPayload, timestamp: approvedAt }, principal, approved);
    const saved = await savePsmRecord(db, entity, record as Record<string, unknown>);
    const confirmed = await readPsmRecord(db, entity, saved.record as unknown as Record<string, unknown>);
    if (!confirmed) throw new Error("The record was written but could not be read back from persistence.");
    const executed = { ...recommendation, status: "executed" as const };
    const completedAt = new Date().toISOString();
    await db.run("UPDATE audit_recommendations SET status = ?, payload = ?, updated_at = ? WHERE id = ?", [executed.status, JSON.stringify(executed), completedAt, recommendation.id]);
    const event: AuditEvent = { id: `audit-event-${crypto.randomUUID()}`, recommendationId: recommendation.id, accountId: recommendation.accountId, skuId: recommendation.skuId, userId: principal.userId, userRole: principal.role, eventType: "executed", originalProposal: recommendation.proposedPayload, timestamp: completedAt, executionResult: { confirmedRecord: confirmed } };
    await writeEventAndRemember(db, event, principal, executed);
    return { recommendation: executed, confirmedRecord: confirmed, event };
  } catch (error) {
    const failed = { ...recommendation, status: "failed" as const };
    const failedAt = new Date().toISOString();
    await db.run("UPDATE audit_recommendations SET status = ?, payload = ?, updated_at = ? WHERE id = ?", [failed.status, JSON.stringify(failed), failedAt, recommendation.id]);
    const message = error instanceof Error ? error.message : "Approved action execution failed.";
    await writeEventAndRemember(db, { id: `audit-event-${crypto.randomUUID()}`, recommendationId: recommendation.id, accountId: recommendation.accountId, skuId: recommendation.skuId, userId: principal.userId, userRole: principal.role, eventType: "failed", originalProposal: recommendation.proposedPayload, timestamp: failedAt, failureReason: message }, principal, failed);
    throw new Error(message);
  }
}

export async function GET(request: Request) {
  const access = await authorizeRequest(request, "read");
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const db = await getPersistentDatabase();
  if (!db) return Response.json({ recommendations: [], events: [], error: "Central storage is required for recommendation history." }, { status: 503 });
  await ensurePersistentSchema(db);
  const url = new URL(request.url);
  const accountId = url.searchParams.get("accountId") || "";
  if (accountId) {
    const scoped = await authorizeRequest(request, "read", accountId);
    if (!scoped.ok) return Response.json({ error: scoped.error }, { status: scoped.status });
  }
  const recommendationRows = accountId ? await db.all("SELECT payload FROM audit_recommendations WHERE account_id = ? ORDER BY updated_at DESC", [accountId]) : await db.all("SELECT payload FROM audit_recommendations ORDER BY updated_at DESC LIMIT 200");
  const eventRows = accountId ? await db.all("SELECT payload FROM audit_events WHERE account_id = ? ORDER BY occurred_at DESC", [accountId]) : await db.all("SELECT payload FROM audit_events ORDER BY occurred_at DESC LIMIT 500");
  return Response.json({ recommendations: recommendationRows.map((row) => parse(row.payload)).filter(Boolean), events: eventRows.map((row) => parse(row.payload)).filter(Boolean) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const input = await request.json().catch(() => ({})) as { operation?: unknown; recommendation?: AuditRecommendation; recommendationId?: unknown; proposedPayload?: Record<string, unknown>; proposedAction?: unknown; rollbackInformation?: unknown };
  const operation = String(input.operation || "");
  const recommendationId = String(input.recommendationId || input.recommendation?.id || "").trim();
  const accountId = String(input.recommendation?.accountId || "").trim();
  const access = await authorizeRequest(request, "write_psm", accountId || undefined);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const db = await getPersistentDatabase();
  if (!db) return Response.json({ error: "Central storage is required. No recommendation or operational record was changed." }, { status: 503 });
  await ensurePersistentSchema(db);
  const now = new Date().toISOString();

  if (operation === "propose") {
    const recommendation = input.recommendation;
    if (!recommendation?.id || !recommendation.accountId || !recommendation.proposedAction || !recommendation.findingId) return Response.json({ error: "A complete evidence-linked recommendation is required." }, { status: 400 });
    const scoped = await authorizeRequest(request, "write_psm", recommendation.accountId);
    if (!scoped.ok) return Response.json({ error: scoped.error }, { status: scoped.status });
    const existing = await loadRecommendation(db, recommendation.id);
    if (existing) return Response.json({ recommendation: existing, alreadyRecorded: true });
    await db.run("INSERT INTO audit_recommendations (id, finding_id, account_id, sku_id, status, required_role, execution_capability, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [recommendation.id, recommendation.findingId, recommendation.accountId, recommendation.skuId || null, "proposed", recommendation.requiredRole, recommendation.executionCapability, JSON.stringify({ ...recommendation, status: "proposed" }), now, now]);
    const event: AuditEvent = { id: `audit-event-${crypto.randomUUID()}`, recommendationId: recommendation.id, accountId: recommendation.accountId, skuId: recommendation.skuId, userId: access.principal.userId, userRole: access.principal.role, eventType: "proposed", originalProposal: recommendation.proposedPayload, timestamp: now };
    const proposed = { ...recommendation, status: "proposed" as const };
    await writeEventAndRemember(db, event, access.principal, proposed);
    return Response.json({ recommendation: proposed, event }, { status: 201 });
  }

  if (!recommendationId) return Response.json({ error: "Recommendation id is required." }, { status: 400 });
  const recommendation = await loadRecommendation(db, recommendationId);
  if (!recommendation) return Response.json({ error: "Recommendation not found." }, { status: 404 });
  const scoped = await authorizeRequest(request, "write_psm", recommendation.accountId);
  if (!scoped.ok) return Response.json({ error: scoped.error }, { status: scoped.status });
  if (operation === "request_rollback") {
    if (!meetsRequiredRole(scoped.principal, "manager")) return Response.json({ error: "A manager must review rollback requests." }, { status: 403 });
    if (!["executed", "failed"].includes(recommendation.status)) return Response.json({ error: "Only an executed or failed recommendation can enter rollback review." }, { status: 409 });
    const rollbackInformation = String(input.rollbackInformation || "").trim();
    if (!rollbackInformation) return Response.json({ error: "Rollback information is required. No rollback was performed." }, { status: 400 });
    const event: AuditEvent = { id: `audit-event-${crypto.randomUUID()}`, recommendationId: recommendation.id, accountId: recommendation.accountId, skuId: recommendation.skuId, userId: scoped.principal.userId, userRole: scoped.principal.role, eventType: "rollback_requested", originalProposal: recommendation.proposedPayload, timestamp: now, rollbackInformation };
    await writeEvent(db, event);
    return Response.json({ ok: true, recommendation, event, rollbackPerformed: false });
  }
  if (!["proposed", "edited"].includes(recommendation.status)) return Response.json({ error: `Recommendation is already ${recommendation.status}.` }, { status: 409 });

  if (operation === "edit") {
    const edited = transitionRecommendation(recommendation, "edit", { proposedPayload: input.proposedPayload, proposedAction: String(input.proposedAction || recommendation.proposedAction) });
    await db.run("UPDATE audit_recommendations SET status = ?, payload = ?, updated_at = ? WHERE id = ?", [edited.status, JSON.stringify(edited), now, recommendation.id]);
    const event: AuditEvent = { id: `audit-event-${crypto.randomUUID()}`, recommendationId: recommendation.id, accountId: recommendation.accountId, skuId: recommendation.skuId, userId: access.principal.userId, userRole: access.principal.role, eventType: "edited", originalProposal: recommendation.proposedPayload, editedProposal: edited.proposedPayload, timestamp: now };
    await writeEventAndRemember(db, event, scoped.principal, edited);
    return Response.json({ recommendation: edited, event });
  }

  if (operation === "cancel" || operation === "reject") {
    const canceled = transitionRecommendation(recommendation, operation);
    await db.run("UPDATE audit_recommendations SET status = ?, payload = ?, updated_at = ? WHERE id = ?", [canceled.status, JSON.stringify(canceled), now, recommendation.id]);
    const event: AuditEvent = { id: `audit-event-${crypto.randomUUID()}`, recommendationId: recommendation.id, accountId: recommendation.accountId, skuId: recommendation.skuId, userId: access.principal.userId, userRole: access.principal.role, eventType: canceled.status, originalProposal: recommendation.proposedPayload, timestamp: now };
    await writeEventAndRemember(db, event, scoped.principal, canceled);
    return Response.json({ recommendation: canceled, event });
  }

  if (operation !== "approve") return Response.json({ error: "Operation must be propose, edit, approve, reject, cancel, or request_rollback." }, { status: 400 });
  if (!meetsRequiredRole(access.principal, recommendation.requiredRole)) return Response.json({ error: `This recommendation requires the ${recommendation.requiredRole} role.` }, { status: 403 });
  if (recommendation.executionCapability !== "garden_psm_write") {
    const approved = { ...recommendation, status: "approved" as const };
    await db.run("UPDATE audit_recommendations SET status = ?, payload = ?, updated_at = ? WHERE id = ?", [approved.status, JSON.stringify(approved), now, recommendation.id]);
    const event: AuditEvent = { id: `audit-event-${crypto.randomUUID()}`, recommendationId: recommendation.id, accountId: recommendation.accountId, skuId: recommendation.skuId, userId: access.principal.userId, userRole: access.principal.role, eventType: "approved", originalProposal: recommendation.proposedPayload, timestamp: now };
    await writeEventAndRemember(db, event, scoped.principal, approved);
    return Response.json({ ok: true, recommendation: approved, event, approvedOnly: true });
  }
  try {
    return Response.json({ ok: true, ...await executeApprovedGardenRecommendation(db, recommendation, scoped.principal) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Approved action execution failed.";
    return Response.json({ error: message }, { status: message.includes("payload is invalid") ? 400 : 503 });
  }
}
