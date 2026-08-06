"use client";

import { Bot, BrainCircuit, Check, ChevronDown, Database, Gauge, Image as ImageIcon, KeyRound, Mic, Palette, Plug, RefreshCw, ShieldCheck, TerminalSquare, X } from "lucide-react";
import { useJarvisAssistant } from "./jarvis-assistant-provider";
import { useEffect, useState } from "react";
import type { IntegrationStatus } from "../lib/integrations/types";

type SettingStatus = "Working" | "Disabled" | "Planned" | "Admin only" | "Not connected" | "Not configured" | "Expired token" | "Error";

function Status({ children }: { children: SettingStatus }) { return <span className={`angora-jarvis-setting-status angora-jarvis-setting-status--${children.toLowerCase().replace(/\s+/g, "-")}`}>{children}</span>; }
function Row({ label, detail, status }: { label: string; detail?: string; status: SettingStatus }) { return <div className="angora-jarvis-setting-row"><div><b>{label}</b>{detail && <small>{detail}</small>}</div><Status>{status}</Status></div>; }
function Section({ icon, title, children, open = false }: { icon: React.ReactNode; title: string; children: React.ReactNode; open?: boolean }) { return <details className="angora-jarvis-setting-section" open={open}><summary>{icon}<span>{title}</span><ChevronDown /></summary><div>{children}</div></details>; }
function Toggle({ label, checked, onChange, detail }: { label: string; checked: boolean; onChange: (checked: boolean) => void; detail: string }) { return <label className="angora-jarvis-setting-toggle"><span><b>{label}</b><small>{detail}</small></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i aria-hidden="true" /></label>; }

const commands = ["Account navigation", "Account analysis", "Mission queue", "Blockers and overdue work", "Missing reports", "Weekly update draft", "Task proposal", "Blocker escalation proposal"];

function integrationSettingStatus(status?: IntegrationStatus): SettingStatus {
  if (!status || status.state === "not-configured") return "Not configured";
  if (status.state === "connected") return "Working";
  if (status.state === "expired-token") return "Expired token";
  if (status.state === "disconnected") return "Not connected";
  return "Error";
}

