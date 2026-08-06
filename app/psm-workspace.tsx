"use client";

import {
  AlertTriangle, BriefcaseBusiness, CalendarClock, Check, CheckCircle2, ChevronRight,
  CircleDot, Clock3, FileWarning, HeartPulse, History, ListChecks, MessageSquarePlus,
  Pencil, Plus, RefreshCw, Save, ShieldAlert, Users, X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ACCOUNT_STAGES, BLOCKER_CATEGORIES, BLOCKER_STATUSES, DATA_SOURCES, HEALTH_STATUSES,
  PARTNER_REQUEST_STATUSES, PARTNER_REQUEST_TYPES, PRIORITIES, RESPONSIBLE_PARTIES, TASK_STATUSES,
  emptyPsmState, type AccountEvent, type AccountWorkflow, type PartnerRequest, type PsmBlocker,
  type PsmState, type PsmTask, type StorageStatus, type WeeklyReview,
} from "../lib/psm-types";
import { daysSince, freshness, type AttentionView, type PsmEntity, type PsmRecord } from "../lib/psm-service";
import "./psm-operations.css";

type Account = { id: string; name: string; status: string };
type Mode = "my-day" | "operations";
type OperationsTab = "tasks" | "requests" | "blockers" | "history";
type ModalState = { entity: Exclude<PsmEntity, "workflow" | "weeklyReview">; record?: PsmRecord } | null;

const attentionViews: AttentionView[] = ["All attention", "My overdue tasks", "Waiting on partners", "Critical accounts", "Blocked accounts", "Missing COGS", "Reviews not completed", "Missing reports", "Accounts with no recent activity"];
const openTaskStatuses = new Set(["Not started", "In progress", "Waiting on partner", "Waiting internally", "Blocked"]);
const openRequestStatuses = new Set(["Open", "Waiting"]);
const openBlockerStatuses = new Set(["Open", "Monitoring"]);
const today = () => new Date().toISOString().slice(0, 10);
const accountName = (accounts: Account[], id: string) => accounts.find((account) => account.id === id)?.name || "Unknown account";

