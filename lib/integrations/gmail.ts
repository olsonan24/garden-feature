import type { CommunicationSource, IntegrationStatus } from "./types";

export const GMAIL_REQUIRED_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"];

const token = () => process.env.GMAIL_ACCESS_TOKEN?.trim() || "";
const headers = () => ({ authorization: `Bearer ${token()}`, "content-type": "application/json" });

function encodedMessage(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function gmailStatus(fetcher: typeof fetch = fetch): Promise<IntegrationStatus> {
  if (!token()) return { provider: "gmail", state: "not-configured", detail: "GMAIL_ACCESS_TOKEN is not configured on the server.", scopes: GMAIL_REQUIRED_SCOPES };
  try {
    const response = await fetcher("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: headers(), cache: "no-store" });
    if (response.status === 401) return { provider: "gmail", state: "expired-token", detail: "The Gmail token was rejected or expired.", scopes: GMAIL_REQUIRED_SCOPES, verifiedAt: new Date().toISOString() };
    if (!response.ok) return { provider: "gmail", state: "error", detail: `Gmail status check failed with HTTP ${response.status}.`, scopes: GMAIL_REQUIRED_SCOPES, verifiedAt: new Date().toISOString() };
    return { provider: "gmail", state: "connected", detail: "Authenticated Gmail API status check succeeded.", scopes: GMAIL_REQUIRED_SCOPES, verifiedAt: new Date().toISOString() };
  } catch (error) {
    return { provider: "gmail", state: "disconnected", detail: error instanceof Error ? error.message : "Gmail could not be reached.", scopes: GMAIL_REQUIRED_SCOPES, verifiedAt: new Date().toISOString() };
  }
}

export async function retrieveGmailSources(query: string, fetcher: typeof fetch = fetch): Promise<CommunicationSource[]> {
  if (!token()) throw new Error("Gmail is not configured.");
  const search = new URLSearchParams({ maxResults: "20", q: query || process.env.GMAIL_DEFAULT_QUERY || "newer_than:30d" });
  const list = await fetcher(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${search}`, { headers: headers(), cache: "no-store" });
  if (list.status === 401) throw new Error("Gmail token is expired or invalid.");
  if (!list.ok) throw new Error(`Gmail message lookup failed with HTTP ${list.status}.`);
  const body = await list.json() as { messages?: Array<{ id: string; threadId: string }> };
  const messages = await Promise.all((body.messages || []).slice(0, 20).map(async (item) => {
    const response = await fetcher(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, { headers: headers(), cache: "no-store" });
    if (!response.ok) return null;
    const message = await response.json() as { id: string; threadId: string; snippet?: string; internalDate?: string; payload?: { headers?: Array<{ name: string; value: string }> } };
    const header = (name: string) => message.payload?.headers?.find((value) => value.name.toLowerCase() === name.toLowerCase())?.value || "";
    return { id: message.id, provider: "gmail" as const, title: header("Subject") || "No subject", author: header("From") || "Unknown sender", timestamp: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : header("Date"), excerpt: message.snippet || "", sourceReference: `gmail:message:${message.id}`, sourceUrl: `https://mail.google.com/mail/u/0/#inbox/${message.id}` };
  }));
  return messages.filter((message): message is NonNullable<typeof message> => message !== null);
}

export async function createGmailDraft(input: { to: string; subject: string; body: string }, fetcher: typeof fetch = fetch) {
  if (!token()) throw new Error("Gmail is not configured.");
  const raw = encodedMessage(`To: ${input.to}\r\nSubject: ${input.subject}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${input.body}`);
  const response = await fetcher("https://gmail.googleapis.com/gmail/v1/users/me/drafts", { method: "POST", headers: headers(), body: JSON.stringify({ message: { raw } }) });
  if (!response.ok) throw new Error(response.status === 401 ? "Gmail token is expired or invalid." : `Gmail draft creation failed with HTTP ${response.status}.`);
  return response.json() as Promise<{ id: string; message?: { id?: string; threadId?: string } }>;
}

export async function sendGmailDraft(draftId: string, fetcher: typeof fetch = fetch) {
  if (!token()) throw new Error("Gmail is not configured.");
  const response = await fetcher("https://gmail.googleapis.com/gmail/v1/users/me/drafts/send", { method: "POST", headers: headers(), body: JSON.stringify({ id: draftId }) });
  if (!response.ok) throw new Error(response.status === 401 ? "Gmail token is expired or invalid." : `Gmail send failed with HTTP ${response.status}.`);
  return response.json() as Promise<{ id: string; threadId?: string }>;
}
