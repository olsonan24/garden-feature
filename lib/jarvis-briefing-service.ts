import { accountEvidence, isOverdue } from "./jarvis-evidence-service";
import type {
  JarvisAccountData,
  JarvisBriefing,
  JarvisDataContext,
  JarvisEvidenceItem,
  JarvisMissionItem,
  JarvisMissionQueue,
  JarvisMissionSectionKey,
  JarvisSuggestedAction,
} from "./jarvis-types";

const emptyQueue = (): JarvisMissionQueue => ({ dueToday: [], overdue: [], blocked: [], waitingOnPartner: [], missingReports: [], needsReview: [], criticalAccounts: [] });
const todayIso = () => new Date().toISOString().slice(0, 10);

function missionItem(section: JarvisMissionSectionKey, account: JarvisAccountData, id: string, label: string, detail: string, evidence: JarvisEvidenceItem[], severity: JarvisMissionItem["severity"]): JarvisMissionItem {
  return { id, section, label, detail, accountId: account.id, accountName: account.name, severity, evidence };
}

export function buildMissionQueue(data: JarvisDataContext, accountId?: string): JarvisMissionQueue {
  const queue = emptyQueue();
  const accounts = accountId ? data.accounts.filter((account) => account.id === accountId) : data.accounts;
  for (const account of accounts) {
    const evidence = accountEvidence(account);
    for (const task of account.tasks.filter((item) => !["Completed", "Canceled"].includes(item.status))) {
      const itemEvidence = evidence.filter((item) => item.sourceId === task.id);
      if (task.dueDate === todayIso()) queue.dueToday.push(missionItem("dueToday", account, task.id, task.title, `${task.owner || "Unassigned"} · ${task.status}`, itemEvidence, task.priority === "Critical" ? "critical" : "warning"));
      if (isOverdue(task.dueDate, task.status)) queue.overdue.push(missionItem("overdue", account, task.id, task.title, `Due ${task.dueDate} · ${task.owner || "Unassigned"}`, itemEvidence, task.priority === "Critical" ? "critical" : "warning"));
      if (task.status === "Blocked") queue.blocked.push(missionItem("blocked", account, task.id, task.title, task.blockedReason || "Task is marked blocked without a saved reason.", itemEvidence, "critical"));
      if (task.status === "Waiting on partner") queue.waitingOnPartner.push(missionItem("waitingOnPartner", account, task.id, task.title, task.notes || "Task is waiting on the partner.", itemEvidence, "warning"));
    }
    for (const blocker of account.blockers.filter((item) => !["Resolved", "Canceled"].includes(item.status))) {
      const itemEvidence = evidence.filter((item) => item.sourceId === blocker.id);
      queue.blocked.push(missionItem("blocked", account, blocker.id, blocker.title, `${blocker.category} · ${blocker.responsibleParty}`, itemEvidence, "critical"));
    }
    for (const request of account.partnerRequests.filter((item) => ["Open", "Waiting"].includes(item.status))) {
      const itemEvidence = evidence.filter((item) => item.sourceId === request.id);
      queue.waitingOnPartner.push(missionItem("waitingOnPartner", account, request.id, request.title, `${request.status}${request.dueDate ? ` · due ${request.dueDate}` : ""}`, itemEvidence, request.blocksAccount ? "critical" : "warning"));
    }
    for (const report of account.missingReports) {
      const itemEvidence = evidence.filter((item) => item.type === "report" && item.label.endsWith(report));
      queue.missingReports.push(missionItem("missingReports", account, `${account.id}:report:${report}`, report, account.selectedPeriod?.label || "No reporting period", itemEvidence, "warning"));
    }
    const review = account.weeklyReviews.find((item) => !account.selectedPeriod || item.periodId === account.selectedPeriod.id);
    if (!review || review.status !== "Completed") {
      const itemEvidence = evidence.filter((item) => item.type === "review");
      queue.needsReview.push(missionItem("needsReview", account, `${account.id}:review`, `${account.name} weekly review`, review ? "Draft is not completed." : "No review is saved for the selected week.", itemEvidence, "warning"));
    }
    if (["Critical", "At risk"].includes(account.workflow?.healthStatus || "") || account.status === "critical") {
      const itemEvidence = evidence.filter((item) => item.type === "account");
      queue.criticalAccounts.push(missionItem("criticalAccounts", account, `${account.id}:health`, account.name, account.workflow?.healthReason || `Account status is ${account.workflow?.healthStatus || account.status}.`, itemEvidence, account.workflow?.healthStatus === "Critical" || account.status === "critical" ? "critical" : "warning"));
    }
  }
  return queue;
}

