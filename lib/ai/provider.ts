import type { AuditEvidence } from "../audit/shared/audit-evidence";

export type AiExplanationRequest = {
  accountId: string;
  question: string;
  evidence: AuditEvidence[];
  allowedActions: string[];
};

export type AiExplanationResponse = {
  explanation: string;
  evidenceIds: string[];
  proposedActions: Array<{ action: string; requiresApproval: true }>;
};

export interface JarvisAiProvider {
  readonly name: string;
  explain(request: AiExplanationRequest): Promise<AiExplanationResponse>;
}

export function getJarvisAiProvider(): JarvisAiProvider | null {
  return null;
}

export function aiProviderStatus() {
  const requestedProvider = process.env.JARVIS_AI_PROVIDER?.trim();
  const hasKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  if (!requestedProvider && !hasKey) return { state: "not-configured" as const, provider: null, detail: "No approved server-side AI provider is configured. The deterministic command and audit engines remain active." };
  return { state: "configured-not-verified" as const, provider: requestedProvider || "openai", detail: "AI configuration was detected, but no provider adapter is enabled in this release. No AI request will be made." };
}

export function validateAiExplanation(response: AiExplanationResponse, evidence: AuditEvidence[]) {
  const allowed = new Set(evidence.map((item) => item.id));
  if (!response.evidenceIds.length || response.evidenceIds.some((id) => !allowed.has(id))) throw new Error("AI explanation did not cite only retrieved evidence.");
  if (response.proposedActions.some((action) => action.requiresApproval !== true)) throw new Error("AI action bypassed the approval requirement.");
  return response;
}
