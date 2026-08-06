import assert from "node:assert/strict";
import test from "node:test";
import { adaptJarvisData } from "../lib/jarvis-data-adapter.ts";
import { buildAccountBriefing, buildMissionQueue, draftWeeklyPartnerUpdate } from "../lib/jarvis-briefing-service.ts";
import { executeJarvisCommand, findJarvisAccount } from "../lib/jarvis-command-engine.ts";
import { accountEvidence } from "../lib/jarvis-evidence-service.ts";
import { accountsSeed, actionSeed, importSeed, seedPeriod, seedSkus } from "../lib/jarvis-seed.ts";
import type { JarvisDataContext } from "../lib/jarvis-types.ts";
import type { PsmState, StorageStatus } from "../lib/psm-types.ts";

const storage: StorageStatus = { mode: "postgres", writable: true, label: "Postgres", detail: "Test storage" };
const psm: PsmState = {
  storage,
  workflows: [{ accountId: "caldwell", stage: "Optimization", healthStatus: "At risk", healthReason: "Margin inputs are incomplete.", nextAction: "Confirm COGS", psmOwner: "Alex", lastWeeklyReview: "", updatedAt: "2026-08-05T12:00:00Z", source: "Manual entry" }],
  tasks: [{ id: "task-overdue", accountId: "caldwell", title: "Confirm COGS", owner: "Alex", responsibleParty: "Both", dueDate: "2000-01-01", priority: "Critical", status: "In progress", blockedReason: "", notes: "", completionHistory: [], createdAt: "2026-08-01T12:00:00Z", updatedAt: "2026-08-05T12:00:00Z", completedAt: null, source: "Manual entry" }],
  partnerRequests: [{ id: "request-cogs", accountId: "caldwell", title: "Send product COGS", requestType: "COGS", description: "Need confirmed unit costs.", responsibleParty: "Partner", dateRequested: "2026-08-01", dueDate: "2026-08-04", status: "Waiting", lastFollowUpDate: "", blocksAccount: true, relatedTaskId: "task-overdue", relatedBlockerId: "blocker-cogs", notes: "", createdAt: "2026-08-01T12:00:00Z", updatedAt: "2026-08-05T12:00:00Z", source: "Manual entry" }],
  blockers: [{ id: "blocker-cogs", accountId: "caldwell", title: "COGS unavailable", category: "COGS missing", responsibleParty: "Partner", status: "Open", dateOpened: "2026-08-01", dateResolved: "", relatedTaskId: "task-overdue", relatedPartnerRequestId: "request-cogs", resolutionNotes: "", notes: "Waiting for partner.", createdAt: "2026-08-01T12:00:00Z", updatedAt: "2026-08-05T12:00:00Z", source: "Manual entry" }],
  weeklyReviews: [],
  events: [{ id: "event-1", accountId: "caldwell", eventType: "blocker_updated", title: "Blocker updated", detail: "COGS is still missing.", occurredAt: "2026-08-05T12:00:00Z", source: "Manual entry", relatedId: "blocker-cogs" }],
};

function fixture(): JarvisDataContext {
  const periodWithMissingReport = { ...seedPeriod, reports: seedPeriod.reports.filter((report) => report !== "Search Term") };
  return adaptJarvisData({
    accounts: accountsSeed,
    skus: seedSkus,
    periods: [periodWithMissingReport],
    imports: importSeed,
    actions: actionSeed,
    reviews: [],
    psm,
    storage,
    currentAccountId: "caldwell",
    currentPeriodId: periodWithMissingReport.id,
  });
}

test("fuzzy account matching resolves a strong Garden account match", () => {
  const data = fixture();
  const match = findJarvisAccount("Caldwell MKH", data.accounts);
  assert.equal(match.status, "matched");
  if (match.status === "matched") assert.equal(match.account.id, "caldwell");
});

test("account matching asks for disambiguation when multiple names are close", () => {
  const data = fixture();
  const accounts = [
    { ...data.accounts[0], id: "north", name: "Caldwell North" },
    { ...data.accounts[0], id: "south", name: "Caldwell South" },
  ];
  const match = findJarvisAccount("Caldwell", accounts);
  assert.equal(match.status, "multiple");
});

test("navigation commands target the real accounts view and preserve account context", () => {
  const result = executeJarvisCommand("Take me to CaldwellMKH", fixture());
  assert.equal(result.intent, "NAVIGATE_ACCOUNT");
  assert.equal(result.targetAccountId, "caldwell");
  assert.equal(result.navigation?.view, "accounts");
  assert.ok(result.evidence.length > 0);
});

test("unknown commands return an honest fallback", () => {
  const result = executeJarvisCommand("recalibrate the quantum tomatoes", fixture());
  assert.equal(result.intent, "UNKNOWN_COMMAND");
  assert.match(result.response, /could not map/i);
  assert.ok(result.error);
});

test("mission queue is generated only from normalized Garden records", () => {
  const queue = buildMissionQueue(fixture());
  assert.equal(queue.overdue[0]?.id, "task-overdue");
  assert.ok(queue.blocked.some((item) => item.id === "blocker-cogs"));
  assert.ok(queue.waitingOnPartner.some((item) => item.id === "request-cogs"));
});

test("account evidence cites tasks, blockers, requests, reports, and reviews", () => {
  const account = fixture().currentAccount!;
  const types = new Set(accountEvidence(account).map((item) => item.type));
  assert.ok(types.has("task"));
  assert.ok(types.has("blocker"));
  assert.ok(types.has("partner_request"));
  assert.ok(types.has("report"));
  assert.ok(types.has("review"));
});

test("account briefings and drafts expose missing data without claiming a send", () => {
  const data = fixture();
  const briefing = buildAccountBriefing(data, "caldwell");
  const draft = draftWeeklyPartnerUpdate(data.currentAccount!);
  assert.match(briefing.summary, /open task/i);
  assert.match(draft, /COGS unavailable/);
  assert.match(draft, /has not contacted the partner/i);
});

test("data-changing task commands produce approval cards without saving", () => {
  const result = executeJarvisCommand("Create task to follow up on COGS", fixture());
  assert.equal(result.intent, "CREATE_TASK_PROPOSAL");
  assert.equal(result.requiresApproval, true);
  assert.equal(result.suggestedActions[0]?.type, "create_task");
  assert.equal(result.suggestedActions[0]?.requiresApproval, true);
});

test("weekly review navigation is not misclassified as account navigation", () => {
  const result = executeJarvisCommand("Open weekly review", fixture());
  assert.equal(result.intent, "START_WEEKLY_REVIEW");
  assert.equal(result.navigation?.view, "review");
  assert.equal(result.targetAccountId, "caldwell");
});

test("attention commands default to the portfolio when no account context exists", () => {
  const data = { ...fixture(), currentAccount: undefined, currentPeriod: undefined };
  const result = executeJarvisCommand("What needs attention?", data);
  assert.equal(result.intent, "SHOW_MISSION_QUEUE");
  assert.match(result.response, /account loaded|accounts loaded/i);
});