function topSuggestedActions(account: JarvisAccountData, evidence: JarvisEvidenceItem[]): JarvisSuggestedAction[] {
  const actions: JarvisSuggestedAction[] = [];
  const blocker = account.blockers.find((item) => !["Resolved", "Canceled"].includes(item.status));
  if (blocker) actions.push({ id: `escalate:${blocker.id}`, type: "escalate_blocker", label: `Prepare escalation for ${blocker.title}`, accountId: account.id, accountName: account.name, reason: blocker.resolutionNotes || blocker.notes || "An unresolved blocker is holding work.", evidence: evidence.filter((item) => item.sourceId === blocker.id), proposedFields: { title: `Escalate: ${blocker.title}`, category: blocker.category, responsibleParty: blocker.responsibleParty, status: "Open", notes: blocker.notes || "Prepared by JARVIS for approval." }, requiresApproval: true });
  if (account.missingReports.length) actions.push({ id: `imports:${account.id}`, type: "open_import_center", label: "Review missing reports", accountId: account.id, accountName: account.name, reason: `${account.missingReports.length} weekly report type${account.missingReports.length === 1 ? " is" : "s are"} missing.`, evidence: evidence.filter((item) => item.type === "report"), requiresApproval: false });
  const review = account.weeklyReviews.find((item) => !account.selectedPeriod || item.periodId === account.selectedPeriod.id);
  if (!review || review.status !== "Completed") actions.push({ id: `review:${account.id}`, type: "start_weekly_review", label: review ? "Continue weekly review" : "Start weekly review", accountId: account.id, accountName: account.name, reason: review ? "The selected review remains a draft." : "No PSM review exists for the selected period.", evidence: evidence.filter((item) => item.type === "review"), requiresApproval: false });
  return actions.slice(0, 4);
}

export function buildAccountBriefing(data: JarvisDataContext, accountId: string): JarvisBriefing {
  const account = data.accounts.find((item) => item.id === accountId);
  if (!account) return { scope: "account", title: "Account not found", summary: "The selected account is not present in Garden's loaded account data.", status: "empty", evidence: [], suggestedActions: [], missionQueue: emptyQueue(), dataWarnings: ["Account data is unavailable."] };
  const evidence = accountEvidence(account);
  const critical = evidence.filter((item) => item.severity === "critical").length;
  const warnings = evidence.filter((item) => item.severity === "warning").length;
  const openTasks = account.tasks.filter((item) => !["Completed", "Canceled"].includes(item.status)).length;
  const openActions = account.actions.filter((item) => item.status !== "completed").length;
  const blockers = account.blockers.filter((item) => !["Resolved", "Canceled"].includes(item.status)).length;
  const requests = account.partnerRequests.filter((item) => ["Open", "Waiting"].includes(item.status)).length;
  const parts = [`${openTasks} open task${openTasks === 1 ? "" : "s"}`, `${openActions} open action${openActions === 1 ? "" : "s"}`, `${blockers} blocker${blockers === 1 ? "" : "s"}`, `${requests} partner request${requests === 1 ? "" : "s"}`, `${account.missingReports.length} missing report${account.missingReports.length === 1 ? "" : "s"}`];
  const nextAction = account.workflow?.nextAction ? ` Saved next action: ${account.workflow.nextAction}` : "";
  const dataWarnings = [data.demoData ? "Demo data is active; recommendations are not production evidence." : "", !account.selectedPeriod ? "No reporting period is loaded for this account." : "", ...account.selectedPeriod?.dataQuality || []].filter(Boolean);
  return {
    scope: "account",
    title: `${account.name} briefing`,
    summary: `${account.name} currently has ${parts.join(", ")}.${nextAction}`,
    status: critical ? "critical" : warnings ? "attention" : evidence.length ? "operational" : "empty",
    evidence,
    suggestedActions: topSuggestedActions(account, evidence),
    missionQueue: buildMissionQueue(data, account.id),
    dataWarnings,
  };
}

