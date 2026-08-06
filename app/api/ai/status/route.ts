import { aiProviderStatus } from "../../../../lib/ai/provider";
import { authorizeRequest } from "../../../../lib/jarvis-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await authorizeRequest(request, "read");
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  return Response.json(aiProviderStatus(), { headers: { "cache-control": "no-store" } });
}
