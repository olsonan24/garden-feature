import type { AuditConfidence } from "./audit-confidence";
import type { AuditEvidence } from "./audit-evidence";
import type { AuditRecommendation } from "./audit-recommendation";

export type AuditFinding = {
  id: string;
  auditRunId: string;
  accountId: string;
  skuId?: string;
  asin?: string;
  parentAsin?: string;
  productFamily?: string;
  severity: "info" | "warning" | "critical";
  category: string;
  title: string;
  explanation: string;
  currentValue?: number | string | null;
  comparisonValue?: number | string | null;
  dollarImpact?: number;
  timeWindow: string;
  confidence: AuditConfidence;
  dataCompleteness: number;
  evidence: AuditEvidence[];
  recommendation?: AuditRecommendation;
};