export function buildPortfolioBriefing(data: JarvisDataContext): JarvisBriefing {
  if (!data.accounts.length) return { scope: "portfolio", title: "Portfolio briefing", summary: "No accounts are loaded. Add or restore an account before JARVIS can build a mission queue.", status: "empty", evidence: [], suggestedActions: [], missionQueue: emptyQueue(), dataWarnings: ["No account data is available."] };
  const queue = buildMissionQueue(data);
  const evidence = data.accounts.flatMap(accountEvidence);
  const critical = queue.criticalAccounts.length + queue.blocked.filter((item) => item.severity === "critical").length;
  const totalMissions = Object.values(queue).reduce((total, items) => total + items.length, 0);
  const suggestedActions = data.accounts.flatMap((account) => topSuggestedActions(account, accountEvidence(account))).slice(0, 5);
  return {
    scope: "portfolio",
    title: "Portfolio mission briefing",
    summary: `${data.accounts.length} account${data.accounts.length === 1 ? "" : "s"} loaded with ${totalMissions} evidence-backed mission item${totalMissions === 1 ? "" : "s"}. ${critical ? `${critical} critical item${critical === 1 ? " requires" : "s require"} attention.` : "No critical account or blocker evidence is currently recorded."}`,
    status: critical ? "critical" : totalMissions ? "attention" : "operational",
    evidence,
    suggestedActions,
    missionQueue: queue,
    dataWarnings: [data.demoData ? "Demo data is active; portfolio findings are sample-only and read-only." : ""].filter(Boolean),
  };
}

function bullets(value: string, fallback: string) {
  const rows = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  return rows.length ? rows.map((item) => `- ${item}`).join("\n") : `- ${fallback}`;
}

export function draftWeeklyPartnerUpdate(account: JarvisAccountData) {
  const review = account.weeklyReviews.find((item) => !account.selectedPeriod || item.periodId === account.selectedPeriod.id) || account.weeklyReviews[0];
  const completed = account.tasks.filter((item) => item.status === "Completed").map((item) => item.title).join("\n");
  const open = account.tasks.filter((item) => !["Completed", "Canceled"].includes(item.status)).map((item) => item.title).join("\n") || account.actions.filter((item) => item.status !== "completed").map((item) => item.title).join("\n");
  const blockers = account.blockers.filter((item) => !["Resolved", "Canceled"].includes(item.status)).map((item) => item.title).join("\n");
  const requests = account.partnerRequests.filter((item) => ["Open", "Waiting"].includes(item.status)).map((item) => item.title).join("\n");
  const nextActions = review?.nextActions || account.workflow?.nextAction || "No next action has been saved yet.";
  return `Weekly update — ${account.name}\n${account.selectedPeriod?.label || "Reporting period not available"}\n\nCompleted this week\n${bullets(review?.completedWork || completed, "No completed work is recorded.")}\n\nIn progress / next\n${bullets(review?.nextActions || open || nextActions, "No open action is recorded.")}\n\nBlockers\n${bullets(review?.openBlockers || blockers, "No open blockers are recorded.")}\n\nWaiting on partner\n${bullets(review?.partnerRequests || requests, "No open partner requests are recorded.")}\n\nReports and data\n${account.missingReports.length ? bullets(account.missingReports.join("\n"), "") : "- The required weekly report set is present for the selected period."}\n\nStatus\n- ${account.workflow?.healthStatus || account.status}${account.workflow?.healthReason ? `: ${account.workflow.healthReason}` : ""}\n\nThis is an editable draft. Review it before sending; JARVIS has not contacted the partner.`;
}

