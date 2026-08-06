import { authorizeRequest } from "../../../../lib/jarvis-auth";
import { gmailStatus } from "../../../../lib/integrations/gmail";
import { slackStatus } from "../../../../lib/integrations/slack";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await authorizeRequest(request, "read");
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const [gmail, slack] = await Promise.all([gmailStatus(), slackStatus()]);
  return Response.json({ gmail, slack }, { headers: { "cache-control": "no-store" } });
}
