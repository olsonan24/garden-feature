import { getCloudflareRuntime } from "./cloudflare-runtime";

const COOKIE_NAME = "jarvis_session";
const SESSION_CONTEXT = "jarvis-dashboard-session-v2";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

export const USER_ROLES = ["psm", "manager", "administrator", "read-only"] as const;
export type UserRole = typeof USER_ROLES[number];
export type JarvisCapability = "read" | "write_psm" | "import_reports" | "approve" | "send_external" | "admin";

export type JarvisPrincipal = {
  userId: string;
  name: string;
  email?: string;
  role: UserRole;
  accountIds: "*" | string[];
};

type ConfiguredUser = JarvisPrincipal & { passcode: string };
type AuthEnv = {
  JARVIS_PASSCODE?: string;
  JARVIS_SESSION_SECRET?: string;
  JARVIS_USERS_JSON?: string;
  JARVIS_DEFAULT_USER_ID?: string;
  JARVIS_DEFAULT_USER_NAME?: string;
  JARVIS_DEFAULT_USER_ROLE?: string;
};

type SessionPayload = JarvisPrincipal & { expiresAt: number };

const roleCapabilities: Record<UserRole, ReadonlySet<JarvisCapability>> = {
  "read-only": new Set(["read"]),
  psm: new Set(["read", "write_psm", "import_reports"]),
  manager: new Set(["read", "write_psm", "import_reports", "approve", "send_external"]),
  administrator: new Set(["read", "write_psm", "import_reports", "approve", "send_external", "admin"]),
};

async function authEnvironment(): Promise<AuthEnv> {
  const runtime = await getCloudflareRuntime<AuthEnv>();
  return {
    JARVIS_PASSCODE: process.env.JARVIS_PASSCODE || runtime?.JARVIS_PASSCODE,
    JARVIS_SESSION_SECRET: process.env.JARVIS_SESSION_SECRET || runtime?.JARVIS_SESSION_SECRET,
    JARVIS_USERS_JSON: process.env.JARVIS_USERS_JSON || runtime?.JARVIS_USERS_JSON,
    JARVIS_DEFAULT_USER_ID: process.env.JARVIS_DEFAULT_USER_ID || runtime?.JARVIS_DEFAULT_USER_ID,
    JARVIS_DEFAULT_USER_NAME: process.env.JARVIS_DEFAULT_USER_NAME || runtime?.JARVIS_DEFAULT_USER_NAME,
    JARVIS_DEFAULT_USER_ROLE: process.env.JARVIS_DEFAULT_USER_ROLE || runtime?.JARVIS_DEFAULT_USER_ROLE,
  };
}

function validRole(value: unknown): UserRole {
  return USER_ROLES.includes(String(value) as UserRole) ? String(value) as UserRole : "read-only";
}

