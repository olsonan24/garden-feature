import type { DashboardSku, PeriodPayload } from "../../analyze-reports";
import type { PsmState } from "../../psm-types";
import type { ReportSummary } from "../../report-parser";
import type { AccountStateBlock } from "./account-state-block";

export type AuditReportSource = { rawImportId: string; periodId: string; summary: ReportSummary };

export type AuditAccountInput = {
  account: { id: string; name: string; status: string };
  skus: DashboardSku[];
  periods: PeriodPayload[];
  psm: PsmState;
  reports: AuditReportSource[];
  stateBlock?: AccountStateBlock;
};

export function currentAndPreviousPeriods(input: AuditAccountInput) {
  const periods = input.periods.filter((period) => period.accountId === input.account.id && period.kind === "weekly").sort((left, right) => right.endDate.localeCompare(left.endDate));
  return { current: periods[0], previous: periods[1] };
}
