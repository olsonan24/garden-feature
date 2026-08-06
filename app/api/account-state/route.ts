import { accountStateBlockHistory, createManualAccountStateBlockRevision } from "../../../lib/audit/audit-service";
import type { AccountStateBlockManualUpdate } from "../../../lib/audit/shared/account-state-block";
import { authorizeRequest } from "../../../lib/jarvis-auth";
import { ensurePersistentSchema, getPersistentDatabase } from "../../../lib/persistent-database";

export const dynamic = "force-dynamic";

const editableArrayFields = ["pricingChanges", "promotionChanges", "listingChanges", "reviewIssues", "campaignChanges", "brandTerms", "harvestedKeywords", "negatives", "doNotRepeatRecommendationIds"] as const;

function safeStringArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 500);
}

function safeNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function manualUpdate(value: unknown): AccountStateBlockManualUpdate {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const update: AccountStateBlockManualUpdate = {};
  if (typeof input.assignedPsm === "string") update.assignedPsm = input.assignedPsm.trim().slice(0, 200);
  if (typeof input.lifecyclePhase === "string") update.lifecyclePhase = input.lifecyclePhase.trim().slice(0, 200);
  for (const field of editableArrayFields) {
    const items = safeStringArray(input[field]);
    if (items) update[field] = items;
  }
  if (input.assumptions && typeof input.assumptions === "object") {
    const assumptions = input.assumptions as Record<string, unknown>;
    const cogs = assumptions.cogs && typeof assumptions.cogs === "object"
      ? Object.fromEntries(Object.entries(assumptions.cogs as Record<string, unknown>).map(([skuId, amount]) => [skuId, safeNumber(amount)]).filter((entry): entry is [string, number] => entry[1] !== undefined))
      : undefined;
    update.assumptions = {
      ...(cogs ? { cogs } : {}),
      ...Object.fromEntries(["margin", "acosGoal", "tacosGoal", "revenueTarget", "profitTarget"].map((field) => [field, safeNumber(assumptions[field])]).filter((entry): entry is [string, number] => entry[1] !== undefined)),
    };
  }
  return update;
}

export async function GET(request: Request) {
  const accountId = new URL(request.url).searchParams.get("accountId")?.trim() || "";
  if (!accountId) return Response.json({ error: "accountId is required." }, { status: 400 });
  const access = await authorizeRequest(request, "read", accountId);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const db = await getPersistentDatabase();
  if (!db) return Response.json({ error: "Central storage is required for Account State Block history.", history: [] }, { status: 503 });
  try {
    await ensurePersistentSchema(db);
    const history = await accountStateBlockHistory(db, access.principal, accountId);
    return Response.json({ current: history[0] || null, history }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Account State Block history could not be loaded." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { accountId?: unknown; update?: unknown };
  const accountId = String(body.accountId || "").trim();
  if (!accountId) return Response.json({ error: "accountId is required." }, { status: 400 });
  const access = await authorizeRequest(request, "write_psm", accountId);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const update = manualUpdate(body.update);
  if (!Object.keys(update).length) return Response.json({ error: "No supported Account State Block fields were provided." }, { status: 400 });
  const db = await getPersistentDatabase();
  if (!db) return Response.json({ error: "Central storage is required before account memory can be saved." }, { status: 503 });
  try {
    await ensurePersistentSchema(db);
    const block = await createManualAccountStateBlockRevision(db, access.principal, accountId, update);
    return Response.json({ ok: true, block, readBackConfirmed: true }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Account State Block revision could not be saved." }, { status: 503 });
  }
}
