import { authenticatePasscode, clearedSessionCookie, getRequestPrincipal, isAuthorizedRequest, publicPrincipal, sessionCookie } from "../../../lib/jarvis-auth";

export async function GET(request: Request) {
  try {
    const authenticated = await isAuthorizedRequest(request);
    const principal = await getRequestPrincipal(request);
    return Response.json({ authenticated, principal: publicPrincipal(principal) });
  } catch {
    return Response.json({ authenticated: false }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { passcode?: unknown };
    const passcode = String(body.passcode ?? "");
    const principal = await authenticatePasscode(passcode);
    if (!principal) {
      return Response.json({ error: "That passcode is not correct." }, { status: 401 });
    }
    return new Response(JSON.stringify({ authenticated: true, principal: publicPrincipal(principal) }), {
      status: 200,
      headers: { "content-type": "application/json", "set-cookie": await sessionCookie(principal), "cache-control": "no-store" },
    });
  } catch {
    return Response.json({ error: "JARVIS could not verify the passcode." }, { status: 500 });
  }
}

export async function DELETE() {
  return new Response(JSON.stringify({ authenticated: false }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": clearedSessionCookie(), "cache-control": "no-store" },
  });
}
