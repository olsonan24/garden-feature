"use client";

import { AlertTriangle, ArrowRight, Check, Circle, Clock3, FileWarning, ShieldAlert, Users, X } from "lucide-react";
import { useState } from "react";
import type { JarvisEvidenceItem, JarvisMissionQueue, JarvisMissionSectionKey, JarvisSuggestedAction } from "../lib/jarvis-types";
import { useJarvisAssistant } from "./jarvis-assistant-provider";

const missionLabels: Record<JarvisMissionSectionKey, { label: string; icon: typeof Clock3 }> = {
  dueToday: { label: "Due today", icon: Clock3 },
  overdue: { label: "Overdue", icon: AlertTriangle },
  blocked: { label: "Blocked", icon: ShieldAlert },
  waitingOnPartner: { label: "Waiting on partner", icon: Users },
  missingReports: { label: "Missing reports", icon: FileWarning },
  needsReview: { label: "Needs review", icon: Circle },
  criticalAccounts: { label: "Critical accounts", icon: AlertTriangle },
};

export function JarvisMissionQueuePanel({ queue, limit = 4 }: { queue: JarvisMissionQueue; limit?: number }) {
  return <div className="angora-jarvis-mission-sections">
    {(Object.keys(missionLabels) as JarvisMissionSectionKey[]).map((key) => {
      const items = queue[key];
      const Icon = missionLabels[key].icon;
      return <section className="angora-jarvis-mission-section" key={key}>
        <header><span><Icon />{missionLabels[key].label}</span><b>{items.length}</b></header>
        {items.length ? <div className="angora-jarvis-mission-list">{items.slice(0, limit).map((item) => <article key={`${key}:${item.id}`} className={`angora-jarvis-severity-${item.severity}`}><i /><div><b>{item.label}</b><small>{item.accountName} · {item.detail}</small></div></article>)}</div> : <p className="angora-jarvis-empty">No data available yet.</p>}
      </section>;
    })}
  </div>;
}

function EvidenceIcon({ item }: { item: JarvisEvidenceItem }) {
  if (item.severity === "critical") return <ShieldAlert />;
  if (item.severity === "warning") return <AlertTriangle />;
  return <Check />;
}

export function JarvisEvidencePanel({ evidence, limit = 12 }: { evidence: JarvisEvidenceItem[]; limit?: number }) {
  return <div className="angora-jarvis-evidence-list">
    {evidence.length ? evidence.slice(0, limit).map((item, index) => <article key={`${item.type}:${item.sourceId || item.label}:${index}`} className={`angora-jarvis-evidence-item angora-jarvis-severity-${item.severity || "info"}`}><span><EvidenceIcon item={item} /></span><div><small>{item.type.replace(/_/g, " ")}</small><b>{item.label}</b><p>{item.detail}</p>{item.timestamp && <time dateTime={item.timestamp}>{formatEvidenceDate(item.timestamp)}</time>}</div></article>) : <p className="angora-jarvis-empty">No supporting evidence is available for the current result.</p>}
  </div>;
}

export function JarvisSuggestedActionsPanel({ actions }: { actions: JarvisSuggestedAction[] }) {
  const { chooseSuggestedAction } = useJarvisAssistant();
  return <div className="angora-jarvis-suggested-list">
    {actions.length ? actions.map((action) => <article key={action.id}><div><small>{action.requiresApproval ? "APPROVAL REQUIRED" : "SAFE NAVIGATION / DRAFT"}</small><b>{action.label}</b><p>{action.reason}</p></div><button type="button" onClick={() => chooseSuggestedAction(action)}>{action.requiresApproval ? "Review" : "Open"}<ArrowRight /></button></article>) : <p className="angora-jarvis-empty">No suggested actions are supported by the current evidence.</p>}
  </div>;
}

export function JarvisSuggestedActionCard({ action }: { action: JarvisSuggestedAction }) {
  const { updatePendingApproval, approvePendingAction, cancelPendingAction, mode } = useJarvisAssistant();
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<Record<string, string | boolean>>(action.proposedFields || {});
  const saving = mode === "thinking";

  function saveEdits() {
    void updatePendingApproval(fields).catch(() => undefined);
    setEditing(false);
  }

  return <article className="angora-jarvis-action-card" aria-label="Approval required action">
    <header><span><ShieldAlert /></span><div><small>APPROVAL REQUIRED</small><h3>{action.label}</h3><p>{action.accountName || "Account context required"}</p></div></header>
    <div className="angora-jarvis-action-reason"><b>Reason</b><p>{action.reason}</p></div>
    <div className="angora-jarvis-proposed-fields"><b>Proposed fields</b>{Object.entries(fields).map(([key, value]) => <label key={key}><span>{humanize(key)}</span>{typeof value === "boolean" ? <input type="checkbox" checked={value} disabled={!editing} onChange={(event) => setFields((current) => ({ ...current, [key]: event.target.checked }))} /> : editing ? <input value={String(value)} onChange={(event) => setFields((current) => ({ ...current, [key]: event.target.value }))} /> : <strong>{String(value) || "Not set"}</strong>}</label>)}</div>
    <div className="angora-jarvis-action-evidence"><b>Evidence</b><span>{action.evidence.length} linked item{action.evidence.length === 1 ? "" : "s"}</span></div>
    <footer>
      {editing ? <button type="button" className="angora-jarvis-approve" onClick={saveEdits}><Check />Save edits</button> : <button type="button" className="angora-jarvis-approve" onClick={() => void approvePendingAction()} disabled={saving}><Check />{saving ? "Saving…" : "Approve"}</button>}
      <button type="button" onClick={() => { if (editing) setFields(action.proposedFields || {}); setEditing((current) => !current); }} disabled={saving}>{editing ? <><X />Discard edits</> : "Edit"}</button>
      <button type="button" onClick={() => void cancelPendingAction()} disabled={saving}>Cancel</button>
    </footer>
    <small className="angora-jarvis-safety-note">{action.executionCapability === "garden_psm_write" || !action.executionCapability ? "Approval saves only to Garden and confirms the record by reading it back." : action.executionCapability === "not_executable" ? "Approval records the decision only; this recommendation has no enabled executor." : "Approval records the decision only. A separate explicit integration action is still required before any send or post."}</small>
  </article>;
}

export function JarvisDraftEditor() {
  const { draftText, setDraftText, currentAccountName } = useJarvisAssistant();
  if (!draftText) return null;
  return <section className="angora-jarvis-draft-editor"><header><div><small>EDITABLE DRAFT</small><h3>{currentAccountName || "Account"} weekly partner update</h3></div><span>Not sent</span></header><label><span className="angora-jarvis-sr-only">Weekly partner update draft</span><textarea value={draftText} onChange={(event) => setDraftText(event.target.value)} rows={18} /></label><p>Review and copy this draft into your approved communication workflow. JARVIS does not send it.</p></section>;
}

function humanize(value: string) { return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase()); }
function formatEvidenceDate(value: string) { const parsed = new Date(value); return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
