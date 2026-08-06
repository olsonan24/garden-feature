"use client";

import { Bot, ChevronDown, Database, Maximize2, Settings, Sparkles, X } from "lucide-react";
import { JarvisCommandBar } from "./jarvis-command-bar";
import { useJarvisAssistant } from "./jarvis-assistant-provider";
import { JarvisDraftEditor, JarvisEvidencePanel, JarvisSuggestedActionCard, JarvisSuggestedActionsPanel } from "./jarvis-panels";

export function JarvisGlobalAssistant({ openCommandCenter }: { openCommandCenter: () => void }) {
  const {
    open, setOpen, commandCenterActive, currentAccountName, lastResponse, evidence, pendingApproval,
    suggestedActions, setSettingsOpen, demoDataWarning, mode, draftText, assistantName,
  } = useJarvisAssistant();
  if (commandCenterActive) return null;

  if (!open) return <button type="button" className="angora-jarvis-global-trigger" onClick={() => setOpen(true)} aria-label={`Open ${assistantName} assistant`}><span><Bot /></span><p><b>{assistantName}</b><small>{currentAccountName || "Portfolio command"}</small></p><Sparkles /></button>;

  return <aside className="angora-jarvis-global" aria-label={`${assistantName} global assistant`}>
    <header><div className="angora-jarvis-global-brand"><span><Bot /></span><p><b>{assistantName}</b><small>{currentAccountName ? `${currentAccountName} context` : "Portfolio context"}</small></p></div><div><button type="button" title="Open Command Center" aria-label="Open JARVIS Command Center" onClick={openCommandCenter}><Maximize2 /></button><button type="button" title="Settings" aria-label="Open JARVIS settings" onClick={() => setSettingsOpen(true)}><Settings /></button><button type="button" title="Minimize" aria-label="Minimize JARVIS assistant" onClick={() => setOpen(false)}><ChevronDown /></button></div></header>
    <div className={`angora-jarvis-global-status angora-jarvis-global-status--${mode}`}><i />{lastResponse}</div>
    {demoDataWarning && <p className="angora-jarvis-global-warning">{demoDataWarning}</p>}
    <JarvisCommandBar compact suggestions={false} />
    <div className="angora-jarvis-global-content">
      {pendingApproval ? <JarvisSuggestedActionCard key={pendingApproval.id} action={pendingApproval} /> : <>
        {draftText && <JarvisDraftEditor />}
        {evidence.length > 0 && <section><header><Database />Evidence <b>{evidence.length}</b></header><JarvisEvidencePanel evidence={evidence} limit={4} /></section>}
        {suggestedActions.length > 0 && <section><header><Sparkles />Suggested actions</header><JarvisSuggestedActionsPanel actions={suggestedActions.slice(0, 3)} /></section>}
        {!draftText && !evidence.length && !suggestedActions.length && <div className="angora-jarvis-global-empty"><Sparkles /><b>Ready for a command</b><p>Navigate, analyze, draft, or prepare an approval-gated action using the current Garden context.</p></div>}
      </>}
    </div>
    <button type="button" className="angora-jarvis-global-close" onClick={() => setOpen(false)}><X />Close assistant</button>
  </aside>;
}
