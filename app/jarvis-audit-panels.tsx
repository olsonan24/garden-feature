"use client";

import { AlertTriangle, BarChart3, CheckCircle2, ChevronRight, Database, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { FinancialAttentionResult } from "../lib/audit/amazon/account-triage";
import type { AuditRun } from "../lib/audit/shared/audit-run";
import type { AuditFinding } from "../lib/audit/shared/audit-finding";
import type { AccountStateBlock } from "../lib/audit/shared/account-state-block";
import { useJarvisAssistant } from "./jarvis-assistant-provider";

const money = (value?: number) => value === undefined ? "Unavailable" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const displayValue = (value?: number | string | null) => typeof value === "number" ? Number.isInteger(value) ? String(value) : value.toFixed(2) : value ?? "Unavailable";

export function PortfolioFinancialAttentionPanel({ writable, onOpenAccount }: { writable: boolean; onOpenAccount: (accountId: string) => void }) {
  const [rankings, setRankings] = useState<FinancialAttentionResult[]>([]);
  const [run, setRun] = useState<AuditRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/audits", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok && response.status !== 404) throw new Error(body.error || "Audit history could not be loaded.");
        return body;
      })
      .then((body) => {
        if (!active) return;
        setRun(body.latestPortfolio?.run || null);
        setRankings(body.latestPortfolio?.rankings || []);
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Audit history could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function runTriage() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/audits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "portfolio" }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Portfolio triage failed.");
      setRun(body.run); setRankings(body.rankings || []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Portfolio triage failed."); }
    finally { setLoading(false); }
  }

  return <article className="panel jarvis-financial-attention">
    <div className="panel-head"><div><h2>Financial Attention Queue</h2><p>Deterministic ranking from persisted account evidence. Scores are explainable and versioned.</p></div><button className="secondary" type="button" disabled={!writable || loading} onClick={() => void runTriage()}><RefreshCw className={loading ? "angora-jarvis-spin" : ""} />{run ? "Run new triage" : "Run portfolio triage"}</button></div>
    {error && <div className="jarvis-audit-warning" role="alert"><AlertTriangle />{error}</div>}
    {run && <div className="jarvis-audit-meta"><span>Run <b>{run.id}</b></span><span>Engine <b>{run.versions.engine}</b></span><span>Playbook <b>{run.versions.playbook}</b></span><span>Completed <b>{new Date(run.completedAt).toLocaleString()}</b></span></div>}
    {!loading && !rankings.length && <div className="jarvis-audit-empty"><Database /><b>No saved portfolio triage</b><p>{writable ? "Run triage to create an immutable ranking from real accounts. No demo account will be substituted." : "Central writable storage and an authorized PSM role are required."}</p></div>}
    <div className="jarvis-attention-list">{rankings.map((item, index) => <article key={item.accountId} className={`jarvis-attention-${item.priority}`}><div className="jarvis-attention-rank"><small>#{index + 1}</small><strong>{item.score}</strong><span>{item.priority}</span></div><div className="jarvis-attention-copy"><header><h3>{item.accountName}</h3><span>{item.confidence} confidence · {Math.round(item.dataReadiness.completeness * 100)}% data</span></header><p>{item.primaryReason}</p><div><span><b>Metric</b>{item.affectedMetric}</span><span><b>Current</b>{displayValue(item.currentValue)}</span><span><b>Comparison</b>{displayValue(item.comparisonValue)}</span><span><b>Period</b>{item.timePeriod}</span><span><b>Dollar impact</b>{money(item.estimatedDollarImpact)}</span></div><small><ShieldCheck />Next: {item.recommendedNextAction}</small></div><button type="button" className="link" onClick={() => onOpenAccount(item.accountId)}>Open account <ChevronRight /></button></article>)}</div>
  </article>;
}

export function AccountAuditPanel({ accountId, writable }: { accountId: string; writable: boolean }) {
  const { chooseSuggestedAction } = useJarvisAssistant();
  const [run, setRun] = useState<AuditRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch(`/api/audits?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Account audit history could not be loaded.");
        return body;
      })
      .then((body) => {
        if (active) setRun((body.history || []).find((item: AuditRun) => item.auditType === "account-deep") || null);
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Account audit history could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accountId]);

  async function runAudit() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/audits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "account", accountId }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Deep account audit failed.");
      setRun(body.run);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Deep account audit failed."); }
    finally { setLoading(false); }
  }

  function reviewRecommendation(finding: AuditFinding) {
    const recommendation = finding.recommendation;
    if (!recommendation) return;
    void chooseSuggestedAction({
      id: recommendation.id,
      type: "audit_recommendation",
      label: recommendation.proposedAction,
      accountId: recommendation.accountId,
      reason: finding.explanation,
      evidence: finding.evidence.map((item) => ({ type: "report", label: item.metricName, detail: `${String(item.currentValue ?? "Unavailable")} · ${item.calculationMethod}`, accountId: recommendation.accountId, sourceId: item.rawImportId || item.sourceRowReference || item.id, severity: finding.severity === "critical" ? "critical" : finding.severity === "warning" ? "warning" : "info" })),
      proposedFields: { proposedAction: recommendation.proposedAction },
      requiresApproval: true,
      requiredRole: recommendation.requiredRole,
      executionCapability: recommendation.executionCapability,
      recommendationId: recommendation.id,
      originalRecommendation: recommendation,
    });
  }

  return <article className="panel jarvis-deep-audit">
    <div className="panel-head"><div><h2>Account and SKU Audit</h2><p>SKU, PPC, inventory, listing, blocker, and data-readiness diagnosis with evidence gates.</p></div><button className="secondary" type="button" disabled={!writable || loading} onClick={() => void runAudit()}><BarChart3 />{run ? "Run new deep audit" : "Run deep audit"}</button></div>
    {error && <div className="jarvis-audit-warning" role="alert"><AlertTriangle />{error}</div>}
    <AccountStateControls accountId={accountId} writable={writable} />
    {!loading && !run && <div className="jarvis-audit-empty"><Database /><b>No immutable deep audit exists</b><p>No finding is shown until the real account audit is run.</p></div>}
    {run && <><div className="jarvis-audit-meta"><span>Status <b>{run.status}</b></span><span>Findings <b>{run.findings.length}</b></span><span>Completeness <b>{Math.round(run.dataReadiness.completeness * 100)}%</b></span><span>State Block input <b>{run.sourceAccountStateBlockVersion ?? "Initial"}</b></span></div>{run.dataReadiness.issues.length > 0 && <details className="jarvis-readiness"><summary><AlertTriangle />{run.dataReadiness.issues.length} data-readiness issue{run.dataReadiness.issues.length === 1 ? "" : "s"}</summary><div>{run.dataReadiness.issues.map((issue) => <p key={issue.code}><b>{issue.message}</b><span>{issue.whyItMatters}</span><small>Needed: {issue.resolution}</small></p>)}</div></details>}<div className="jarvis-finding-list">{run.findings.map((finding) => <details key={finding.id} className={`jarvis-finding jarvis-finding-${finding.severity}`}><summary><span>{finding.severity === "critical" ? <AlertTriangle /> : <CheckCircle2 />}</span><div><small>{finding.category}{finding.skuId ? ` · SKU ${finding.skuId}` : ""}</small><b>{finding.title}</b><p>{finding.explanation}</p></div><strong>{finding.dollarImpact !== undefined ? money(finding.dollarImpact) : finding.confidence}</strong></summary><div className="jarvis-finding-detail"><h4>Evidence</h4>{finding.evidence.map((evidence) => <p key={evidence.id}><b>{evidence.metricName}</b><span>{String(evidence.currentValue ?? "Unavailable")}{evidence.comparisonValue !== undefined ? ` vs ${String(evidence.comparisonValue)}` : ""}</span><small>{evidence.sourceReport}{evidence.sourceRowReference ? ` · ${evidence.sourceRowReference}` : ""} · {evidence.calculationMethod}</small></p>)}{finding.recommendation && <div className="jarvis-finding-action"><b>Recommended action</b><p>{finding.recommendation.proposedAction}</p><small>{finding.recommendation.requiredRole} approval · {finding.recommendation.executionCapability.replace(/_/g, " ")}</small><button type="button" className="secondary" disabled={!writable} onClick={() => reviewRecommendation(finding)}>Review action</button></div>}</div></details>)}</div></>}
  </article>;
}

function AccountStateControls({ accountId, writable }: { accountId: string; writable: boolean }) {
  const [current, setCurrent] = useState<AccountStateBlock | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/account-state?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json().catch(() => ({})) }))
      .then(({ response, body }) => { if (active && response.ok) setCurrent(body.current || null); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [accountId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setMessage("");
    const data = new FormData(event.currentTarget);
    const number = (name: string) => String(data.get(name) || "").trim();
    try {
      const response = await fetch("/api/account-state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId, update: { assignedPsm: String(data.get("assignedPsm") || ""), lifecyclePhase: String(data.get("lifecyclePhase") || ""), brandTerms: String(data.get("brandTerms") || "").split(",").map((item) => item.trim()).filter(Boolean), assumptions: { acosGoal: number("acosGoal"), tacosGoal: number("tacosGoal"), revenueTarget: number("revenueTarget"), profitTarget: number("profitTarget") } } }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.readBackConfirmed) throw new Error(body.error || "Account memory could not be confirmed.");
      setCurrent(body.block); setMessage(`Revision ${body.block.version} saved and read back.`);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Account memory could not be saved."); }
    finally { setSaving(false); }
  }

  return <details className="jarvis-account-state-controls">
    <summary><Database />Account State Block {current ? `· revision ${current.version}` : "· not created"}</summary>
    <form key={current?.id || accountId} onSubmit={(event) => void save(event)}>
      <p>Save only verified targets and brand terms. Every save appends an immutable revision and becomes input to the next audit.</p>
      <div><label>Assigned PSM<input name="assignedPsm" defaultValue={current?.assignedPsm || ""} /></label><label>Lifecycle phase<input name="lifecyclePhase" defaultValue={current?.lifecyclePhase || ""} /></label></div>
      <div><label>ACoS goal (%)<input name="acosGoal" type="number" step="0.01" defaultValue={current?.assumptions.acosGoal ?? ""} /></label><label>TACoS goal (%)<input name="tacosGoal" type="number" step="0.01" defaultValue={current?.assumptions.tacosGoal ?? ""} /></label><label>Revenue target ($)<input name="revenueTarget" type="number" step="0.01" defaultValue={current?.assumptions.revenueTarget ?? ""} /></label><label>Profit target ($)<input name="profitTarget" type="number" step="0.01" defaultValue={current?.assumptions.profitTarget ?? ""} /></label></div>
      <label>Verified brand terms, comma separated<input name="brandTerms" defaultValue={current?.brandTerms.join(", ") || ""} /></label>
      <button className="secondary" type="submit" disabled={!writable || saving}>{saving ? "Saving revision..." : "Save immutable revision"}</button>
      {message && <small role="status">{message}</small>}
    </form>
  </details>;
}
