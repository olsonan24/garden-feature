import type { PeriodPayload } from "./analyze-reports";
import type { JarvisAccountData, JarvisDataAdapterInput, JarvisDataContext } from "./jarvis-types";

export const JARVIS_WEEKLY_REPORTS = [
  "SKU Economics",
  "Business Report by Child ASIN",
  "Advertised Product",
  "Search Term",
  "Targeting",
  "Placement",
  "Manage FBA Inventory",
] as const;

function newestPeriod(periods: PeriodPayload[]) {
  return [...periods].filter((period) => period.kind === "weekly").sort((left, right) => right.endDate.localeCompare(left.endDate))[0];
}

function latestTimestamp(values: Array<string | undefined | null>) {
  return values.filter((value): value is string => Boolean(value)).sort((left, right) => right.localeCompare(left))[0];
}

export function adaptJarvisData(input: JarvisDataAdapterInput): JarvisDataContext {
  const accounts: JarvisAccountData[] = input.accounts.map((account) => {
    const periods = input.periods.filter((period) => period.accountId === account.id).sort((left, right) => right.endDate.localeCompare(left.endDate));
    const selectedPeriod = periods.find((period) => period.id === input.currentPeriodId) || newestPeriod(periods);
    const imports = input.imports.filter((item) => item.accountId === account.id);
    const workflow = input.psm.workflows.find((item) => item.accountId === account.id);
    const tasks = input.psm.tasks.filter((item) => item.accountId === account.id);
    const blockers = input.psm.blockers.filter((item) => item.accountId === account.id);
    const partnerRequests = input.psm.partnerRequests.filter((item) => item.accountId === account.id);
    const weeklyReviews = input.psm.weeklyReviews.filter((item) => item.accountId === account.id).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const events = input.psm.events.filter((item) => item.accountId === account.id).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    const reportNames = new Set(selectedPeriod?.reports || []);

    return {
      ...account,
      skus: input.skus.filter((sku) => sku.accountId === account.id),
      periods,
      selectedPeriod,
      imports,
      actions: input.actions.filter((item) => item.accountId === account.id),
      workflow,
      tasks,
      blockers,
      partnerRequests,
      weeklyReviews,
      events,
      missingReports: selectedPeriod ? JARVIS_WEEKLY_REPORTS.filter((report) => !reportNames.has(report)) : [...JARVIS_WEEKLY_REPORTS],
      freshnessTimestamp: latestTimestamp([
        selectedPeriod?.generatedAt,
        workflow?.updatedAt,
        imports[0]?.receivedAt,
        weeklyReviews[0]?.updatedAt,
        events[0]?.occurredAt,
      ]),
    };
  });

  const currentAccount = accounts.find((account) => account.id === input.currentAccountId);
  return {
    accounts,
    currentAccount,
    currentPeriod: currentAccount?.selectedPeriod,
    storage: input.storage,
    psm: input.psm,
    demoData: input.storage.mode === "demo" || input.psm.storage.mode === "demo",
    generatedAt: new Date().toISOString(),
  };
}