function formatDate(value: string) {
  if (!value) return "Not set";
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function replaceById<T extends { id: string }>(items: T[], record: T) {
  return [record, ...items.filter((item) => item.id !== record.id)];
}

function storageFallback(): StorageStatus {
  return { mode: "unavailable", writable: false, label: "Checking central storage", detail: "Loading the shared PSM operating data." };
}

export default function PsmWorkspace({ mode, accounts, accountId }: { mode: Mode; accounts: Account[]; accountId: string }) {
  const [data, setData] = useState<PsmState>(() => emptyPsmState(storageFallback()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<AttentionView>("All attention");
  const [tab, setTab] = useState<OperationsTab>("tasks");
  const [modal, setModal] = useState<ModalState>(null);

  async function refresh() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/psm", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok && !body.storage) throw new Error(body.error || "PSM data could not be loaded.");
      setData(body as PsmState);
      if (body.error) setError(body.error);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "PSM data could not be loaded."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/psm", { cache: "no-store" }).then(async (response) => ({ response, body: await response.json() })).then(({ response, body }) => {
      if (!active) return;
      if (!response.ok && !body.storage) throw new Error(body.error || "PSM data could not be loaded.");
      setData(body as PsmState);
      if (body.error) setError(body.error);
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "PSM data could not be loaded."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 3500); return () => clearTimeout(timer); }, [notice]);

  async function save(entity: PsmEntity, record: Record<string, unknown>) {
    setError("");
    const response = await fetch("/api/psm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entity, record }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "The record could not be saved.");
    const saved = body.record as PsmRecord;
    const event = body.event as AccountEvent;
    setData((current) => {
      if (entity === "workflow") return { ...current, workflows: [saved as AccountWorkflow, ...current.workflows.filter((item) => item.accountId !== (saved as AccountWorkflow).accountId)], events: replaceById(current.events, event) };
      if (entity === "task") return { ...current, tasks: replaceById(current.tasks, saved as PsmTask), events: replaceById(current.events, event) };
      if (entity === "partnerRequest") return { ...current, partnerRequests: replaceById(current.partnerRequests, saved as PartnerRequest), events: replaceById(current.events, event) };
      if (entity === "blocker") return { ...current, blockers: replaceById(current.blockers, saved as PsmBlocker), events: replaceById(current.events, event) };
      if (entity === "weeklyReview") return { ...current, weeklyReviews: replaceById(current.weeklyReviews, saved as WeeklyReview), events: replaceById(current.events, event) };
      return { ...current, events: replaceById(current.events, saved as AccountEvent) };
    });
    return saved;
  }

  async function saveModal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal) return;
    const form = new FormData(event.currentTarget);
    const record = Object.fromEntries(form.entries()) as Record<string, unknown>;
    if (modal.record && "id" in modal.record) record.id = modal.record.id;
    record.accountId ||= accountId;
    if (modal.entity === "partnerRequest") record.blocksAccount = form.get("blocksAccount") === "on";
    try {
      await save(modal.entity, record);
      setModal(null); setNotice("Saved centrally.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The record could not be saved."); }
  }

  const summaries = useMemo(() => summarize(data, accounts), [data, accounts]);
  const attention = useMemo(() => buildAttention(data, accounts, view), [data, accounts, view]);
  const workflow = data.workflows.find((item) => item.accountId === accountId);
  const accountTasks = data.tasks.filter((item) => item.accountId === accountId);
  const accountRequests = data.partnerRequests.filter((item) => item.accountId === accountId);
  const accountBlockers = data.blockers.filter((item) => item.accountId === accountId);
  const accountEvents = data.events.filter((item) => item.accountId === accountId);

  return <section className="psm-workspace">
    <FeatureTitle mode={mode} account={accountName(accounts, accountId)} onRefresh={() => void refresh()} loading={loading} />
    <StorageBanner storage={data.storage} error={error} />

    {mode === "my-day" ? <>
      <div className="psm-summary-grid">
        <SummaryCard label="Due today" value={summaries.dueToday} icon={<CalendarClock />} onClick={() => setView("All attention")} />
        <SummaryCard label="Overdue" value={summaries.overdue} icon={<Clock3 />} tone={summaries.overdue ? "critical" : ""} onClick={() => setView("My overdue tasks")} />
        <SummaryCard label="Blocked" value={summaries.blocked} icon={<ShieldAlert />} tone={summaries.blocked ? "critical" : ""} onClick={() => setView("Blocked accounts")} />
        <SummaryCard label="Waiting on partner" value={summaries.waitingPartner} icon={<Users />} onClick={() => setView("Waiting on partners")} />
        <SummaryCard label="Missing reports/data" value={summaries.missingData} icon={<FileWarning />} onClick={() => setView("Missing reports")} />
        <SummaryCard label="Accounts needing attention" value={summaries.accountsAttention} icon={<HeartPulse />} tone={summaries.accountsAttention ? "critical" : ""} onClick={() => setView("Critical accounts")} />
      </div>
      <article className="panel psm-attention-panel"><div className="panel-head"><div><h2>Attention Queue</h2><p>Saved PSM views keep the summary clean; open a view to see the underlying work.</p></div></div>
        <div className="psm-saved-views" role="tablist" aria-label="Saved PSM views">{attentionViews.map((item) => <button key={item} role="tab" aria-selected={view === item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{item}</button>)}</div>
        <div className="psm-attention-list">{attention.length ? attention.map((item) => <article key={item.key}><span className={`psm-status ${item.tone}`}>{item.kind}</span><div><b>{item.title}</b><p>{item.detail}</p><small>{item.account} · {item.meta}</small></div><ChevronRight /></article>) : <EmptyState title="Nothing needs attention in this view" detail="As centrally saved tasks, reviews, partner requests, and blockers change, they will appear here." />}</div>
      </article>
    </> : <>
      <div className="psm-toolbar"><div><small>SELECTED ACCOUNT</small><b>{accountName(accounts, accountId)}</b></div><div><button className="secondary" disabled={!data.storage.writable} onClick={() => setModal({ entity: "task" })}><Plus /> Task</button><button className="secondary" disabled={!data.storage.writable} onClick={() => setModal({ entity: "partnerRequest" })}><Plus /> Partner Request</button><button className="primary" disabled={!data.storage.writable} onClick={() => setModal({ entity: "blocker" })}><Plus /> Blocker</button></div></div>
      <WorkflowPanel workflow={workflow} accountId={accountId} writable={data.storage.writable} onSave={async (record) => { try { await save("workflow", record); setNotice("Account workflow saved centrally."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Workflow could not be saved."); } }} />
      <div className="tabs psm-tabs" role="tablist">{(["tasks", "requests", "blockers", "history"] as const).map((item) => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item === "requests" ? "Partner Requests" : item}</button>)}</div>
      {tab === "tasks" && <TaskTable items={accountTasks} onEdit={(record) => setModal({ entity: "task", record })} />}
      {tab === "requests" && <RequestTable items={accountRequests} onEdit={(record) => setModal({ entity: "partnerRequest", record })} />}
      {tab === "blockers" && <BlockerTable items={accountBlockers} onEdit={(record) => setModal({ entity: "blocker", record })} />}
      {tab === "history" && <HistoryPanel items={accountEvents} writable={data.storage.writable} onAdd={(eventType) => setModal({ entity: "event", record: { eventType } as AccountEvent })} />}
    </>}

    {modal && <div className="backdrop" onMouseDown={() => setModal(null)}><div className="modal psm-modal" onMouseDown={(event) => event.stopPropagation()}><button className="close" aria-label="Close modal" onClick={() => setModal(null)}><X /></button><RecordForm modal={modal} accountId={accountId} tasks={accountTasks} requests={accountRequests} blockers={accountBlockers} onSubmit={saveModal} /></div></div>}
    {notice && <div className="toast"><Check />{notice}</div>}
  </section>;
}

function FeatureTitle({ mode, account, onRefresh, loading }: { mode: Mode; account: string; onRefresh: () => void; loading: boolean }) {
  return <div className="title"><div><small><BriefcaseBusiness />PSM OPERATING LAYER</small><h1>{mode === "my-day" ? "My Day" : "Operations"}</h1><p>{mode === "my-day" ? "Start with what is due, blocked, missing, or waiting across the portfolio." : `Manage workflow, responsibilities, and account history for ${account}.`}</p></div><button className="secondary" onClick={onRefresh} disabled={loading}><RefreshCw className={loading ? "spinning" : ""} /> Refresh</button></div>;
}

export function StorageBanner({ storage, error, compact = false }: { storage: StorageStatus; error?: string; compact?: boolean }) {
  return <div className={`psm-storage-banner ${storage.writable ? "ready" : "warning"} ${compact ? "compact" : ""}`} role={error ? "alert" : "status"}><span>{storage.writable ? <CheckCircle2 /> : <AlertTriangle />}</span><div><b>{storage.label}</b><small>{error || storage.detail}</small></div></div>;
}

function SummaryCard({ label, value, icon, tone = "", onClick }: { label: string; value: number; icon: React.ReactNode; tone?: string; onClick: () => void }) {
  return <button className={`kpi psm-summary-card ${tone}`} onClick={onClick}><div>{label}<span>{icon}</span></div><strong>{value}</strong><small>Open matching details</small></button>;
}

function WorkflowPanel({ workflow, accountId, writable, onSave }: { workflow?: AccountWorkflow; accountId: string; writable: boolean; onSave: (record: Record<string, unknown>) => Promise<void> }) {
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await onSave({ ...Object.fromEntries(new FormData(event.currentTarget).entries()), accountId }); }
  return <article className="panel"><div className="panel-head"><div><h2>Account Workflow</h2><p>Stages and ownership are editable team data, not hard-coded process gates.{workflow?.updatedAt ? ` Last updated ${formatDate(workflow.updatedAt)}.` : ""}</p></div><span className={`psm-freshness ${freshness(workflow?.updatedAt || "").toLowerCase()}`}>{freshness(workflow?.updatedAt || "")}</span></div>
    <form className="psm-workflow-form" onSubmit={(event) => void submit(event)}>
      <label>Current stage<input name="stage" list="account-stage-options" defaultValue={workflow?.stage || "Active management"} required /><datalist id="account-stage-options">{ACCOUNT_STAGES.map((item) => <option key={item} value={item} />)}</datalist></label>
      <label>Health status<select name="healthStatus" defaultValue={workflow?.healthStatus || "Monitor"}>{HEALTH_STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>PSM owner<input name="psmOwner" defaultValue={workflow?.psmOwner || ""} required /></label>
      <label>Last weekly review<input name="lastWeeklyReview" type="date" defaultValue={workflow?.lastWeeklyReview || ""} /></label>
      <label className="wide">Health reason<input name="healthReason" defaultValue={workflow?.healthReason || ""} placeholder="Required unless Healthy" /></label>
      <label className="wide">Next action<input name="nextAction" defaultValue={workflow?.nextAction || ""} /></label>
      <label>Data source<select name="source" defaultValue={workflow?.source || "Manual entry"}>{DATA_SOURCES.map((item) => <option key={item}>{item}</option>)}</select></label>
      <button className="primary" disabled={!writable}><Save /> Save Workflow</button>
    </form>
  </article>;
}

function TaskTable({ items, onEdit }: { items: PsmTask[]; onEdit: (item: PsmTask) => void }) {
  return <DataPanel title="Tasks" sub="Owners, responsibility, due dates, waiting reasons, and completion history stay together."><table><thead><tr><th>Task</th><th>Owner</th><th>Responsible</th><th>Due</th><th>Priority</th><th>Status</th><th></th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><b>{item.title}</b><small>{item.blockedReason || `${item.source} · ${freshness(item.updatedAt)}${item.completionHistory.length ? ` · ${item.completionHistory.length} completion${item.completionHistory.length === 1 ? "" : "s"}` : ""}`}</small></td><td>{item.owner}</td><td>{item.responsibleParty}</td><td>{formatDate(item.dueDate)}</td><td>{item.priority}</td><td><Status value={item.status} /></td><td><button className="secondary icon-button" aria-label={`Edit ${item.title}`} onClick={() => onEdit(item)}><Pencil /></button></td></tr>)}</tbody></table>{!items.length && <EmptyState title="No tasks yet" detail="Add the first centrally saved PSM task for this account." />}</DataPanel>;
}

function RequestTable({ items, onEdit }: { items: PartnerRequest[]; onEdit: (item: PartnerRequest) => void }) {
  return <DataPanel title="Partner Requests" sub="Track what Angora is waiting on and how long it has been outstanding."><table><thead><tr><th>Request</th><th>Type</th><th>Requested</th><th>Due</th><th>Waiting</th><th>Status</th><th></th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><b>{item.title}</b><small>{item.blocksAccount ? `Blocks account · ${item.source}` : `${item.responsibleParty} · ${item.source}`}</small></td><td>{item.requestType}</td><td>{formatDate(item.dateRequested)}</td><td>{formatDate(item.dueDate)}</td><td>{daysSince(item.dateRequested)} days</td><td><Status value={item.status} /></td><td><button className="secondary icon-button" aria-label={`Edit ${item.title}`} onClick={() => onEdit(item)}><Pencil /></button></td></tr>)}</tbody></table>{!items.length && <EmptyState title="No partner requests" detail="Add the first item Angora is waiting on from this partner." />}</DataPanel>;
}

