"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { adaptJarvisData } from "../lib/jarvis-data-adapter";
import { buildAccountBriefing, buildPortfolioBriefing } from "../lib/jarvis-briefing-service";
import { executeJarvisCommand } from "../lib/jarvis-command-engine";
import type {
  GardenView,
  JarvisAssistantMode,
  JarvisBriefing,
  JarvisCommandResult,
  JarvisCoreAccount,
  JarvisCoreAction,
  JarvisCoreImport,
  JarvisCoreReview,
  JarvisDataContext,
  JarvisEvidenceItem,
  JarvisSuggestedAction,
} from "../lib/jarvis-types";
import type { DashboardSku, PeriodPayload } from "../lib/analyze-reports";
import { emptyPsmState, type PsmState, type StorageStatus } from "../lib/psm-types";

type JarvisHistoryItem = { id: string; command: string; response: string; intent: string; timestamp: string };
type VoiceAvailability = "checking" | "available" | "unavailable";
type JarvisAppearance = { grid: boolean; glow: boolean; compact: boolean; animation: "reduced" | "standard"; hudIntensity: "low" | "standard" | "high" };

export type JarvisAssistantContextValue = {
  open: boolean;
  mode: JarvisAssistantMode;
  commandText: string;
  lastCommand: string;
  lastResponse: string;
  lastResult: JarvisCommandResult | null;
  currentView: GardenView;
  currentAccountId?: string;
  currentAccountName?: string;
  currentPeriodId?: string;
  evidence: JarvisEvidenceItem[];
  suggestedActions: JarvisSuggestedAction[];
  pendingApproval: JarvisSuggestedAction | null;
  settingsOpen: boolean;
  commandCenterActive: boolean;
  voiceAvailability: VoiceAvailability;
  voiceEnabled: boolean;
  demoDataWarning: string;
  psmError: string;
  data: JarvisDataContext;
  briefing: JarvisBriefing;
  history: JarvisHistoryItem[];
  draftText: string;
  appearance: JarvisAppearance;
  assistantName: string;
  setOpen: (open: boolean) => void;
  setMode: (mode: JarvisAssistantMode) => void;
  setCommandText: (text: string) => void;
  setSettingsOpen: (open: boolean) => void;
  setVoiceAvailability: (availability: VoiceAvailability) => void;
  setVoiceEnabled: (enabled: boolean) => void;
  setDraftText: (text: string) => void;
  setAssistantName: (name: string) => void;
  updateAppearance: (updates: Partial<JarvisAppearance>) => void;
  runCommand: (command?: string) => Promise<JarvisCommandResult | null>;
  chooseSuggestedAction: (action: JarvisSuggestedAction) => void;
  updatePendingApproval: (fields: Record<string, string | boolean>) => void;
  approvePendingAction: () => Promise<void>;
  cancelPendingAction: () => void;
  reportError: (message: string) => void;
  refreshPsm: () => Promise<void>;
};

const JarvisAssistantContext = createContext<JarvisAssistantContextValue | null>(null);

type ProviderProps = {
  children: ReactNode;
  accounts: JarvisCoreAccount[];
  skus: DashboardSku[];
  periods: PeriodPayload[];
  imports: JarvisCoreImport[];
  actions: JarvisCoreAction[];
  reviews: JarvisCoreReview[];
  storage: StorageStatus;
  currentView: GardenView;
  currentAccountId?: string;
  currentPeriodId?: string;
  onNavigate: (navigation: { view?: GardenView; accountId?: string }) => void;
};

