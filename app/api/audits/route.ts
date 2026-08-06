import { authorizeRequest } from "../../../lib/jarvis-auth";
import { latestAuditHistory, latestPortfolioRankings, runDeepAccountAudit, runPortfolioTriage } from "../../../lib/audit/audit-service";
import { ensurePersistentSchema, getPersistentDatabase } from "../../../lib/persistent-database";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await authorizeRequest(request, "read");
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const db = await getPersistentDatabase();
  if (!db) return Response.json({ error: "Central storage is required for immutable audit history.", history: [], latestPortfolio: null }, { status: 503 });
  try {
    await ensurePersistentSchema(db);
    const url = new URL(request.url);
    const accountId = url.searchParams.get("accountId") || undefined;
    const [history, latestPortfolio] = await Promise.all([latestAuditHistory(db, access.principal, accountId), latestPortfolioRankings(db, access.principal)]);
    return Response.json({ history, latestPortfolio }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Audit history could not be loaded." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { scope?: unknown; accountId?: unknown };
  const scope = String(body.scope || "portfolio");
  const accountId = String(body.accountId || "").trim();
  const access = await authorizeRequest(request, "write_psm", scope === "account" ? accountId : undefined);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const db = await getPersistentDatabase();
  if (!db) return Response.json({ error: "Central storage is required before an audit can be saved." }, { status: 503 });
  try {
    await ensurePersistentSchema(db);
    if (scope === "portfolio") return Response.json(await runPortfolioTriage(db, access.principal), { status: 201, headers: { "cache-control": "no-store" } });
    if (scope === "account" && accountId) return Response.json(await runDeepAccountAudit(db, access.principal, accountId), { status: 201, headers: { "cache-control": "no-store" } });
    return Response.json({ error: "Use scope=portfolio or provide scope=account with an accountId." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The audit failed before completion." }, { status: 503 });
  }
}
