import type { ReportSummary } from "../../../report-parser";
import type { AuditAccountInput } from "../../shared/audit-input";
import { currentAndPreviousPeriods } from "../../shared/audit-input";
import { buildDataReadiness } from "../../shared/data-readiness";

export const PPC_GROWTH_OPERATOR_MISSING_SOURCES = [
  "references/asb-memory.md",
  "references/playbooks.md",
  "references/intent.md",
  "references/str-process.md",
  "references/output-template.md",
] as const;

function reportFor(input: AuditAccountInput, periodId: string | undefined, type: ReportSummary["type"]) {
  return input.reports.find((source) => source.periodId === periodId && source.summary.type === type);
}

export function auditPpcGrowthOperator(input: AuditAccountInput, auditRunId: string) {
  const { current } = currentAndPreviousPeriods(input);
  const str = reportFor(input, current?.id, "Search Term");
  const targeting = reportFor(input, current?.id, "Targeting");
  const sqp = reportFor(input, current?.id, "Search Query Performance");
  const hasInventory = Boolean(current?.reports.includes("Manage FBA Inventory"));
  const readiness = buildDataReadiness([
    { available: false, issue: { code: "missing_ppc_operator_references", field: "Amazon PPC Growth Operator reference files", message: "The PPC doctrine is available, but its deterministic operator references are not.", whyItMatters: "Waste, harvest, negative, bid, intent, phase, and campaign-build rules cannot be reproduced accurately from the top-level skill alone.", blockedRecommendation: "PPC operator findings and recommendations", resolution: `Provide the original skill package containing ${PPC_GROWTH_OPERATOR_MISSING_SOURCES.join(", ")}.`, severity: "blocking" } },
    { available: Boolean(str), issue: { code: "missing_str", field: "Search Term Report", message: "STR proof is missing.", whyItMatters: "Search-term waste, harvest, negatives, and bid decisions require STR as the lead evidence source.", blockedRecommendation: "PPC execution recommendations", resolution: "Upload the Search Term Report for the selected period.", severity: "blocking" } },
    { available: Boolean(targeting), issue: { code: "missing_targeting", field: "Targeting Report", message: "Targeting support is missing.", whyItMatters: "Current targets and bids cannot be cross-checked.", resolution: "Upload the Targeting Report.", severity: "warning" } },
    { available: hasInventory, issue: { code: "missing_inventory_gate", field: "Manage FBA Inventory", message: "Inventory is unknown.", whyItMatters: "Aggressive ad scaling is unsafe without inventory coverage.", blockedRecommendation: "ad scaling", resolution: "Upload Manage FBA Inventory.", severity: "warning" } },
  ]);
  void auditRunId;
  return {
    readiness,
    findings: [],
    doctrine: {
      lead: "STR",
      support: ["SQP", "Cerebro"],
      sqpAvailable: Boolean(sqp),
      sourceStatus: "partial" as const,
      missingSources: [...PPC_GROWTH_OPERATOR_MISSING_SOURCES],
    },
  };
}
