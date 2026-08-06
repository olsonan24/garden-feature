import {
  BLOCKER_STATUSES,
  DATA_SOURCES,
  HEALTH_STATUSES,
  PARTNER_REQUEST_STATUSES,
  PRIORITIES,
  RESPONSIBLE_PARTIES,
  TASK_STATUSES,
  type AccountEvent,
  type AccountWorkflow,
  type BlockerStatus,
  type DataSource,
  type PartnerRequest,
  type PartnerRequestStatus,
  type Priority,
  type PsmBlocker,
  type PsmState,
  type PsmTask,
  type ResponsibleParty,
  type StorageStatus,
  type TaskStatus,
  type WeeklyReview,
} from "./psm-types";
import type { PersistentDatabase } from "./persistent-database";

export type PsmEntity = "workflow" | "task" | "partnerRequest" | "blocker" | "weeklyReview" | "event";
export type PsmRecord = AccountWorkflow | PsmTask | PartnerRequest | PsmBlocker | WeeklyReview | AccountEvent;

const waitingTaskStatuses = new Set<TaskStatus>(["Waiting on partner", "Waiting internally", "Blocked"]);

function parsePayload<T>(value: unknown): T | null {
  try { return JSON.parse(String(value)) as T; }
  catch { return null; }
}

function asString(input: Record<string, unknown>, key: string) { return String(input[key] ?? "").trim(); }
function required(input: Record<string, unknown>, key: string, label: string) {
  const value = asString(input, key);
  if (!value) throw new Error(`${label} is required.`);
  return value;
}
function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}
function optionalDate(input: Record<string, unknown>, key: string) {
  const value = asString(input, key);
  if (value && !isCalendarDate(value)) throw new Error(`${key} must be a valid YYYY-MM-DD date.`);
  return value;
}
function requiredDate(input: Record<string, unknown>, key: string, label: string) {
  const value = required(input, key, label);
  if (!isCalendarDate(value)) throw new Error(`${label} must be a valid YYYY-MM-DD date.`);
  return value;
}
function enumValue<T extends string>(input: Record<string, unknown>, key: string, values: readonly T[], label: string, fallback?: T) {
  const value = asString(input, key) || fallback;
  if (!value || !values.includes(value as T)) throw new Error(`${label} is invalid.`);
  return value as T;
}
function sourceValue(input: Record<string, unknown>): DataSource { return enumValue(input, "source", DATA_SOURCES, "Data source", "Manual entry"); }
function recordId(input: Record<string, unknown>, prefix: string) { return asString(input, "id") || `${prefix}-${crypto.randomUUID()}`; }

function eventFor(accountId: string, eventType: string, title: string, detail: string, relatedId?: string): AccountEvent {
  return { id: `event-${crypto.randomUUID()}`, accountId, eventType, title, detail, occurredAt: new Date().toISOString(), source: "Manual entry", relatedId };
}

export function generatePartnerUpdateDraft(review: Pick<WeeklyReview, "healthStatus" | "completedWork" | "openBlockers" | "partnerRequests" | "reportsStatus" | "nextActions" | "partnerUpdateNotes">) {
  const completed = review.completedWork || "No completed work was recorded this week.";
  const blockers = review.openBlockers || "No open blockers were recorded.";
  const requests = review.partnerRequests || "No partner requests are currently outstanding.";
  const next = review.nextActions || "Next actions are still being finalized.";
  const notes = review.partnerUpdateNotes ? `\n\nImportant notes\n${review.partnerUpdateNotes}` : "";
  return `Weekly partner update\n\nHealth: ${review.healthStatus}\n\nCompleted work\n${completed}\n\nCurrent blockers\n${blockers}\n\nWaiting on partner\n${requests}\n\nMissing information / reports\n${review.reportsStatus}\n\nNext actions\n${next}${notes}`;
}

