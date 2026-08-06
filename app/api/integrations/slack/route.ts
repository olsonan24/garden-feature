import { authorizeRequest } from "../../../../lib/jarvis-auth";
import { postSlackMessage, retrieveSlackSources } from "../../../../lib/integrations/slack";
import { recordExternalExecution, requireApprovedExternalRecommendation } from "../../../../lib/integrations/audit";
import { ensurePersistentSchema, getPersistentDatabase } from "../../../../lib/persistent-database";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const accountId = url.searchParams.get("accountId") || "";
  const access = await authorizeRequest(request, "read", accountId || undefined);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  try {
    const sources = await retrieveSlackSources(url.searchParams.get("query") || "");
    return Response.json({ sources, summary: { count: sources.length, generatedFromSourceReferences: true } }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Slack messages could not be retrieved.", sources: [] }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const input = await request.json().catch(() => ({})) as { accountId?: unknown; recommendationId?: unknown; approved?: unknown; channel?: unknown; text?: unknown; threadTs?: unknown };
  const accountId = String(input.accountId || "").trim();
  const access = await authorizeRequest(request, "send_external", accountId);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  if (input.approved !== true) return Response.json({ error: "Explicit approval is required. No Slack message was posted." }, { status: 409 });
  const db = await getPersistentDatabase();
  if (!db) return Response.json({ error: "Central audit storage is required before Slack actions." }, { status: 503 });
  await ensurePersistentSchema(db);
  const recommendation = await requireApprovedExternalRecommendation(db, String(input.recommendationId || ""), "slack_post", accountId).catch(() => null);
  if (!recommendation) return Response.json({ error: "A matching approved Slack recommendation is required." }, { status: 409 });
  try {
    const result = await postSlackMessage({ channel: String(input.channel || "").trim(), text: String(input.text || ""), threadTs: String(input.threadTs || "").trim() || undefined });
    await recordExternalExecution(db, recommendation, access.principal, { slackResult: result });
    return Response.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Slack post failed.";
    await recordExternalExecution(db, recommendation, access.principal, undefined, message);
    return Response.json({ error: message }, { status: 503 });
  }
}
