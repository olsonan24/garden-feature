export type AuditConfidence = "low" | "medium" | "high";

export function confidenceFromCompleteness(completeness: number, directEvidence = true): AuditConfidence {
  if (!directEvidence || completeness < 0.5) return "low";
  if (completeness < 0.8) return "medium";
  return "high";
}
