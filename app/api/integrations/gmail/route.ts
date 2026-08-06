import { authorizeRequest } from "../../../../lib/jarvis-auth";
import { createGmailDraft, retrieveGmailSources, sendGmailDraft } from "../../../../lib/integrations/gmail";
import { recordExternalExecution, requireApprovedExternalRecommendation } from "../../../../lib/integrations/audit";
import { ensurePersistentSchema, getPersistentDatabase } from "../../../../lib/persistent-database";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const accountId = url.searchParams.get("accountId") || "";
  const access = await authorizeRequest(request, "read", accountId || undefined);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  try {
    const sources = await retrieveGmailSources(url.searchParams.get("query") || "newer_than:30d");
    return Response.json({ sources, summary: { count: sources.length, generatedFromSourceReferences: true } }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Gmail messages could not be retrieved.", sources: [] }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const input = await request.json().catch(() => ({})) as { action?: unknown; accountId?: unknown; recommendationId?: unknown; approved?: unknown; to?: unknown; subject?: unknown; body?: unknown; draftId?: unknown };
  const accountId = String(input.accountId || "").trim();
  const access = await authorizeRequest(request, "send_external", accountId);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  if (input.approved !== true) return Response.json({ error: "Explicit approval is required. No Gmail action was performed." }, { status: 409 });
  const db = await getPersistentDatabase();
  if (!db) return Response.json({ error: "Central audit storage is required before Gmail actions." }, { status: 503 });
  await ensurePersistentSchema(db);
  const action = String(input.action || "");
  const capability = action === "create_draft" ? "gmail_draft" : "gmail_send";
  const recommendation = await requireApprovedExternalRecommendation(db, String(input.recommendationId || ""), capability, accountId).catch(() => null);
  if (!recommendation) return Response.json({ error: "A matching approved Gmail recommendation is required." }, { status: 409 });
  try {
    const result = action === "create_draft"
      ? await createGmailDraft({ to: String(input.to || "").trim(), subject: String(input.subject || "").trim(), body: String(input.body || "") })
      : action === "send_draft" ? await sendGmailDraft(String(input.draftId || "").trim()) : null;
    if (!result) return Response.json({ error: "Use action=create_draft or action=send_draft." }, { status: 400 });
    await recordExternalExecution(db, recommendation, access.principal, { gmailResult: result });
    return Response.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail action failed.";
    await recordExternalExecution(db, recommendation, access.principal, undefined, message);
    return Response.json({ error: message }, { status: 503 });
  }
}
