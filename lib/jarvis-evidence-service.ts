import type { JarvisAccountData, JarvisEvidenceItem } from "./jarvis-types";

const todayIso = () => new Date().toISOString().slice(0, 10);

export function isOverdue(dueDate: string, status: string) {
  return Boolean(dueDate && dueDate < todayIso() && !["Completed", "Canceled", "Resolved", "Received"].includes(status));
}

export function accountEvidence(account: JarvisAccountData): JarvisEvidenceItem[] {
  const evidence: JarvisEvidenceItem[] = [];
  const openActions = account.actions.filter((item) => item.status !== "completed");
  const openTasks = account.tasks.filter((item) => !["Completed", "Canceled"].includes(item.status));
  const openBlockers = account.blockers.filter((item) => !["Resolved", "Canceled"].includes(item.status));
  const waiting = account.partnerRequests.filter((item) => ["Open", "Waiting"].includes(item.status));

  for (const action of openActions) evidence.push({ type: "action", label: `Open action: ${action.title}`, detail: action.detail || "This checklist action is still open.", accountId: account.id, sourceId: action.id, severity: "warning", timestamp: action.createdAt });
  for (const task of openTasks) evidence.push({ type: "task", label: `${isOverdue(task.dueDate, task.status) ? "Overdue" : "Open"} task: ${task.title}`, detail: `${task.status}${task.dueDate ? ` · due ${task.dueDate}` : " · no due date"}${task.owner ? ` · ${task.owner}` : ""}`, accountId: account.id, sourceId: task.id, severity: isOverdue(task.dueDate, task.status) || task.priority === "Critical" ? "critical" : "warning", timestamp: task.updatedAt });
  for (const blocker of openBlockers) evidence.push({ type: "blocker", label: `Blocker: ${blocker.title}`, detail: `${blocker.category} · ${blocker.responsibleParty} · ${blocker.status}`, accountId: account.id, sourceId: blocker.id, severity: "critical", timestamp: blocker.updatedAt });
  for (const request of waiting) evidence.push({ type: "partner_request", label: `Partner request: ${request.title}`, detail: `${request.status}${request.dueDate ? ` · due ${request.dueDate}` : ""}${request.blocksAccount ? " · blocks account" : ""}`, accountId: account.id, sourceId: request.id, severity: request.blocksAccount || isOverdue(request.dueDate, request.status) ? "critical" : "warning", timestamp: request.updatedAt });
  for (const report of account.missingReports) evidence.push({ type: "report", label: `Missing report: ${report}`, detail: account.selectedPeriod ? `Not received for ${account.selectedPeriod.label}.` : "No weekly reporting period is available for this account.", accountId: account.id, severity: "warning" });
  for (const note of account.selectedPeriod?.dataQuality || []) evidence.push({ type: "data_quality", label: "Data quality note", detail: note, accountId: account.id, severity: "warning", timestamp: account.selectedPeriod?.generatedAt });

  const review = account.weeklyReviews.find((item) => !account.selectedPeriod || item.periodId === account.selectedPeriod.id);
  if (!review) evidence.push({ type: "review", label: "Weekly review not saved", detail: account.selectedPeriod ? `No PSM weekly review exists for ${account.selectedPeriod.label}.` : "No weekly review is available because this account has no reporting period.", accountId: account.id, severity: "warning" });
  else evidence.push({ type: "review", label: `Weekly review: ${review.status}`, detail: `${review.weekStart || "Week start not set"} to ${review.weekEnd || "week end not set"}.`, accountId: account.id, sourceId: review.id, severity: review.status === "Completed" ? "info" : "warning", timestamp: review.updatedAt });

  if (account.workflow) evidence.push({ type: "account", label: `${account.workflow.healthStatus} account health`, detail: account.workflow.healthReason || `Lifecycle stage: ${account.workflow.stage}.`, accountId: account.id, sourceId: account.id, severity: account.workflow.healthStatus === "Critical" ? "critical" : account.workflow.healthStatus === "At risk" ? "warning" : "info", timestamp: account.workflow.updatedAt });
  else evidence.push({ type: "account", label: `${account.name} account status`, detail: `Garden currently marks this account as ${account.status}. No PSM health reason is saved.`, accountId: account.id, sourceId: account.id, severity: account.status === "critical" ? "critical" : account.status === "attention" ? "warning" : "info" });
  if (account.freshnessTimestamp) evidence.push({ type: "data_freshness", label: "Latest confirmed account activity", detail: `Latest imported or saved account evidence is dated ${account.freshnessTimestamp}.`, accountId: account.id, severity: "info", timestamp: account.freshnessTimestamp });
  if (account.selectedPeriod) evidence.push({ type: "import", label: `Reporting period: ${account.selectedPeriod.label}`, detail: `${account.selectedPeriod.reports.length} recognized report type${account.selectedPeriod.reports.length === 1 ? "" : "s"} loaded.`, accountId: account.id, sourceId: account.selectedPeriod.id, severity: account.missingReports.length ? "warning" : "info", timestamp: account.selectedPeriod.generatedAt });
  if (account.skus.length) evidence.push({ type: "sku", label: `${account.skus.length} active SKU${account.skus.length === 1 ? "" : "s"}`, detail: "Counted from the Garden account SKU directory.", accountId: account.id, severity: "info" });
  return evidence;
}

export function evidenceByType(account: JarvisAccountData, types: JarvisEvidenceItem["type"][]) {
  return accountEvidence(account).filter((item) => types.includes(item.type));
}