export function JarvisAssistantProvider({ children, accounts, skus, periods, imports, actions, reviews, storage, currentView, currentAccountId, currentPeriodId, onNavigate }: ProviderProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<JarvisAssistantMode>("idle");
  const [commandText, setCommandText] = useState("");
  const [lastCommand, setLastCommand] = useState("");
  const [lastResponse, setLastResponse] = useState("Systems operational. Commands are grounded in loaded Garden data.");
  const [lastResult, setLastResult] = useState<JarvisCommandResult | null>(null);
  const [evidence, setEvidence] = useState<JarvisEvidenceItem[]>([]);
  const [suggestedActions, setSuggestedActions] = useState<JarvisSuggestedAction[]>([]);
  const [pendingApproval, setPendingApproval] = useState<JarvisSuggestedAction | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [voiceAvailability, setVoiceAvailability] = useState<VoiceAvailability>("checking");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [psm, setPsm] = useState<PsmState>(() => emptyPsmState(storage));
  const [psmError, setPsmError] = useState("");
  const [history, setHistory] = useState<JarvisHistoryItem[]>([]);
  const [draftText, setDraftText] = useState("");
  const [assistantName, setAssistantName] = useState("JARVIS");
  const [appearance, setAppearance] = useState<JarvisAppearance>({ grid: true, glow: true, compact: false, animation: "standard", hudIntensity: "standard" });

  const refreshPsm = useCallback(async () => {
    try {
      const response = await fetch("/api/psm", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!body.storage) throw new Error(body.error || "PSM context could not be loaded.");
      setPsm(body as PsmState);
      setPsmError(response.ok ? "" : body.error || "PSM context is unavailable.");
    } catch (reason) {
      setPsm(emptyPsmState(storage));
      setPsmError(reason instanceof Error ? reason.message : "PSM context could not be loaded.");
    }
  }, [storage]);

  useEffect(() => {
    let active = true;
    fetch("/api/psm", { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json().catch(() => ({})) }))
      .then(({ response, body }) => {
        if (!active) return;
        if (!body.storage) throw new Error(body.error || "PSM context could not be loaded.");
        setPsm(body as PsmState);
        setPsmError(response.ok ? "" : body.error || "PSM context is unavailable.");
      })
      .catch((reason) => {
        if (!active) return;
        setPsm(emptyPsmState(storage));
        setPsmError(reason instanceof Error ? reason.message : "PSM context could not be loaded.");
      });
    return () => { active = false; };
  }, [storage]);

  const data = useMemo(() => adaptJarvisData({ accounts, skus, periods, imports, actions, reviews, psm, storage, currentAccountId, currentPeriodId }), [accounts, skus, periods, imports, actions, reviews, psm, storage, currentAccountId, currentPeriodId]);
  const briefing = useMemo(() => data.currentAccount ? buildAccountBriefing(data, data.currentAccount.id) : buildPortfolioBriefing(data), [data]);
  const demoDataWarning = data.demoData ? "Demo data is active. Findings are sample-only, read-only, and not proof of production account state." : "";

  const runCommand = useCallback(async (command = commandText) => {
    const nextCommand = command.trim();
    if (!nextCommand) return null;
    setOpen(true);
    setLastCommand(nextCommand);
    setMode(/analy|attention|blocker|overdue|report|mission|draft/i.test(nextCommand) ? "analyzing" : "thinking");
    await Promise.resolve();
    const result = executeJarvisCommand(nextCommand, data);
    setLastResult(result);
    setLastResponse(result.response);
    setEvidence(result.evidence);
    setSuggestedActions(result.suggestedActions);
    setPendingApproval(result.requiresApproval ? result.suggestedActions.find((action) => action.requiresApproval) || null : null);
    setDraftText(result.draft || "");
    setCommandText("");
    setHistory((current) => [{ id: `history-${Date.now()}`, command: nextCommand, response: result.response, intent: result.intent, timestamp: new Date().toISOString() }, ...current].slice(0, 20));
    if (result.intent === "OPEN_SETTINGS") setSettingsOpen(true);
    if (result.navigation) {
      setMode("navigating");
      onNavigate(result.navigation);
    }
    setMode(result.error ? "needsAttention" : result.draft ? "draftReady" : result.evidence.length ? "briefing" : "idle");
    return result;
  }, [commandText, data, onNavigate]);

  const chooseSuggestedAction = useCallback((action: JarvisSuggestedAction) => {
    if (action.requiresApproval) {
      setPendingApproval(action);
      setOpen(true);
      setMode("needsAttention");
      return;
    }
    if (action.accountId && action.accountId !== currentAccountId) onNavigate({ accountId: action.accountId });
    if (action.type === "open_import_center") onNavigate({ view: "imports", accountId: action.accountId });
    else if (action.type === "start_weekly_review") onNavigate({ view: "review", accountId: action.accountId });
    else if (action.type === "open_account") onNavigate({ view: "accounts", accountId: action.accountId });
    else if (action.type === "draft_partner_update") setOpen(true);
  }, [currentAccountId, onNavigate]);

  const updatePendingApproval = useCallback((fields: Record<string, string | boolean>) => {
    setPendingApproval((current) => current ? { ...current, proposedFields: fields } : current);
  }, []);

  const approvePendingAction = useCallback(async () => {
    if (!pendingApproval) return;
    if (!pendingApproval.accountId) {
      setMode("error");
      setLastResponse("This proposal has no account context, so nothing was saved.");
      return;
    }
    if (!storage.writable || !psm.storage.writable) {
      setMode("error");
      setLastResponse("Central storage is read-only or unavailable. The proposal remains unsaved.");
      return;
    }
    const entity = pendingApproval.type === "escalate_blocker" ? "blocker" : "task";
    const record = { accountId: pendingApproval.accountId, ...pendingApproval.proposedFields };
    setMode("thinking");
    try {
      const response = await fetch("/api/psm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entity, record }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.error || "The approved action could not be saved.");
      await refreshPsm();
      setLastResponse(`${pendingApproval.label} was approved and saved to Garden. No external message or API action was sent.`);
      setSuggestedActions((current) => current.filter((action) => action.id !== pendingApproval.id));
      setPendingApproval(null);
      setMode("briefing");
    } catch (reason) {
      setMode("error");
      setLastResponse(reason instanceof Error ? reason.message : "The approved action could not be saved.");
    }
  }, [pendingApproval, psm.storage.writable, refreshPsm, storage.writable]);

  const updateAppearance = useCallback((updates: Partial<JarvisAppearance>) => setAppearance((current) => ({ ...current, ...updates })), []);
  const cancelPendingAction = useCallback(() => { setPendingApproval(null); setLastResponse("Proposal canceled. No Garden data was changed."); setMode("idle"); }, []);
  const reportError = useCallback((message: string) => { setLastResponse(message); setMode("error"); setOpen(true); }, []);

  const value: JarvisAssistantContextValue = {
    open, mode, commandText, lastCommand, lastResponse, lastResult, currentView, currentAccountId: data.currentAccount?.id,
    currentAccountName: data.currentAccount?.name, currentPeriodId: data.currentPeriod?.id, evidence, suggestedActions,
    pendingApproval, settingsOpen, commandCenterActive: currentView === "jarvis", voiceAvailability, voiceEnabled,
    demoDataWarning, psmError, data, briefing, history, draftText, appearance, assistantName,
    setOpen, setMode, setCommandText, setSettingsOpen, setVoiceAvailability, setVoiceEnabled, setDraftText,
    setAssistantName, updateAppearance, runCommand, chooseSuggestedAction, updatePendingApproval, approvePendingAction,
    cancelPendingAction, refreshPsm,
    reportError,
  };

  return <JarvisAssistantContext.Provider value={value}>{children}</JarvisAssistantContext.Provider>;
}

export function useJarvisAssistant() {
  const context = useContext(JarvisAssistantContext);
  if (!context) throw new Error("useJarvisAssistant must be used inside JarvisAssistantProvider.");
  return context;
}
