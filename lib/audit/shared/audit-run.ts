import type { AuditFinding } from "./audit-finding";
import type { DataReadiness } from "./data-readiness";
import type { AuditRuleVersion } from "./audit-versioning";

export type AuditRun = {
  id: string;
  accountId?: string;
  auditType: "portfolio-triage" | "account-deep" | "sku-performance" | "ppc-growth-operator";
  versions: AuditRuleVersion;
  startedAt: string;
  completedAt: string;
  createdBy: string;
  dataWindowStart?: string;
  dataWindowEnd?: string;
  status: "completed" | "partial" | "failed";
  dataReadiness: DataReadiness;
  sourceReports: string[];
  sourceAccountStateBlockVersion?: number;
  errorState?: string;
  findings: AuditFinding[];
  metadata?: Record<string, unknown>;
};
