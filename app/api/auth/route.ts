import { clearedSessionCookie, isAuthorizedRequest, sessionCookie, verifyPasscode } from "../../../lib/jarvis-auth";

export async function GET(request: Request) {
  try {
    return Response.json({ authenticated: await isAuthorizedRequest(request) });
  } catch {
    return Response.json({ authenticated: false }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { passcode?: unknown };
    const passcode = String(body.passcode ?? "");
    if (!(await verifyPasscode(passcode))) {
      return Response.json({ error: "That passcode is not correct." }, { status: 401 });
    }
    return new Response(JSON.stringify({ authenticated: true }), {
      status: 200,
      headers: { "content-type": "application/json", "set-cookie": await sessionCookie(), "cache-control": "no-store" },
    });
  } catch {
    return Response.json({ error: "The Garden could not verify the passcode." }, { status: 500 });
  }
}

export async function DELETE() {
  return new Response(JSON.stringify({ authenticated: false }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": clearedSessionCookie(), "cache-control": "no-store" },
  });
}