export async function loadPsmState(db: PersistentDatabase, storage: StorageStatus): Promise<PsmState> {
  const [workflowRows, taskRows, requestRows, blockerRows, reviewRows, eventRows] = await Promise.all([
    db.all("SELECT payload FROM account_workflows ORDER BY updated_at DESC"),
    db.all("SELECT payload FROM psm_tasks ORDER BY updated_at DESC"),
    db.all("SELECT payload FROM partner_requests ORDER BY updated_at DESC"),
    db.all("SELECT payload FROM psm_blockers ORDER BY updated_at DESC"),
    db.all("SELECT payload FROM weekly_reviews_v2 ORDER BY week_end DESC, updated_at DESC"),
    db.all("SELECT payload FROM account_events ORDER BY occurred_at DESC LIMIT 500"),
  ]);
  const payloads = <T>(rows: Record<string, unknown>[]) => rows.map((row) => parsePayload<T>(row.payload)).filter((item): item is T => Boolean(item));
  return {
    workflows: payloads<AccountWorkflow>(workflowRows),
    tasks: payloads<PsmTask>(taskRows),
    partnerRequests: payloads<PartnerRequest>(requestRows),
    blockers: payloads<PsmBlocker>(blockerRows),
    weeklyReviews: payloads<WeeklyReview>(reviewRows),
    events: payloads<AccountEvent>(eventRows),
    storage,
  };
}

async function existingPayload<T>(db: PersistentDatabase, table: string, idColumn: string, id: string) {
  const row = await db.first(`SELECT payload FROM ${table} WHERE ${idColumn} = ?`, [id]);
  return row ? parsePayload<T>(row.payload) : null;
}

async function saveEvent(db: PersistentDatabase, event: AccountEvent) {
  await db.run("INSERT INTO account_events (id, account_id, event_type, occurred_at, payload) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET account_id = excluded.account_id, event_type = excluded.event_type, occurred_at = excluded.occurred_at, payload = excluded.payload", [event.id, event.accountId, event.eventType, event.occurredAt, JSON.stringify(event)]);
}

