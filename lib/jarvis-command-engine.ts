import { buildAccountBriefing, buildMissionQueue, buildPortfolioBriefing, draftWeeklyPartnerUpdate } from "./jarvis-briefing-service";
import { evidenceByType, isOverdue } from "./jarvis-evidence-service";
import type {
  JarvisAccountData,
  JarvisAccountMatch,
  JarvisCommandIntent,
  JarvisCommandResult,
  JarvisDataContext,
  JarvisEvidenceItem,
  JarvisSuggestedAction,
} from "./jarvis-types";

const normalize = (value: string) => value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

function levenshtein(left: string, right: string) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = row[0];
    row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const previous = row[rightIndex];
      row[rightIndex] = Math.min(row[rightIndex] + 1, row[rightIndex - 1] + 1, diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1));
      diagonal = previous;
    }
  }
  return row[right.length];
}

function accountScore(query: string, name: string) {
  const cleanQuery = normalize(query);
  const cleanName = normalize(name);
  if (!cleanQuery || !cleanName) return 0;
  if (cleanQuery === cleanName) return 1;
  if (cleanName.includes(cleanQuery) || cleanQuery.includes(cleanName)) return Math.min(.96, .82 + Math.min(cleanQuery.length, cleanName.length) / Math.max(cleanQuery.length, cleanName.length) * .14);
  const queryTokens = new Set(cleanQuery.split(" "));
  const nameTokens = cleanName.split(" ");
  const tokenScore = nameTokens.filter((token) => queryTokens.has(token)).length / Math.max(nameTokens.length, queryTokens.size);
  const compactQuery = cleanQuery.replace(/ /g, "");
  const compactName = cleanName.replace(/ /g, "");
  const editScore = 1 - levenshtein(compactQuery, compactName) / Math.max(compactQuery.length, compactName.length);
  return Math.max(tokenScore * .9, editScore);
}

export function findJarvisAccount(query: string, accounts: JarvisAccountData[]): JarvisAccountMatch {
  const ranked = accounts.map((account) => ({ account, score: accountScore(query, account.name) })).sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best || best.score < .58) return { status: "not_found", score: best?.score || 0 };
  const close = ranked.filter((item) => item.score >= .58 && best.score - item.score < .08);
  if (close.length > 1 && best.score < .97) return { status: "multiple", accounts: close.map((item) => item.account), score: best.score };
  return { status: "matched", account: best.account, score: best.score };
}

function baseResult(intent: JarvisCommandIntent, response: string, options: Partial<JarvisCommandResult> = {}): JarvisCommandResult {
  return { intent, confidence: .94, response, evidence: [], suggestedActions: [], requiresApproval: false, ...options };
}

function accountFromPhrase(phrase: string, data: JarvisDataContext, allowCurrent: boolean): JarvisAccountMatch | { status: "current"; account: JarvisAccountData } | { status: "missing" } {
  const cleaned = phrase.replace(/^(account\s+|for\s+|on\s+)/i, "").replace(/[?.!]+$/, "").trim();
  if (cleaned) return findJarvisAccount(cleaned, data.accounts);
  if (allowCurrent && data.currentAccount) return { status: "current", account: data.currentAccount };
  return { status: "missing" };
}

function accountResolutionError(intent: JarvisCommandIntent, match: ReturnType<typeof accountFromPhrase>): JarvisCommandResult | null {
  if (match.status === "not_found") return baseResult(intent, "I could not match that name to a loaded Garden account. Try the full account name or open Help for examples.", { confidence: match.score, error: "Account not found." });
  if (match.status === "multiple") return baseResult(intent, `I found multiple possible accounts: ${match.accounts.map((account) => account.name).join(", ")}. Please use the full account name.`, { confidence: match.score, evidence: match.accounts.map((account) => ({ type: "account" as const, label: account.name, detail: "Possible account match", accountId: account.id, severity: "info" as const })), error: "Multiple account matches." });
  if (match.status === "missing") return baseResult(intent, "Select an account or include an account name so I can use the correct Garden context.", { confidence: .7, error: "No current account selected." });
  return null;
}

