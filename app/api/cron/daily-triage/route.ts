import { runPortfolioTriage } from "../../../../lib/audit/audit-service";
import type { JarvisPrincipal } from "../../../../lib/jarvis-auth";
import { ensurePersistentSchema, getPersistentDatabase } from "../../../../lib/persistent-database";

export const dynamic = "force-dynamic";

function equal(left: string, right: string) {
  const a = new TextEncoder().encode(left), b = new TextEncoder().encode(right);
  let mismatch = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) mismatch |= (a[index] || 0) ^ (b[index] || 0);
  return mismatch === 0;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!secret || !equal(bearer, secret)) return Response.json({ error: "Daily triage cron authorization failed." }, { status: 401 });
  const db = await getPersistentDatabase();
  if (!db) return Response.json({ error: "Central storage is required for daily triage." }, { status: 503 });
  await ensurePersistentSchema(db);
  const principal: JarvisPrincipal = { userId: "jarvis-daily-triage", name: "JARVIS Daily Triage", role: "administrator", accountIds: "*" };
  try { return Response.json(await runPortfolioTriage(db, principal), { status: 201 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Daily triage failed." }, { status: 503 }); }
}