function configuredUsers(env: AuthEnv): ConfiguredUser[] {
  if (env.JARVIS_USERS_JSON?.trim()) {
    try {
      const parsed = JSON.parse(env.JARVIS_USERS_JSON) as Array<Record<string, unknown>>;
      if (!Array.isArray(parsed)) throw new Error("JARVIS_USERS_JSON must be an array.");
      return parsed.map((item, index) => {
        const passcode = String(item.passcode || "").trim();
        if (!passcode) throw new Error(`JARVIS_USERS_JSON user ${index + 1} has no passcode.`);
        const configuredAccounts = item.accountIds === "*" ? "*" : Array.isArray(item.accountIds) ? item.accountIds.map(String).filter(Boolean) : [];
        return {
          userId: String(item.userId || item.id || `user-${index + 1}`),
          name: String(item.name || item.email || `User ${index + 1}`),
          email: item.email ? String(item.email) : undefined,
          role: validRole(item.role),
          accountIds: configuredAccounts,
          passcode,
        };
      });
    } catch (error) {
      throw new Error(error instanceof Error ? `Invalid JARVIS_USERS_JSON: ${error.message}` : "Invalid JARVIS_USERS_JSON.");
    }
  }

  const passcode = env.JARVIS_PASSCODE?.trim();
  if (!passcode) return [];
  return [{
    userId: env.JARVIS_DEFAULT_USER_ID?.trim() || "jarvis-admin",
    name: env.JARVIS_DEFAULT_USER_NAME?.trim() || "JARVIS Administrator",
    role: validRole(env.JARVIS_DEFAULT_USER_ROLE || "administrator"),
    accountIds: "*",
    passcode,
  }];
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function signingKey(env: AuthEnv) {
  const users = configuredUsers(env);
  const secret = env.JARVIS_SESSION_SECRET?.trim() || env.JARVIS_PASSCODE?.trim() || users.map((user) => `${user.userId}:${user.passcode}`).join("|");
  if (!secret) return null;
  return crypto.subtle.importKey("raw", new TextEncoder().encode(`${SESSION_CONTEXT}:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function encodeSession(principal: JarvisPrincipal) {
  const env = await authEnvironment();
  const key = await signingKey(env);
  if (!key) throw new Error("JARVIS authentication is not configured.");
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ ...principal, expiresAt: Date.now() + SESSION_SECONDS * 1000 } satisfies SessionPayload)));
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

async function decodeSession(value: string | null): Promise<JarvisPrincipal | null> {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const env = await authEnvironment();
  const key = await signingKey(env);
  if (!key || !(await crypto.subtle.verify("HMAC", key, base64UrlToBytes(signature), new TextEncoder().encode(payload)))) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as SessionPayload;
    if (!parsed.userId || !parsed.expiresAt || parsed.expiresAt <= Date.now()) return null;
    const users = configuredUsers(env);
    const configured = users.find((user) => user.userId === parsed.userId);
    if (!configured) return null;
    return { userId: configured.userId, name: configured.name, email: configured.email, role: configured.role, accountIds: configured.accountIds };
  } catch {
    return null;
  }
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

const developmentPrincipal: JarvisPrincipal = { userId: "local-developer", name: "Local Developer", role: "administrator", accountIds: "*" };
const anonymousPrincipal: JarvisPrincipal = { userId: "anonymous-read-only", name: "Read-only user", role: "read-only", accountIds: "*" };

export async function authenticatePasscode(candidate: string): Promise<JarvisPrincipal | null> {
  const users = configuredUsers(await authEnvironment());
  const match = users.find((user) => constantTimeEqual(candidate, user.passcode));
  if (!match) return null;
  return { userId: match.userId, name: match.name, email: match.email, role: match.role, accountIds: match.accountIds };
}

export async function verifyPasscode(candidate: string): Promise<boolean> {
  return Boolean(await authenticatePasscode(candidate));
}

export async function getRequestPrincipal(request?: Request): Promise<JarvisPrincipal> {
  if (process.env.NODE_ENV === "development") return developmentPrincipal;
  const users = configuredUsers(await authEnvironment());
  if (!users.length) return anonymousPrincipal;
  const cookie = request ? request.headers.get("cookie") : null;
  return await decodeSession(cookieValue(cookie, COOKIE_NAME)) || anonymousPrincipal;
}

export function hasCapability(principal: JarvisPrincipal, capability: JarvisCapability) {
  return roleCapabilities[principal.role].has(capability);
}

export function canAccessAccount(principal: JarvisPrincipal, accountId: string) {
  return principal.accountIds === "*" || principal.accountIds.includes(accountId);
}

export function meetsRequiredRole(principal: JarvisPrincipal, requiredRole: "psm" | "manager" | "administrator") {
  const rank: Record<UserRole, number> = { "read-only": 0, psm: 1, manager: 2, administrator: 3 };
  return rank[principal.role] >= rank[requiredRole];
}

export async function authorizeRequest(request: Request, capability: JarvisCapability, accountId?: string) {
  const principal = await getRequestPrincipal(request);
  if (principal.userId === "anonymous-read-only" && configuredUsers(await authEnvironment()).length) return { ok: false as const, status: 401, principal, error: "Authentication is required." };
  if (!hasCapability(principal, capability)) return { ok: false as const, status: principal.userId === "anonymous-read-only" ? 401 : 403, principal, error: `The ${principal.role} role cannot perform this action.` };
  if (accountId && !canAccessAccount(principal, accountId)) return { ok: false as const, status: 403, principal, error: "This user is not assigned to the requested account." };
  return { ok: true as const, status: 200, principal };
}

export async function isAuthorizedCookie(cookieHeader: string | null): Promise<boolean> {
  if (process.env.NODE_ENV === "development") return true;
  const users = configuredUsers(await authEnvironment());
  if (!users.length) return true;
  return Boolean(await decodeSession(cookieValue(cookieHeader, COOKIE_NAME)));
}

export async function isAuthorizedRequest(request: Request): Promise<boolean> {
  const principal = await getRequestPrincipal(request);
  if (principal.userId === "anonymous-read-only" && configuredUsers(await authEnvironment()).length) return false;
  return hasCapability(principal, "read");
}

export async function hasConfiguredWriteAuth(): Promise<boolean> {
  if (process.env.NODE_ENV === "development") return true;
  return configuredUsers(await authEnvironment()).some((user) => user.role !== "read-only");
}

export async function isAuthorizedWriteRequest(request: Request): Promise<boolean> {
  return hasCapability(await getRequestPrincipal(request), "write_psm");
}

export async function sessionCookie(principal: JarvisPrincipal): Promise<string> {
  const value = await encodeSession(principal);
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}

export function clearedSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function publicPrincipal(principal: JarvisPrincipal) {
  return { userId: principal.userId, name: principal.name, email: principal.email, role: principal.role, accountIds: principal.accountIds };
}