function resolvedAccount(match: ReturnType<typeof accountFromPhrase>) {
  return match.status === "matched" || match.status === "current" ? match.account : undefined;
}

function evidenceSummary(items: JarvisEvidenceItem[], empty: string) {
  if (!items.length) return empty;
  const critical = items.filter((item) => item.severity === "critical").length;
  return `${items.length} evidence item${items.length === 1 ? "" : "s"} found${critical ? `, including ${critical} critical` : ""}.`;
}

function accountNavigation(account: JarvisAccountData) {
  return { targetAccountId: account.id, targetAccountName: account.name, navigation: { view: "accounts" as const, accountId: account.id } };
}

function makeTaskProposal(account: JarvisAccountData, title: string, evidence: JarvisEvidenceItem[]): JarvisSuggestedAction {
  return {
    id: `task-proposal:${account.id}:${Date.now()}`,
    type: "create_task",
    label: title,
    accountId: account.id,
    accountName: account.name,
    reason: evidence[0]?.detail || "Prepared from the current account context. Confirm the fields before saving.",
    evidence: evidence.slice(0, 5),
    proposedFields: { title, owner: account.workflow?.psmOwner || "Unassigned", responsibleParty: "Angora", dueDate: "", priority: evidence.some((item) => item.severity === "critical") ? "Critical" : "Normal", status: "Not started", notes: "Prepared by JARVIS for explicit approval.", source: "Manual entry" },
    requiresApproval: true,
  };
}