export function JarvisSettingsDrawer() {
  const {
    settingsOpen, setSettingsOpen, appearance, updateAppearance, assistantName, setAssistantName,
    voiceAvailability, voiceEnabled, setVoiceEnabled, history, data, briefing, demoDataWarning, psmError, refreshPsm,
  } = useJarvisAssistant();
  const [connections, setConnections] = useState<{ gmail?: IntegrationStatus; slack?: IntegrationStatus }>({});
  const [aiStatus, setAiStatus] = useState<{ state: string; detail: string }>({ state: "checking", detail: "Checking server configuration." });
  useEffect(() => {
    if (!settingsOpen) return;
    let active = true;
    Promise.all([
      fetch("/api/integrations/status", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/ai/status", { cache: "no-store" }).then((response) => response.json()),
    ]).then(([integrationBody, aiBody]) => { if (active) { setConnections(integrationBody); setAiStatus(aiBody); } }).catch(() => { if (active) setAiStatus({ state: "error", detail: "Configuration status could not be loaded." }); });
    return () => { active = false; };
  }, [settingsOpen]);
  if (!settingsOpen) return null;

  return <aside className="angora-jarvis-settings" role="dialog" aria-label="JARVIS settings" aria-modal="false">
    <header><div><small>SYSTEM CONFIGURATION</small><h2>JARVIS Settings</h2><p>Current capabilities and guarded Phase 1 boundaries.</p></div><button type="button" aria-label="Close JARVIS settings" onClick={() => setSettingsOpen(false)}><X /></button></header>
    <div className="angora-jarvis-settings-scroll">
      <Section icon={<BrainCircuit />} title="AI Brain" open>
        <Row label="Deterministic command engine" detail="Typed and voice commands use the same local intent router." status="Working" />
        <Row label="Server AI provider" detail={aiStatus.detail} status={aiStatus.state === "not-configured" ? "Not configured" : aiStatus.state === "configured-not-verified" ? "Not connected" : aiStatus.state === "error" ? "Error" : "Working"} />
        <Row label="Safe mode" detail="Unsupported commands fail closed." status="Working" />
        <Row label="Evidence required" detail="Recommendations show their Garden source records." status="Working" />
        <Row label="Approval required" detail="Data changes are held as proposals until approval." status="Working" />
      </Section>

      <Section icon={<Palette />} title="Appearance">
        <label className="angora-jarvis-setting-input"><span>Assistant name<small>Working session setting</small></span><input value={assistantName} maxLength={24} onChange={(event) => setAssistantName(event.target.value || "JARVIS")} /></label>
        <Toggle label="HUD grid" detail="Command Center only" checked={appearance.grid} onChange={(grid) => updateAppearance({ grid })} />
        <Toggle label="Core glow" detail="Command Center only" checked={appearance.glow} onChange={(glow) => updateAppearance({ glow })} />
        <Toggle label="Compact panels" detail="Reduces mission panel spacing" checked={appearance.compact} onChange={(compact) => updateAppearance({ compact })} />
        <Toggle label="Reduced animation" detail="Also respects the browser reduced-motion preference" checked={appearance.animation === "reduced"} onChange={(checked) => updateAppearance({ animation: checked ? "reduced" : "standard" })} />
        <label className="angora-jarvis-setting-input"><span>HUD intensity<small>Working session setting</small></span><select value={appearance.hudIntensity} onChange={(event) => updateAppearance({ hudIntensity: event.target.value as typeof appearance.hudIntensity })}><option value="low">Low</option><option value="standard">Standard</option><option value="high">High</option></select></label>
      </Section>

      <Section icon={<Plug />} title="Connections">
        <Row label="Gmail" detail={connections.gmail?.detail || "Server connection status has not been checked."} status={integrationSettingStatus(connections.gmail)} />
        <Row label="Slack" detail={connections.slack?.detail || "Server connection status has not been checked."} status={integrationSettingStatus(connections.slack)} />
        <Row label="Automatic sending or posting" detail="Disabled. Every external action requires an approved recommendation and server authorization." status="Disabled" />
      </Section>

      <Section icon={<TerminalSquare />} title="Commands">
        {commands.map((command) => <Row key={command} label={command} status="Working" />)}
        <div className="angora-jarvis-setting-history"><b>Recent command history</b>{history.length ? history.slice(0, 5).map((item) => <p key={item.id}><span>{item.command}</span><small>{item.intent.replace(/_/g, " ")}</small></p>) : <small>No commands have been run in this session.</small>}</div>
      </Section>

      <Section icon={<Database />} title="Memory">
        <Row label="Account history" detail={`${data.currentAccount?.events.length || 0} saved event${data.currentAccount?.events.length === 1 ? "" : "s"} in current context.`} status="Working" />
        <Row label="Weekly review memory" detail={`${data.currentAccount?.weeklyReviews.length || 0} saved PSM review${data.currentAccount?.weeklyReviews.length === 1 ? "" : "s"}.`} status="Working" />
        <Row label="Decision history" detail="Proposals, edits, approvals, cancellations, executions, and failures use immutable audit events." status="Working" />
        <Row label="Cross-session command history" detail="Authenticated command history and appearance preferences are stored centrally when storage is configured." status={data.storage.writable ? "Working" : "Disabled"} />
      </Section>

      <Section icon={<Mic />} title="Voice">
        <Toggle label="Push-to-talk" detail="Never listens in the background" checked={voiceEnabled} onChange={setVoiceEnabled} />
        <Row label="Microphone permission" detail={`Current state: ${voiceAvailability.replace(/-/g, " ")}. Permission is requested only from the Enable Microphone action.`} status={["granted", "listening", "processing", "stopped"].includes(voiceAvailability) ? "Working" : "Disabled"} />
        <Row label="Always-on listening" detail="Intentionally excluded from this phase." status="Disabled" />
        <Row label="Desktop wake word" status="Planned" />
      </Section>

      <Section icon={<ImageIcon />} title="Image and Video">
        <Row label="Image generation" detail="No provider or camera access is configured." status="Planned" />
        <Row label="Video generation" detail="No provider or screen access is configured." status="Planned" />
        <Row label="Camera and screen access" detail="Explicitly prohibited in this phase." status="Disabled" />
      </Section>

      <Section icon={<Gauge />} title="Power Tools">
        <Row label="Import reports" detail="Uses Garden's existing Import Center and server route." status="Working" />
        <div className="angora-jarvis-setting-action"><span><b>Rebuild account briefing</b><small>Reload saved PSM context and regenerate evidence.</small></span><button type="button" onClick={() => void refreshPsm()}><RefreshCw />Refresh</button></div>
        <Row label="Audit missing reports" detail={`${briefing.missionQueue.missingReports.length} current mission item${briefing.missionQueue.missingReports.length === 1 ? "" : "s"}.`} status="Working" />
        <Row label="External API execution" detail="No external actions are available." status="Disabled" />
      </Section>

      <Section icon={<Bot />} title="API Usage">
        <Row label="Deterministic command usage" detail={`${history.length} command${history.length === 1 ? "" : "s"} this session.`} status="Working" />
        <Row label="Model token usage" detail="No server usage endpoint is configured." status="Planned" />
        <Row label="Raw API keys" detail="Never exposed in this browser UI." status="Admin only" />
      </Section>

      <Section icon={<ShieldCheck />} title="Admin / Security">
        <Row label="Environment" detail={data.storage.label} status={data.storage.writable ? "Working" : "Disabled"} />
        <Row label="Sensitive actions" detail="Explicit approval is enforced before Garden writes." status="Working" />
        <Row label="Connector administration" detail="Requires future server-side configuration." status="Admin only" />
        {demoDataWarning && <div className="angora-jarvis-security-warning"><KeyRound /><p><b>Demo data warning</b>{demoDataWarning}</p></div>}
        {psmError && <div className="angora-jarvis-security-warning"><KeyRound /><p><b>PSM context limitation</b>{psmError}</p></div>}
      </Section>
    </div>
    <footer><Check />Guarded execution · evidence, approval, and audit history required</footer>
  </aside>;
}
