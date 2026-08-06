import { authorizeRequest, canAccessAccount, hasCapability, hasConfiguredWriteAuth, isAuthorizedRequest, isAuthorizedWriteRequest, publicPrincipal } from "../../../lib/jarvis-auth";
import { ensurePersistentSchema, getPersistentDatabase, storageLabel } from "../../../lib/persistent-database";
import { emptyPsmState, type StorageStatus } from "../../../lib/psm-types";
import { loadPsmState, readPsmRecord, savePsmRecord, type PsmEntity } from "../../../lib/psm-service";

export const dynamic = "force-dynamic";

function unavailableStorage(): StorageStatus {
  const demo = process.env.NODE_ENV !== "production" && process.env.ENABLE_DEMO_DATA === "true";
  return {
    mode: demo ? "demo" : "unavailable",
    writable: false,
    label: demo ? "Development demo mode" : "Central storage not configured",
    detail: demo
      ? "Explicit development demo mode is active; no PSM changes can be saved."
      : "Connect DATABASE_URL or a D1 binding to load and save shared PSM records.",
  };
}

export async function GET(request: Request) {
  if (!(await isAuthorizedRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const db = await getPersistentDatabase();
    if (!db) {
      const storage = unavailableStorage();
      return Response.json(emptyPsmState(storage), { headers: { "cache-control": "no-store", "x-jarvis-storage": storage.mode } });
    }
    await ensurePersistentSchema(db);
    const access = await authorizeRequest(request, "read");
    if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
    const writable = await hasConfiguredWriteAuth() && hasCapability(access.principal, "write_psm");
    const storage: StorageStatus = { mode: db.kind, writable, label: storageLabel(db.kind), detail: writable ? "Shared team data is saved centrally." : "Set JARVIS_PASSCODE before enabling production writes." };
    const state = await loadPsmState(db, storage);
    const scoped = <T extends { accountId: string }>(items: T[]) => items.filter((item) => canAccessAccount(access.principal, item.accountId));
    return Response.json({ ...state, workflows: scoped(state.workflows), tasks: scoped(state.tasks), partnerRequests: scoped(state.partnerRequests), blockers: scoped(state.blockers), weeklyReviews: scoped(state.weeklyReviews), events: scoped(state.events), principal: publicPrincipal(access.principal) }, { headers: { "cache-control": "no-store", "x-jarvis-storage": db.kind } });
  } catch (error) {
    return Response.json({ ...emptyPsmState(unavailableStorage()), error: error instanceof Error ? error.message : "PSM data could not be loaded." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

export async function POST(request: Request) {
  if (!(await isAuthorizedWriteRequest(request))) return Response.json({ error: "Protected writes require a configured JARVIS_PASSCODE and an authenticated session." }, { status: 401 });
  try {
    const input = await request.json() as { entity?: unknown; record?: unknown };
    const entity = String(input.entity || "") as PsmEntity;
    if (!["workflow", "task", "partnerRequest", "blocker", "weeklyReview", "event"].includes(entity)) return Response.json({ error: "Unknown PSM record type." }, { status: 400 });
    if (!input.record || typeof input.record !== "object" || Array.isArray(input.record)) return Response.json({ error: "A record payload is required." }, { status: 400 });
    const accountId = String((input.record as Record<string, unknown>).accountId || "").trim();
    const access = await authorizeRequest(request, "write_psm", accountId);
    if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
    const db = await getPersistentDatabase();
    if (!db) return Response.json({ error: "Central storage is not configured. No changes were saved." }, { status: 503 });
    await ensurePersistentSchema(db);
    const saved = await savePsmRecord(db, entity, input.record as Record<string, unknown>);
    const confirmedRecord = await readPsmRecord(db, entity, saved.record as unknown as Record<string, unknown>);
    if (!confirmedRecord) return Response.json({ error: "The record was written but could not be confirmed by reading it back." }, { status: 503 });
    return Response.json({ ok: true, ...saved, confirmedRecord }, { status: 200, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The record could not be saved.";
    const status = /required|invalid|must use|unless|when/.test(message) ? 400 : 503;
    return Response.json({ error: message }, { status });
  }
}