export function executeJarvisCommand(command: string, data: JarvisDataContext): JarvisCommandResult {
  const raw = command.trim();
  const query = normalize(raw.replace(/^hey[, ]+jarvis[, ]*/i, ""));
  if (!raw) return baseResult("UNKNOWN_COMMAND", "Enter a command, such as “take me to CaldwellMKH” or “show the mission queue.”", { confidence: 0, error: "Command is empty." });

  if (/^(open |show )?(settings|preferences)$/.test(query)) return baseResult("OPEN_SETTINGS", "Opening JARVIS settings. Future integrations remain clearly labeled until an administrator configures them.", { navigation: { view: "jarvis" } });
  if (/^(help|open help|show help|what can you do|commands|open commands|show commands)$/.test(query)) return baseResult("SHOW_HELP", "Try: “take me to [account]”, “analyze [account]”, “show blockers”, “show overdue tasks”, “show missing reports”, “draft weekly update”, “start weekly review”, “create task [title]”, or “open settings.” Data-changing proposals always require approval.");

  const navigation = raw.match(/^(?:hey[, ]+jarvis[, ]*)?(?:(?:take me to|pull up|go to)\s+|open\s+(?!help\b|commands?\b|settings\b|preferences\b|(?:the\s+)?weekly\s+review\b|mission\b|blockers?\b|overdue\b|missing\s+reports?\b))(.+)$/i);
  if (navigation) {
    const match = accountFromPhrase(navigation[1], data, false);
    const error = accountResolutionError("NAVIGATE_ACCOUNT", match);
    if (error) return error;
    const account = resolvedAccount(match)!;
    const briefing = buildAccountBriefing(data, account.id);
    return baseResult("NAVIGATE_ACCOUNT", `Navigating to ${account.name}. ${briefing.summary}`, { confidence: match.status === "matched" ? match.score : 1, ...accountNavigation(account), evidence: briefing.evidence, suggestedActions: briefing.suggestedActions });
  }

  const analyze = raw.match(/^(?:hey[, ]+jarvis[, ]*)?(?:analyze|analyse|brief me on|what needs attention(?:\s+(?:for|on))?|what should i do next(?:\s+(?:for|on))?)\s*(.*)$/i);
  if (analyze) {
    const match = accountFromPhrase(analyze[1], data, true);
    if (match.status === "missing") {
      const briefing = buildPortfolioBriefing(data);
      return baseResult("SHOW_MISSION_QUEUE", `${briefing.summary} Select an account for an account-specific briefing.`, { evidence: briefing.evidence, suggestedActions: briefing.suggestedActions });
    }
    const error = accountResolutionError("ANALYZE_ACCOUNT", match);
    if (error) return error;
    const account = resolvedAccount(match)!;
    const briefing = buildAccountBriefing(data, account.id);
    return baseResult("ANALYZE_ACCOUNT", briefing.summary, { confidence: match.status === "matched" ? match.score : .98, targetAccountId: account.id, targetAccountName: account.name, navigation: match.status === "matched" ? { view: "accounts", accountId: account.id } : undefined, evidence: briefing.evidence, suggestedActions: briefing.suggestedActions });
  }

  if (/mission|portfolio queue|my day|due today|needs attention/.test(query)) {
    const briefing = data.currentAccount && /this account|current account/.test(query) ? buildAccountBriefing(data, data.currentAccount.id) : buildPortfolioBriefing(data);
    return baseResult("SHOW_MISSION_QUEUE", briefing.summary, { evidence: briefing.evidence, suggestedActions: briefing.suggestedActions });
  }

  if (/blocker|blocked/.test(query) && !/escalat/.test(query)) {
    const account = data.currentAccount;
    const items = account ? evidenceByType(account, ["blocker"]) : data.accounts.flatMap((item) => evidenceByType(item, ["blocker"]));
    return baseResult("SHOW_BLOCKERS", account ? `${account.name}: ${evidenceSummary(items, "No blocker data is recorded for this account.")}` : evidenceSummary(items, "No blocker data is recorded in the portfolio."), { evidence: items });
  }

  if (/partner request|waiting on partner|partner waiting/.test(query)) {
    const account = data.currentAccount;
    const items = account ? evidenceByType(account, ["partner_request"]) : data.accounts.flatMap((item) => evidenceByType(item, ["partner_request"]));
    return baseResult("SHOW_PARTNER_REQUESTS", account ? `${account.name}: ${evidenceSummary(items, "No partner request data is recorded for this account.")}` : evidenceSummary(items, "No partner request data is recorded in the portfolio."), { evidence: items });
  }

  if (/overdue/.test(query)) {
    const accounts = data.currentAccount ? [data.currentAccount] : data.accounts;
    const items = accounts.flatMap((account) => evidenceByType(account, ["task"]).filter((item) => account.tasks.some((task) => task.id === item.sourceId && isOverdue(task.dueDate, task.status))));
    return baseResult("SHOW_OVERDUE_TASKS", evidenceSummary(items, data.currentAccount ? `No overdue task data is recorded for ${data.currentAccount.name}.` : "No overdue task data is recorded in the portfolio."), { evidence: items });
  }

  if (/missing report|report package|reports missing/.test(query)) {
    const account = data.currentAccount;
    const items = account ? evidenceByType(account, ["report"]) : data.accounts.flatMap((item) => evidenceByType(item, ["report"]));
    return baseResult("SHOW_MISSING_REPORTS", account ? `${account.name}: ${evidenceSummary(items, "The required weekly report set is present.")}` : evidenceSummary(items, "No missing weekly reports are identified."), { evidence: items, suggestedActions: items.length && account ? [{ id: `imports:${account.id}`, type: "open_import_center", label: "Open Import Center", accountId: account.id, accountName: account.name, reason: "Review the missing report package.", evidence: items, requiresApproval: false }] : [] });
  }

  if (/draft (?:the )?(?:weekly|partner) (?:update|brief)|weekly update draft/.test(query)) {
    const match = accountFromPhrase(raw.replace(/^.*?(?:update|brief)(?:\s+(?:for|on))?/i, ""), data, true);
    const error = accountResolutionError("DRAFT_WEEKLY_UPDATE", match);
    if (error) return error;
    const account = resolvedAccount(match)!;
    const evidence = accountEvidenceForDraft(account);
    const draft = draftWeeklyPartnerUpdate(account);
    return baseResult("DRAFT_WEEKLY_UPDATE", `Draft ready for ${account.name}. It is editable and has not been sent.`, { targetAccountId: account.id, targetAccountName: account.name, evidence, draft, suggestedActions: [{ id: `draft:${account.id}`, type: "draft_partner_update", label: "Review weekly update draft", accountId: account.id, accountName: account.name, reason: "A draft was assembled only from available Garden data.", evidence, requiresApproval: false }] });
  }

  if (/start (?:the )?weekly (?:business )?review|open (?:the )?weekly review/.test(query)) {
    const account = data.currentAccount;
    if (!account) return baseResult("START_WEEKLY_REVIEW", "Select an account before starting a weekly review.", { confidence: .75, error: "No current account selected." });
    const evidence = evidenceByType(account, ["review", "report", "data_quality"]);
    return baseResult("START_WEEKLY_REVIEW", `Opening ${account.name}'s real weekly review workspace.`, { ...accountNavigation(account), navigation: { view: "review", accountId: account.id }, evidence });
  }

  const task = raw.match(/^(?:hey[, ]+jarvis[, ]*)?(?:create|add|prepare)\s+(?:a\s+)?task(?:\s+(?:to|for|called))?\s*(.*)$/i);
  if (task) {
    const account = data.currentAccount;
    if (!account) return baseResult("CREATE_TASK_PROPOSAL", "Select an account before preparing a task proposal.", { confidence: .75, error: "No current account selected." });
    const title = task[1].trim();
    if (!title) return baseResult("CREATE_TASK_PROPOSAL", "Tell me the task title. I will prepare an approval card before anything is saved.", { confidence: .8, error: "Task title is required." });
    const evidence = evidenceByType(account, ["task", "blocker", "partner_request", "report"]).slice(0, 6);
    const proposal = makeTaskProposal(account, title, evidence);
    return baseResult("CREATE_TASK_PROPOSAL", `Task proposal prepared for ${account.name}. Review, edit, approve, or cancel it; nothing has been saved yet.`, { targetAccountId: account.id, targetAccountName: account.name, evidence, suggestedActions: [proposal], requiresApproval: true });
  }

  if (/escalat(?:e|ion).*(?:blocker|issue)|(?:blocker|issue).*escalat/.test(query)) {
    const account = data.currentAccount;
    if (!account) return baseResult("ESCALATE_BLOCKER_PROPOSAL", "Select an account before preparing a blocker escalation.", { confidence: .75, error: "No current account selected." });
    const blocker = account.blockers.find((item) => !["Resolved", "Canceled"].includes(item.status));
    if (!blocker) return baseResult("ESCALATE_BLOCKER_PROPOSAL", `No open blocker data is recorded for ${account.name}, so I did not invent an escalation. Add a blocker in Operations first.`, { error: "No open blocker available." });
    const evidence = evidenceByType(account, ["blocker"]).filter((item) => item.sourceId === blocker.id);
    const proposal: JarvisSuggestedAction = { id: `escalate:${blocker.id}`, type: "escalate_blocker", label: `Escalate: ${blocker.title}`, accountId: account.id, accountName: account.name, reason: blocker.notes || blocker.resolutionNotes || "This blocker remains unresolved.", evidence, proposedFields: { title: `Escalate: ${blocker.title}`, category: blocker.category, responsibleParty: blocker.responsibleParty, status: "Open", notes: `Escalation prepared from blocker ${blocker.id}. Review owner and details before approval.`, source: "Manual entry" }, requiresApproval: true };
    return baseResult("ESCALATE_BLOCKER_PROPOSAL", `Escalation proposal prepared for ${account.name}. Nothing has been saved.`, { targetAccountId: account.id, targetAccountName: account.name, evidence, suggestedActions: [proposal], requiresApproval: true });
  }

  const queue = buildMissionQueue(data, data.currentAccount?.id);
  const fallbackCount = Object.values(queue).reduce((total, items) => total + items.length, 0);
  return baseResult("UNKNOWN_COMMAND", `I could not map that to a safe Garden command.${fallbackCount ? ` The current context has ${fallbackCount} mission item${fallbackCount === 1 ? "" : "s"}.` : ""} Open Help to see supported commands.`, { confidence: .25, error: "Command not recognized." });
}

function accountEvidenceForDraft(account: JarvisAccountData) {
  return evidenceByType(account, ["task", "action", "blocker", "partner_request", "review", "report", "account", "data_quality"]);
}
