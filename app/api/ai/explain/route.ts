import { getJarvisAiProvider, validateAiExplanation, type AiExplanationRequest } from "../../../../lib/ai/provider";
import { authorizeRequest } from "../../../../lib/jarvis-auth";

export async function POST(request: Request) {
  const input = await request.json().catch(() => ({})) as AiExplanationRequest;
  const access = await authorizeRequest(request, "read", String(input.accountId || ""));
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  if (!input.question || !Array.isArray(input.evidence) || !input.evidence.length) return Response.json({ error: "AI explanations require a question and retrieved evidence." }, { status: 400 });
  const provider = getJarvisAiProvider();
  if (!provider) return Response.json({ error: "No approved server-side AI provider is enabled. Deterministic analysis remains available." }, { status: 503 });
  try {
    return Response.json(validateAiExplanation(await provider.explain(input), input.evidence));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "AI explanation failed evidence validation." }, { status: 503 });
  }
}
