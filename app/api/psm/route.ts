import { hasConfiguredWriteAuth, isAuthorizedRequest, isAuthorizedWriteRequest } from "../../../lib/jarvis-auth";
import { ensurePersistentSchema, getPersistentDatabase, storageLabel } from "../../../lib/persistent-database";
import { emptyPsmState, type StorageStatus } from "../../../lib/psm-types";
import { loadPsmState, savePsmRecord, type PsmEntity } from "../../../lib/psm-service";

export const dynamic = "force-dynamic";

function unavailableStorage(): StorageStatus {
  return {
    mode: process.env.VERCEL ? "unavailable" : "demo",
    writable: false,
    label: process.env.VERCEL ? "Central storage not configured" : "Demo data",
    detail: process.env.VERCEL
      ? "Connect DATABASE_URL to enable shared PSM records on this deployment."
      : "This environment has no central database. Core PSM changes are disabled.",
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
    const writable = await hasConfiguredWriteAuth();
    const storage: StorageStatus = { mode: db.kind, writable, label: storageLabel(db.kind), detail: writable ? "Shared team data is saved centrally." : "Set JARVIS_PASSCODE before enabling production writes." };
    return Response.json(await loadPsmState(db, storage), { headers: { "cache-control": "no-store", "x-jarvis-storage": db.kind } });
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
    const db = await getPersistentDatabase();
    if (!db) return Response.json({ error: "Central storage is not configured. No changes were saved." }, { status: 503 });
    await ensurePersistentSchema(db);
    const saved = await savePsmRecord(db, entity, input.record as Record<string, unknown>);
    return Response.json({ ok: true, ...saved }, { status: 200, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The record could not be saved.";
    const status = /required|invalid|must use|unless|when/.test(message) ? 400 : 503;
    return Response.json({ error: message }, { status });
  }
}
