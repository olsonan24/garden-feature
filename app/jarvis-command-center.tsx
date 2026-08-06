"use client";

import { Activity, BrainCircuit, Database, FileText, ListTodo, Radio, Settings, ShieldCheck, Sparkles } from "lucide-react";
import { JarvisCommandBar } from "./jarvis-command-bar";
import { useJarvisAssistant } from "./jarvis-assistant-provider";
import { JarvisDraftEditor, JarvisEvidencePanel, JarvisMissionQueuePanel, JarvisSuggestedActionCard, JarvisSuggestedActionsPanel } from "./jarvis-panels";

const modeText = {
  idle: "Systems operational",
  listening: "Listening for command",
  thinking: "Routing command",
  analyzing: "Analyzing Garden evidence",
  navigating: "Navigating account context",
  briefing: "Briefing ready",
  draftReady: "Draft ready",
  needsAttention: "Operator attention required",
  error: "System limitation detected",
} as const;

export function JarvisCommandCenter() {
  const {
    mode, briefing, lastResponse, currentAccountName, demoDataWarning, psmError, pendingApproval,
    suggestedActions, evidence, setSettingsOpen, appearance, assistantName, draftText,
  } = useJarvisAssistant();
  const shellClass = [
    "angora-jarvis-shell",
    !appearance.grid && "angora-jarvis-shell--no-grid",
    !appearance.glow && "angora-jarvis-shell--no-glow",
    appearance.compact && "angora-jarvis-shell--compact",
    appearance.animation === "reduced" && "angora-jarvis-shell--reduced-motion",
    `angora-jarvis-shell--hud-${appearance.hudIntensity}`,
  ].filter(Boolean).join(" ");

  return <section className={shellClass} aria-label="JARVIS Command Center">
    <div className="angora-jarvis-grid" aria-hidden="true" />
    <header className="angora-jarvis-topline"><div><span className="angora-jarvis-system-dot" /><p><small>ANGORA OPERATOR SYSTEM</small><b>{modeText[mode]}</b></p></div><div><span>{currentAccountName || "Portfolio context"}</span><strong>{assistantName}</strong></div></header>

    {(demoDataWarning || psmError) && <div className="angora-jarvis-warning" role="alert"><ShieldCheck /><p><b>{demoDataWarning ? "Demo evidence boundary" : "PSM context limitation"}</b>{demoDataWarning || psmError}</p></div>}

    <div className="angora-jarvis-scene">
      <aside className="angora-jarvis-panel angora-jarvis-briefing" id="angora-jarvis-briefing">
        <header><span><Activity /></span><div><small>LIVE BRIEFING</small><h2>{briefing.title}</h2></div></header>
        <p>{lastResponse || briefing.summary}</p>
        <div className="angora-jarvis-briefing-meta"><span><b>{briefing.status}</b> posture</span><span><b>{briefing.evidence.length}</b> evidence items</span><span><b>{briefing.suggestedActions.length}</b> next actions</span></div>
        {briefing.dataWarnings.map((warning) => <small className="angora-jarvis-data-warning" key={warning}>{warning}</small>)}
      </aside>

      <div className="angora-jarvis-core-stage" aria-label={`${assistantName} status: ${modeText[mode]}`}>
        <div className="angora-jarvis-orbit angora-jarvis-orbit--one" aria-hidden="true" />
        <div className="angora-jarvis-orbit angora-jarvis-orbit--two" aria-hidden="true" />
        <div className="angora-jarvis-orbit angora-jarvis-orbit--three" aria-hidden="true" />
        <div className={`angora-jarvis-core angora-jarvis-core--${mode}`}><div className="angora-jarvis-orb"><BrainCircuit /></div></div>
        <div className="angora-jarvis-core-status"><small>ACTIVE MODE</small><b>{modeText[mode]}</b><span>{currentAccountName || "Portfolio-wide mission queue"}</span></div>
      </div>

      <aside className="angora-jarvis-panel angora-jarvis-evidence" id="angora-jarvis-evidence">
        <header><span><Database /></span><div><small>VERIFICATION LAYER</small><h2>Evidence</h2></div><b>{evidence.length || briefing.evidence.length}</b></header>
        <JarvisEvidencePanel evidence={evidence.length ? evidence : briefing.evidence} limit={7} />
      </aside>

      <section className="angora-jarvis-panel angora-jarvis-mission-queue" id="angora-jarvis-missions">
        <header><span><ListTodo /></span><div><small>OPERATOR PRIORITIES</small><h2>Mission Queue</h2></div></header>
        <JarvisMissionQueuePanel queue={briefing.missionQueue} limit={3} />
      </section>

      <aside className="angora-jarvis-panel angora-jarvis-actions" id="angora-jarvis-actions">
        <header><span><ShieldCheck /></span><div><small>SAFE ACTION LAYER</small><h2>Suggested Actions</h2></div></header>
        {pendingApproval ? <JarvisSuggestedActionCard key={pendingApproval.id} action={pendingApproval} /> : <JarvisSuggestedActionsPanel actions={suggestedActions.length ? suggestedActions : briefing.suggestedActions} />}
      </aside>
    </div>

    {draftText && <div className="angora-jarvis-panel angora-jarvis-draft"><JarvisDraftEditor /></div>}

    <div className="angora-jarvis-command-dock"><div className="angora-jarvis-command-state"><Radio /><span>{modeText[mode]}</span></div><JarvisCommandBar /></div>

    <nav className="angora-jarvis-rail" aria-label="JARVIS command center panels">
      <a href="#angora-jarvis-briefing" aria-label="Briefing" title="Briefing"><Sparkles /></a>
      <a href="#angora-jarvis-missions" aria-label="Mission queue" title="Mission queue"><ListTodo /></a>
      <a href="#angora-jarvis-evidence" aria-label="Evidence" title="Evidence"><Database /></a>
      <a href="#angora-jarvis-actions" aria-label="Suggested actions" title="Suggested actions"><FileText /></a>
      <button type="button" aria-label="Open JARVIS settings" title="Settings" onClick={() => setSettingsOpen(true)}><Settings /></button>
    </nav>
  </section>;
}