function BlockerTable({ items, onEdit }: { items: PsmBlocker[]; onEdit: (item: PsmBlocker) => void }) {
  return <DataPanel title="Blockers" sub="Open and resolved blockers feed My Day and account history."><table><thead><tr><th>Blocker</th><th>Category</th><th>Responsible</th><th>Opened</th><th>Blocked</th><th>Status</th><th></th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><b>{item.title}</b><small>{item.resolutionNotes || `${item.source} · ${freshness(item.updatedAt)}`}</small></td><td>{item.category}</td><td>{item.responsibleParty}</td><td>{formatDate(item.dateOpened)}</td><td>{daysSince(item.dateOpened)} days</td><td><Status value={item.status} /></td><td><button className="secondary icon-button" aria-label={`Edit ${item.title}`} onClick={() => onEdit(item)}><Pencil /></button></td></tr>)}</tbody></table>{!items.length && <EmptyState title="No blockers" detail="This account has no saved blocker records." />}</DataPanel>;
}

function HistoryPanel({ items, writable, onAdd }: { items: AccountEvent[]; writable: boolean; onAdd: (kind: "note" | "decision") => void }) {
  return <article className="panel"><div className="panel-head"><div><h2>Account History</h2><p>Workflow changes, completions, blockers, requests, reviews, notes, and decisions.</p></div><div className="buttons"><button className="secondary" disabled={!writable} onClick={() => onAdd("note")}><MessageSquarePlus /> Note</button><button className="secondary" disabled={!writable} onClick={() => onAdd("decision")}><CircleDot /> Decision</button></div></div><div className="psm-history">{items.map((item) => <article key={item.id}><span><History /></span><div><b>{item.title}</b><p>{item.detail}</p><small>{formatDate(item.occurredAt)} · {item.eventType.replaceAll("_", " ")} · {item.source}</small></div></article>)}{!items.length && <EmptyState title="No account history yet" detail="Important PSM activity will be recorded here automatically." />}</div></article>;
}

