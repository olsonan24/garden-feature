import type { CommunicationSource, IntegrationStatus } from "./types";

export const SLACK_REQUIRED_SCOPES = ["channels:history", "groups:history", "chat:write"];
const token = () => process.env.SLACK_BOT_TOKEN?.trim() || "";
const headers = () => ({ authorization: `Bearer ${token()}`, "content-type": "application/json; charset=utf-8" });

export async function slackStatus(fetcher: typeof fetch = fetch): Promise<IntegrationStatus> {
  if (!token()) return { provider: "slack", state: "not-configured", detail: "SLACK_BOT_TOKEN is not configured on the server.", scopes: SLACK_REQUIRED_SCOPES };
  try {
    const response = await fetcher("https://slack.com/api/auth.test", { method: "POST", headers: headers(), cache: "no-store" });
    const body = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
    if (body.error === "invalid_auth" || body.error === "token_expired" || body.error === "account_inactive") return { provider: "slack", state: "expired-token", detail: `Slack rejected the token: ${body.error}.`, scopes: SLACK_REQUIRED_SCOPES, verifiedAt: new Date().toISOString() };
    if (!response.ok || !body.ok) return { provider: "slack", state: "error", detail: `Slack status check failed: ${body.error || response.status}.`, scopes: SLACK_REQUIRED_SCOPES, verifiedAt: new Date().toISOString() };
    return { provider: "slack", state: "connected", detail: "Authenticated Slack API status check succeeded.", scopes: SLACK_REQUIRED_SCOPES, verifiedAt: new Date().toISOString() };
  } catch (error) {
    return { provider: "slack", state: "disconnected", detail: error instanceof Error ? error.message : "Slack could not be reached.", scopes: SLACK_REQUIRED_SCOPES, verifiedAt: new Date().toISOString() };
  }
}

export async function retrieveSlackSources(query: string, fetcher: typeof fetch = fetch): Promise<CommunicationSource[]> {
  if (!token()) throw new Error("Slack is not configured.");
  const channels = (process.env.SLACK_CHANNEL_IDS || "").split(",").map((value) => value.trim()).filter(Boolean);
  if (!channels.length) throw new Error("SLACK_CHANNEL_IDS has no permitted channels.");
  const sources: CommunicationSource[] = [];
  for (const channel of channels) {
    const params = new URLSearchParams({ channel, limit: "100" });
    const response = await fetcher(`https://slack.com/api/conversations.history?${params}`, { headers: headers(), cache: "no-store" });
    const body = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; messages?: Array<{ ts: string; user?: string; text?: string; client_msg_id?: string }> };
    if (!response.ok || !body.ok) throw new Error(`Slack history failed for ${channel}: ${body.error || response.status}.`);
    for (const message of body.messages || []) if (!query || message.text?.toLowerCase().includes(query.toLowerCase())) sources.push({ id: message.client_msg_id || message.ts, provider: "slack", title: `Slack message in ${channel}`, author: message.user || "Unknown Slack user", timestamp: new Date(Number(message.ts.split(".")[0]) * 1000).toISOString(), excerpt: message.text || "", sourceReference: `slack:${channel}:${message.ts}` });
  }
  return sources.sort((left, right) => right.timestamp.localeCompare(left.timestamp)).slice(0, 50);
}

export async function postSlackMessage(input: { channel: string; text: string; threadTs?: string }, fetcher: typeof fetch = fetch) {
  if (!token()) throw new Error("Slack is not configured.");
  const permitted = new Set((process.env.SLACK_CHANNEL_IDS || "").split(",").map((value) => value.trim()).filter(Boolean));
  if (!permitted.has(input.channel)) throw new Error("The requested Slack channel is not in SLACK_CHANNEL_IDS.");
  const response = await fetcher("https://slack.com/api/chat.postMessage", { method: "POST", headers: headers(), body: JSON.stringify({ channel: input.channel, text: input.text, thread_ts: input.threadTs }) });
  const body = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; channel?: string; ts?: string };
  if (!response.ok || !body.ok) throw new Error(`Slack post failed: ${body.error || response.status}.`);
  return body;
}