export async function savePsmRecord(db: PersistentDatabase, entity: PsmEntity, input: Record<string, unknown>): Promise<{ record: PsmRecord; event: AccountEvent }> {
  const now = new Date().toISOString();
  const accountId = required(input, "accountId", "Account");

  if (entity === "workflow") {
    const previous = await existingPayload<AccountWorkflow>(db, "account_workflows", "account_id", accountId);
    const record: AccountWorkflow = {
      accountId,
      stage: required(input, "stage", "Current stage"),
      healthStatus: enumValue(input, "healthStatus", HEALTH_STATUSES, "Health status", "Monitor"),
      healthReason: asString(input, "healthReason"),
      nextAction: asString(input, "nextAction"),
      psmOwner: required(input, "psmOwner", "PSM owner"),
      lastWeeklyReview: optionalDate(input, "lastWeeklyReview"),
      updatedAt: now,
      source: sourceValue(input),
    };
    if (record.healthStatus !== "Healthy" && !record.healthReason) throw new Error("A health reason is required unless the account is Healthy.");
    await db.run("INSERT INTO account_workflows (account_id, stage, health_status, payload, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET stage = excluded.stage, health_status = excluded.health_status, payload = excluded.payload, updated_at = excluded.updated_at", [accountId, record.stage, record.healthStatus, JSON.stringify(record), now]);
    const changes = [previous?.stage !== record.stage ? `Stage: ${previous?.stage || "not set"} → ${record.stage}` : "", previous?.healthStatus !== record.healthStatus ? `Health: ${previous?.healthStatus || "not set"} → ${record.healthStatus}` : ""].filter(Boolean).join(" · ") || "Workflow details updated";
    const event = eventFor(accountId, "workflow_updated", "Account workflow updated", changes, accountId);
    await saveEvent(db, event);
    return { record, event };
  }

  if (entity === "task") {
    const id = recordId(input, "task");
    const previous = await existingPayload<PsmTask>(db, "psm_tasks", "id", id);
    const status = enumValue(input, "status", TASK_STATUSES, "Task status", "Not started");
    const blockedReason = asString(input, "blockedReason");
    if (waitingTaskStatuses.has(status) && !blockedReason) throw new Error("A reason is required when a task is blocked or waiting.");
    const completionHistory = [...(previous?.completionHistory || [])];
    if (status === "Completed" && previous?.status !== "Completed") completionHistory.push({ completedAt: now, note: asString(input, "notes") || undefined });
    const record: PsmTask = {
      id, accountId,
      title: required(input, "title", "Task title"),
      owner: required(input, "owner", "Owner"),
      responsibleParty: enumValue(input, "responsibleParty", RESPONSIBLE_PARTIES, "Responsible party", "Angora"),
      dueDate: requiredDate(input, "dueDate", "Due date"),
      priority: enumValue(input, "priority", PRIORITIES, "Priority", "Normal") as Priority,
      status,
      blockedReason,
      notes: asString(input, "notes"),
      completionHistory,
      createdAt: previous?.createdAt || asString(input, "createdAt") || now,
      updatedAt: now,
      completedAt: status === "Completed" ? previous?.completedAt || now : null,
      source: sourceValue(input),
    };
    await db.run("INSERT INTO psm_tasks (id, account_id, status, due_date, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET account_id = excluded.account_id, status = excluded.status, due_date = excluded.due_date, payload = excluded.payload, updated_at = excluded.updated_at", [id, accountId, status, record.dueDate, JSON.stringify(record), record.createdAt, now]);
    const event = eventFor(accountId, status === "Completed" ? "task_completed" : "task_updated", status === "Completed" ? `Completed: ${record.title}` : `Task updated: ${record.title}`, blockedReason || `${record.status} · due ${record.dueDate || "not set"}`, id);
    await saveEvent(db, event);
    return { record, event };
  }

  if (entity === "partnerRequest") {
    const id = recordId(input, "request");
    const previous = await existingPayload<PartnerRequest>(db, "partner_requests", "id", id);
    const status = enumValue(input, "status", PARTNER_REQUEST_STATUSES, "Partner request status", "Open") as PartnerRequestStatus;
    const record: PartnerRequest = {
      id, accountId,
      title: required(input, "title", "Request title"),
      requestType: required(input, "requestType", "Request type"),
      description: asString(input, "description"),
      responsibleParty: enumValue(input, "responsibleParty", RESPONSIBLE_PARTIES, "Responsible party", "Partner") as ResponsibleParty,
      dateRequested: optionalDate(input, "dateRequested") || now.slice(0, 10),
      dueDate: requiredDate(input, "dueDate", "Due date"),
      status,
      lastFollowUpDate: optionalDate(input, "lastFollowUpDate"),
      blocksAccount: Boolean(input.blocksAccount),
      relatedTaskId: asString(input, "relatedTaskId"),
      relatedBlockerId: asString(input, "relatedBlockerId"),
      notes: asString(input, "notes"),
      createdAt: previous?.createdAt || asString(input, "createdAt") || now,
      updatedAt: now,
      source: sourceValue(input),
    };
    await db.run("INSERT INTO partner_requests (id, account_id, status, due_date, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET account_id = excluded.account_id, status = excluded.status, due_date = excluded.due_date, payload = excluded.payload, updated_at = excluded.updated_at", [id, accountId, status, record.dueDate, JSON.stringify(record), record.createdAt, now]);
    const event = eventFor(accountId, "partner_request_updated", `Partner request: ${record.title}`, `${record.status}${record.blocksAccount ? " · blocks account" : ""}`, id);
    await saveEvent(db, event);
    return { record, event };
  }

  if (entity === "blocker") {
    const id = recordId(input, "blocker");
    const previous = await existingPayload<PsmBlocker>(db, "psm_blockers", "id", id);
    const status = enumValue(input, "status", BLOCKER_STATUSES, "Blocker status", "Open") as BlockerStatus;
    const dateResolved = status === "Resolved" ? optionalDate(input, "dateResolved") || now.slice(0, 10) : "";
    const resolutionNotes = asString(input, "resolutionNotes");
    if (status === "Resolved" && !resolutionNotes) throw new Error("Resolution notes are required when resolving a blocker.");
    const record: PsmBlocker = {
      id, accountId,
      title: required(input, "title", "Blocker title"),
      category: required(input, "category", "Blocker category"),
      responsibleParty: enumValue(input, "responsibleParty", RESPONSIBLE_PARTIES, "Responsible party", "Both") as ResponsibleParty,
      status,
      dateOpened: optionalDate(input, "dateOpened") || now.slice(0, 10),
      dateResolved,
      relatedTaskId: asString(input, "relatedTaskId"),
      relatedPartnerRequestId: asString(input, "relatedPartnerRequestId"),
      resolutionNotes,
      notes: asString(input, "notes"),
      createdAt: previous?.createdAt || asString(input, "createdAt") || now,
      updatedAt: now,
      source: sourceValue(input),
    };
    await db.run("INSERT INTO psm_blockers (id, account_id, status, date_opened, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET account_id = excluded.account_id, status = excluded.status, date_opened = excluded.date_opened, payload = excluded.payload, updated_at = excluded.updated_at", [id, accountId, status, record.dateOpened, JSON.stringify(record), record.createdAt, now]);
    const event = eventFor(accountId, status === "Resolved" ? "blocker_resolved" : "blocker_updated", `${status === "Resolved" ? "Resolved" : "Blocker"}: ${record.title}`, resolutionNotes || `${record.category} · ${record.responsibleParty}`, id);
    await saveEvent(db, event);
    return { record, event };
  }

  if (entity === "weeklyReview") {
    const periodId = required(input, "periodId", "Reporting period");
    const id = asString(input, "id") || `${accountId}:${periodId}`;
    const previous = await existingPayload<WeeklyReview>(db, "weekly_reviews_v2", "id", id);
    const status = asString(input, "status") === "Completed" ? "Completed" : "Draft";
    const record: WeeklyReview = {
      id, accountId, periodId,
      weekStart: optionalDate(input, "weekStart"),
      weekEnd: optionalDate(input, "weekEnd"),
      revenueStatus: asString(input, "revenueStatus"),
      adsStatus: asString(input, "adsStatus"),
      inventoryIssues: asString(input, "inventoryIssues"),
      skuIssues: asString(input, "skuIssues"),
      reportsStatus: (["Received", "Missing", "Partial", "Not reviewed"] as const).includes(asString(input, "reportsStatus") as WeeklyReview["reportsStatus"]) ? asString(input, "reportsStatus") as WeeklyReview["reportsStatus"] : "Not reviewed",
      completedWork: asString(input, "completedWork"),
      openBlockers: asString(input, "openBlockers"),
      partnerRequests: asString(input, "partnerRequests"),
      nextActions: asString(input, "nextActions"),
      healthStatus: enumValue(input, "healthStatus", HEALTH_STATUSES, "Health status", "Monitor"),
      internalNotes: asString(input, "internalNotes"),
      partnerUpdateNotes: asString(input, "partnerUpdateNotes"),
      partnerUpdateDraft: asString(input, "partnerUpdateDraft"),
      status,
      createdAt: previous?.createdAt || asString(input, "createdAt") || now,
      updatedAt: now,
      completedAt: status === "Completed" ? previous?.completedAt || now : null,
      source: sourceValue(input),
    };
    if (!record.partnerUpdateDraft) record.partnerUpdateDraft = generatePartnerUpdateDraft(record);
    if (status === "Completed" && (!record.nextActions || !record.healthStatus)) throw new Error("Completed reviews require next actions and a health status.");
    await db.run("INSERT INTO weekly_reviews_v2 (id, account_id, period_id, status, week_end, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET account_id = excluded.account_id, period_id = excluded.period_id, status = excluded.status, week_end = excluded.week_end, payload = excluded.payload, updated_at = excluded.updated_at", [id, accountId, periodId, status, record.weekEnd, JSON.stringify(record), record.createdAt, now]);
    const event = eventFor(accountId, status === "Completed" ? "weekly_review_completed" : "weekly_review_saved", status === "Completed" ? "Weekly review completed" : "Weekly review draft saved", `${record.weekStart || ""} to ${record.weekEnd || ""}`, id);
    await saveEvent(db, event);
    return { record, event };
  }

  const eventType = asString(input, "eventType") === "decision" ? "decision" : "note";
  const event: AccountEvent = {
    id: recordId(input, "event"), accountId, eventType,
    title: required(input, "title", eventType === "decision" ? "Decision title" : "Note title"),
    detail: required(input, "detail", eventType === "decision" ? "Decision detail" : "Note detail"),
    occurredAt: asString(input, "occurredAt") || now,
    source: sourceValue(input),
    relatedId: asString(input, "relatedId") || undefined,
  };
  await saveEvent(db, event);
  return { record: event, event };
}

export type AttentionView = "All attention" | "My overdue tasks" | "Waiting on partners" | "Critical accounts" | "Blocked accounts" | "Missing COGS" | "Reviews not completed" | "Missing reports" | "Accounts with no recent activity";

export function daysSince(date: string, today = new Date()) {
  if (!date) return 0;
  const value = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(value.valueOf()) ? 0 : Math.max(0, Math.floor((today.valueOf() - value.valueOf()) / 86_400_000));
}

export function freshness(updatedAt: string, now = new Date()) {
  if (!updatedAt) return "Missing";
  return (now.valueOf() - new Date(updatedAt).valueOf()) / 86_400_000 > 14 ? "Stale" : "Current";
}