function DataPanel({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) { return <article className="panel"><div className="panel-head"><div><h2>{title}</h2><p>{sub}</p></div></div><div className="table-wrap">{children}</div></article>; }
function Status({ value }: { value: string }) { const critical = /blocked|critical|overdue|missing/i.test(value); const done = /completed|received|resolved/i.test(value); return <span className={`psm-status ${critical ? "critical" : done ? "done" : ""}`}>{value}</span>; }
function EmptyState({ title, detail }: { title: string; detail: string }) { return <div className="psm-empty"><ListChecks /><b>{title}</b><span>{detail}</span></div>; }

function RecordForm({ modal, accountId, tasks, requests, blockers, onSubmit }: { modal: NonNullable<ModalState>; accountId: string; tasks: PsmTask[]; requests: PartnerRequest[]; blockers: PsmBlocker[]; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  if (modal.entity === "task") { const item = modal.record as PsmTask | undefined; return <form onSubmit={onSubmit}><h2>{item ? "Edit Task" : "Add Task"}</h2><p>Waiting and blocked tasks require a reason.</p>{item && <div className="psm-record-meta"><small>Created <b>{formatDate(item.createdAt)}</b></small><small>Updated <b>{formatDate(item.updatedAt)}</b></small><small>Completed <b>{item.completedAt ? formatDate(item.completedAt) : "Not completed"}</b></small>{item.completionHistory.map((entry, index) => <small key={`${entry.completedAt}-${index}`}>Completion {index + 1} <b>{formatDate(entry.completedAt)}{entry.note ? ` · ${entry.note}` : ""}</b></small>)}</div>}<input type="hidden" name="accountId" value={accountId} /><label>Task title<input name="title" defaultValue={item?.title} required /></label><div className="date-fields"><label>Owner<input name="owner" defaultValue={item?.owner} required /></label><label>Due date<input name="dueDate" type="date" defaultValue={item?.dueDate} required /></label></div><div className="date-fields"><label>Responsible party<select name="responsibleParty" defaultValue={item?.responsibleParty || "Angora"}>{RESPONSIBLE_PARTIES.map((value) => <option key={value}>{value}</option>)}</select></label><label>Priority<select name="priority" defaultValue={item?.priority || "Normal"}>{PRIORITIES.map((value) => <option key={value}>{value}</option>)}</select></label></div><label>Status<select name="status" defaultValue={item?.status || "Not started"}>{TASK_STATUSES.map((value) => <option key={value}>{value}</option>)}</select></label><label>Blocked / waiting reason<textarea name="blockedReason" rows={2} defaultValue={item?.blockedReason} /></label><label>Notes<textarea name="notes" rows={3} defaultValue={item?.notes} /></label><SourceSelect value={item?.source} /><button className="primary full"><Save /> Save Task</button></form>; }
  if (modal.entity === "partnerRequest") { const item = modal.record as PartnerRequest | undefined; return <form onSubmit={onSubmit}><h2>{item ? "Edit Partner Request" : "Add Partner Request"}</h2><p>Track the request, follow-up, and whether it blocks the account.</p><input type="hidden" name="accountId" value={accountId} /><label>Request title<input name="title" defaultValue={item?.title} required /></label><div className="date-fields"><label>Request type<select name="requestType" defaultValue={item?.requestType || "COGS"}>{PARTNER_REQUEST_TYPES.map((value) => <option key={value}>{value}</option>)}</select></label><label>Responsible party<select name="responsibleParty" defaultValue={item?.responsibleParty || "Partner"}>{RESPONSIBLE_PARTIES.map((value) => <option key={value}>{value}</option>)}</select></label></div><label>Description<textarea name="description" rows={3} defaultValue={item?.description} /></label><div className="date-fields"><label>Date requested<input name="dateRequested" type="date" defaultValue={item?.dateRequested || today()} required /></label><label>Due date<input name="dueDate" type="date" defaultValue={item?.dueDate} required /></label></div><div className="date-fields"><label>Status<select name="status" defaultValue={item?.status || "Open"}>{PARTNER_REQUEST_STATUSES.map((value) => <option key={value}>{value}</option>)}</select></label><label>Last follow-up<input name="lastFollowUpDate" type="date" defaultValue={item?.lastFollowUpDate} /></label></div><label className="psm-checkbox"><input name="blocksAccount" type="checkbox" defaultChecked={item?.blocksAccount} /> This request blocks the account</label><label>Related task<select name="relatedTaskId" defaultValue={item?.relatedTaskId || ""}><option value="">None</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label><label>Related blocker<select name="relatedBlockerId" defaultValue={item?.relatedBlockerId || ""}><option value="">None</option>{blockers.map((blocker) => <option key={blocker.id} value={blocker.id}>{blocker.title}</option>)}</select></label><label>Notes<textarea name="notes" rows={3} defaultValue={item?.notes} /></label><SourceSelect value={item?.source} /><button className="primary full"><Save /> Save Request</button></form>; }
  if (modal.entity === "blocker") { const item = modal.record as PsmBlocker | undefined; return <form onSubmit={onSubmit}><h2>{item ? "Edit Blocker" : "Add Blocker"}</h2><p>Resolved blockers require resolution notes.</p><input type="hidden" name="accountId" value={accountId} /><label>Blocker title<input name="title" defaultValue={item?.title} required /></label><div className="date-fields"><label>Category<select name="category" defaultValue={item?.category || "Waiting on partner"}>{BLOCKER_CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select></label><label>Responsible party<select name="responsibleParty" defaultValue={item?.responsibleParty || "Both"}>{RESPONSIBLE_PARTIES.map((value) => <option key={value}>{value}</option>)}</select></label></div><div className="date-fields"><label>Date opened<input name="dateOpened" type="date" defaultValue={item?.dateOpened || today()} required /></label><label>Date resolved<input name="dateResolved" type="date" defaultValue={item?.dateResolved || ""} /></label></div><label>Status<select name="status" defaultValue={item?.status || "Open"}>{BLOCKER_STATUSES.map((value) => <option key={value}>{value}</option>)}</select></label><label>Related task<select name="relatedTaskId" defaultValue={item?.relatedTaskId || ""}><option value="">None</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label><label>Related partner request<select name="relatedPartnerRequestId" defaultValue={item?.relatedPartnerRequestId || ""}><option value="">None</option>{requests.map((request) => <option key={request.id} value={request.id}>{request.title}</option>)}</select></label><label>Resolution notes<textarea name="resolutionNotes" rows={3} defaultValue={item?.resolutionNotes} /></label><label>Internal notes<textarea name="notes" rows={3} defaultValue={item?.notes} /></label><SourceSelect value={item?.source} /><button className="primary full"><Save /> Save Blocker</button></form>; }
  const item = modal.record as AccountEvent | undefined; return <form onSubmit={onSubmit}><h2>{item?.eventType === "decision" ? "Add Major Decision" : "Add Account Note"}</h2><p>This entry becomes part of the permanent account history.</p><input type="hidden" name="accountId" value={accountId} /><input type="hidden" name="eventType" value={item?.eventType || "note"} /><label>Title<input name="title" required /></label><label>Detail<textarea name="detail" rows={5} required /></label><SourceSelect /><button className="primary full"><Save /> Save to History</button></form>;
}

function SourceSelect({ value }: { value?: string }) { return <label>Data source<select name="source" defaultValue={value || "Manual entry"}>{DATA_SOURCES.map((item) => <option key={item}>{item}</option>)}</select></label>; }

type AttentionItem = { key: string; kind: string; title: string; detail: string; account: string; meta: string; tone: string };

function summarize(data: PsmState, accounts: Account[]) {
  const date = today();
  const openTasks = data.tasks.filter((task) => openTaskStatuses.has(task.status));
  const dueToday = openTasks.filter((task) => task.dueDate === date).length;
  const overdue = openTasks.filter((task) => task.dueDate && task.dueDate < date).length;
  const blocked = data.blockers.filter((item) => openBlockerStatuses.has(item.status)).length + openTasks.filter((task) => task.status === "Blocked").length + data.partnerRequests.filter((request) => openRequestStatuses.has(request.status) && request.blocksAccount).length;
  const waitingPartner = openTasks.filter((task) => task.status === "Waiting on partner").length + data.partnerRequests.filter((request) => openRequestStatuses.has(request.status)).length;
  const missingReportAccounts = accounts.filter((account) => {
    const latestReview = data.weeklyReviews.filter((review) => review.accountId === account.id).sort((left, right) => right.weekEnd.localeCompare(left.weekEnd))[0];
    return !latestReview || latestReview.reportsStatus === "Missing" || latestReview.reportsStatus === "Partial" || latestReview.reportsStatus === "Not reviewed";
  }).length;
  const missingData = missingReportAccounts + data.blockers.filter((blocker) => openBlockerStatuses.has(blocker.status) && /missing|report|cogs/i.test(blocker.category)).length;
  const accountsAttention = accounts.filter((account) => { const workflow = data.workflows.find((item) => item.accountId === account.id); return !workflow || workflow.healthStatus === "At risk" || workflow.healthStatus === "Critical" || freshness(workflow.updatedAt) === "Stale"; }).length;
  return { dueToday, overdue, blocked, waitingPartner, missingData, accountsAttention };
}

function buildAttention(data: PsmState, accounts: Account[], view: AttentionView): AttentionItem[] {
  const date = today();
  const rows: AttentionItem[] = [];
  const add = (row: AttentionItem) => rows.push(row);
  for (const task of data.tasks.filter((item) => openTaskStatuses.has(item.status))) {
    const overdue = Boolean(task.dueDate && task.dueDate < date);
    const dueToday = task.dueDate === date;
    const matches = view === "All attention" ? overdue || dueToday || /Waiting|Blocked/.test(task.status) : view === "My overdue tasks" ? overdue : view === "Waiting on partners" ? task.status === "Waiting on partner" : view === "Blocked accounts" ? task.status === "Blocked" : false;
    if (matches) add({ key: `task-${task.id}`, kind: "Task", title: task.title, detail: task.blockedReason || task.notes || `${task.owner} owns this task.`, account: accountName(accounts, task.accountId), meta: `${task.status} · due ${formatDate(task.dueDate)}`, tone: overdue || task.status === "Blocked" ? "critical" : "" });
  }
  for (const request of data.partnerRequests.filter((item) => openRequestStatuses.has(item.status))) {
    const missingCogs = request.requestType === "COGS";
    if (view === "All attention" || view === "Waiting on partners" || (view === "Missing COGS" && missingCogs) || (view === "Blocked accounts" && request.blocksAccount)) add({ key: `request-${request.id}`, kind: "Partner", title: request.title, detail: request.description || request.notes || "Partner response is still outstanding.", account: accountName(accounts, request.accountId), meta: `${daysSince(request.dateRequested)} days waiting · ${request.status}`, tone: request.blocksAccount ? "critical" : "" });
  }
  for (const blocker of data.blockers.filter((item) => openBlockerStatuses.has(item.status))) {
    const missingCogs = blocker.category === "COGS missing";
    const missingData = /missing|report|cogs/i.test(blocker.category);
    if (view === "All attention" || view === "Blocked accounts" || (view === "Missing COGS" && missingCogs) || (view === "Missing reports" && missingData)) add({ key: `blocker-${blocker.id}`, kind: "Blocker", title: blocker.title, detail: blocker.notes || `${blocker.responsibleParty} is responsible.`, account: accountName(accounts, blocker.accountId), meta: `${daysSince(blocker.dateOpened)} days blocked · ${blocker.category}`, tone: "critical" });
  }
  for (const account of accounts) {
    const workflow = data.workflows.find((item) => item.accountId === account.id);
    const latestReview = data.weeklyReviews.filter((item) => item.accountId === account.id).sort((a, b) => b.weekEnd.localeCompare(a.weekEnd))[0];
    const latestEvent = data.events.find((item) => item.accountId === account.id);
    if ((view === "Critical accounts" || view === "All attention") && (!workflow || workflow.healthStatus === "At risk" || workflow.healthStatus === "Critical" || freshness(workflow.updatedAt) === "Stale")) add({ key: `health-${account.id}`, kind: "Account", title: `${account.name} needs attention`, detail: workflow?.healthReason || (workflow ? "Account workflow has not been updated in the last 14 days." : "Account health and ownership have not been reviewed."), account: account.name, meta: workflow ? `${workflow.stage} · ${workflow.healthStatus} · ${freshness(workflow.updatedAt)}` : "Workflow missing", tone: "critical" });
    if (view === "Reviews not completed" && (!latestReview || latestReview.status !== "Completed" || daysSince(latestReview.weekEnd) > 7)) add({ key: `review-${account.id}`, kind: "Review", title: `${account.name} weekly review is incomplete`, detail: latestReview ? `Latest review is ${latestReview.status.toLowerCase()}.` : "No guided weekly review is saved.", account: account.name, meta: latestReview ? formatDate(latestReview.weekEnd) : "Missing", tone: "" });
    if (view === "Missing reports" && (!latestReview || latestReview.reportsStatus === "Missing" || latestReview.reportsStatus === "Partial" || latestReview.reportsStatus === "Not reviewed")) add({ key: `reports-${account.id}`, kind: "Reports", title: `${account.name} report package needs review`, detail: latestReview ? `Report status: ${latestReview.reportsStatus}.` : "No weekly review has confirmed report receipt.", account: account.name, meta: latestReview?.weekEnd ? formatDate(latestReview.weekEnd) : "Missing", tone: "critical" });
    if (view === "Accounts with no recent activity" && (!latestEvent || daysSince(latestEvent.occurredAt) > 14)) add({ key: `activity-${account.id}`, kind: "Activity", title: `${account.name} has no recent PSM activity`, detail: "No saved task, request, blocker, review, note, or workflow change in the last 14 days.", account: account.name, meta: latestEvent ? formatDate(latestEvent.occurredAt) : "No history", tone: "" });
  }
  return rows.slice(0, 100);
}

export function WeeklyReviewEditor({ account, period, completedWork }: { account: Account; period: { id: string; startDate: string; endDate: string; reports: string[] }; completedWork: string }) {
  const [state, setState] = useState<PsmState>(() => emptyPsmState(storageFallback()));
  const [review, setReview] = useState<WeeklyReview | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState("");

  useEffect(() => {
    fetch("/api/psm", { cache: "no-store" }).then(async (response) => { const body = await response.json(); if (!response.ok && !body.storage) throw new Error(body.error || "Review data could not be loaded."); return body as PsmState; }).then((body) => { setState(body); const saved = body.weeklyReviews.find((item) => item.accountId === account.id && item.periodId === period.id) || null; setReview(saved); setDraft(saved?.partnerUpdateDraft || ""); }).catch((reason) => setError(reason instanceof Error ? reason.message : "Review data could not be loaded."));
  }, [account.id, period.id]);

  const blockers = state.blockers.filter((item) => item.accountId === account.id && openBlockerStatuses.has(item.status)).map((item) => item.title).join("; ");
  const requests = state.partnerRequests.filter((item) => item.accountId === account.id && openRequestStatuses.has(item.status)).map((item) => item.title).join("; ");

  function compose(form: HTMLFormElement) {
    const values = Object.fromEntries(new FormData(form).entries());
    return `Weekly partner update\n\nHealth: ${values.healthStatus}\n\nCompleted work\n${values.completedWork || "No completed work was recorded this week."}\n\nCurrent blockers\n${values.openBlockers || "No open blockers were recorded."}\n\nWaiting on partner\n${values.partnerRequests || "No partner requests are currently outstanding."}\n\nMissing information / reports\n${values.reportsStatus || "Not reviewed"}\n\nNext actions\n${values.nextActions || "Next actions are still being finalized."}${values.partnerUpdateNotes ? `\n\nImportant notes\n${values.partnerUpdateNotes}` : ""}`;
  }

  async function persist(form: HTMLFormElement, status: "Draft" | "Completed") {
    setError("");
    const record = { ...Object.fromEntries(new FormData(form).entries()), id: review?.id, accountId: account.id, periodId: period.id, weekStart: period.startDate, weekEnd: period.endDate, status, partnerUpdateDraft: draft || compose(form), source: "Manual entry" };
    try {
      const response = await fetch("/api/psm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entity: "weeklyReview", record }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Weekly review could not be saved.");
      setReview(body.record as WeeklyReview); setDraft((body.record as WeeklyReview).partnerUpdateDraft); setNotice(status === "Completed" ? "Weekly review completed." : "Weekly review draft saved.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Weekly review could not be saved."); }
  }

  return <article className="panel psm-weekly-panel"><div className="panel-head"><div><h2>Guided PSM Review</h2><p>Internal review fields feed an editable partner draft. Nothing is sent automatically.</p></div><Status value={review?.status || "Not started"} /></div><StorageBanner storage={state.storage} error={error} compact />
    <form onSubmit={(event) => { event.preventDefault(); void persist(event.currentTarget, "Draft"); }}>
      <div className="psm-review-fields"><label>Revenue status<textarea name="revenueStatus" rows={2} defaultValue={review?.revenueStatus} /></label><label>Ads status<textarea name="adsStatus" rows={2} defaultValue={review?.adsStatus} /></label><label>Inventory issues<textarea name="inventoryIssues" rows={2} defaultValue={review?.inventoryIssues} /></label><label>SKU issues<textarea name="skuIssues" rows={2} defaultValue={review?.skuIssues} /></label><label>Reports<select name="reportsStatus" defaultValue={review?.reportsStatus || (period.reports.length >= 7 ? "Received" : period.reports.length ? "Partial" : "Missing")}><option>Received</option><option>Partial</option><option>Missing</option><option>Not reviewed</option></select></label><label>Health status<select name="healthStatus" defaultValue={review?.healthStatus || "Monitor"}>{HEALTH_STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label><label>Completed work<textarea name="completedWork" rows={3} defaultValue={review?.completedWork || completedWork} /></label><label>Open blockers<textarea name="openBlockers" rows={3} defaultValue={review?.openBlockers || blockers} /></label><label>Partner requests<textarea name="partnerRequests" rows={3} defaultValue={review?.partnerRequests || requests} /></label><label>Next actions<textarea name="nextActions" rows={3} defaultValue={review?.nextActions} required /></label><label>Internal notes<textarea name="internalNotes" rows={3} defaultValue={review?.internalNotes} /></label><label>Partner update notes<textarea name="partnerUpdateNotes" rows={3} defaultValue={review?.partnerUpdateNotes} /></label></div>
      <div className="psm-draft-head"><div><small>EDITABLE PARTNER UPDATE</small><b>Review before sharing</b></div><button type="button" className="secondary" onClick={(event) => { const form = event.currentTarget.closest("form"); if (form) setDraft(compose(form)); }}><RefreshCw /> Generate / Refresh Draft</button></div>
      <textarea className="review-note partner-draft" aria-label="Weekly partner update draft" value={draft} onChange={(event) => setDraft(event.target.value)} rows={14} placeholder="Generate the editable partner update from the review fields." />
      <div className="psm-review-actions"><button className="secondary" disabled={!state.storage.writable}><Save /> Save Draft</button><button type="button" className="primary" disabled={!state.storage.writable} onClick={(event) => { const form = event.currentTarget.closest("form") as HTMLFormElement | null; if (form?.reportValidity()) void persist(form, "Completed"); }}><CheckCircle2 /> Complete Review</button></div>
      <input type="hidden" name="status" value="Draft" />
    </form>{notice && <div className="psm-inline-success"><Check />{notice}</div>}
  </article>;
}
