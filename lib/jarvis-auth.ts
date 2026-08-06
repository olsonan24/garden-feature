const COOKIE_NAME = "jarvis_session";
const SESSION_CONTEXT = "jarvis-dashboard-session-v1";

type AuthEnv = { JARVIS_PASSCODE?: string };

import { getCloudflareRuntime } from "./cloudflare-runtime";

async function getPasscode(): Promise<string | null> {
  const processPasscode = process.env.JARVIS_PASSCODE?.trim();
  if (processPasscode) return processPasscode;

  const runtime = await getCloudflareRuntime<AuthEnv>();
  return runtime?.JARVIS_PASSCODE?.trim() || null;
}

async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return mismatch === 0;
}

async function expectedSession(): Promise<string> {
  const passcode = await getPasscode();
  if (!passcode) throw new Error("JARVIS_PASSCODE is not configured");
  return digest(`${SESSION_CONTEXT}:${passcode}`);
}

export async function verifyPasscode(candidate: string): Promise<boolean> {
  const passcode = await getPasscode();
  return Boolean(passcode) && constantTimeEqual(candidate, passcode!);
}

export async function isAuthorizedCookie(cookieHeader: string | null): Promise<boolean> {
  if (!(await getPasscode())) return true;
  const session = cookieValue(cookieHeader, COOKIE_NAME);
  if (!session) return false;
  return constantTimeEqual(session, await expectedSession());
}

export async function isAuthorizedRequest(request: Request): Promise<boolean> {
  if (process.env.NODE_ENV === "development") return true;
  if (!(await getPasscode())) return true;
  return isAuthorizedCookie(request.headers.get("cookie"));
}

export async function hasConfiguredWriteAuth(): Promise<boolean> {
  if (process.env.NODE_ENV === "development") return true;
  return Boolean(await getPasscode());
}

export async function isAuthorizedWriteRequest(request: Request): Promise<boolean> {
  if (process.env.NODE_ENV === "development") return true;
  if (!(await getPasscode())) return false;
  return isAuthorizedCookie(request.headers.get("cookie"));
}

export async function sessionCookie(): Promise<string> {
  const value = await expectedSession();
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`;
}

export function clearedSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
