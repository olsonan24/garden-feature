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
import type { AuditRecommendation } from "../lib/audit/shared/audit-recommendation";
import type { VoicePermissionState } from "../lib/voice-permission";

type JarvisHistoryItem = { id: string; command: string; response: string; intent: string; timestamp: string };
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
  voiceAvailability: VoicePermissionState;
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
  setVoiceAvailability: (availability: VoicePermissionState) => void;
  setVoiceEnabled: (enabled: boolean) => void;
  setDraftText: (text: string) => void;
  setAssistantName: (name: string) => void;
  updateAppearance: (updates: Partial<JarvisAppearance>) => void;
  runCommand: (command?: string) => Promise<JarvisCommandResult | null>;
  chooseSuggestedAction: (action: JarvisSuggestedAction) => Promise<void>;
  updatePendingApproval: (fields: Record<string, string | boolean>) => Promise<void>;
  approvePendingAction: () => Promise<void>;
  cancelPendingAction: () => Promise<void>;
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
  const [voiceAvailability, setVoiceAvailability] = useState<VoicePermissionState>("not-requested");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [psm, setPsm] = useState<PsmState>(() => emptyPsmState(storage));
  const [psmError, setPsmError] = useState("");
  const [history, setHistory] = useState<JarvisHistoryItem[]>([]);
  const [draftText, setDraftText] = useState("");
  const [assistantName, setAssistantNameState] = useState("JARVIS");
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

  useEffect(() => {
    let active = true;
    fetch("/api/user-settings", { cache: "no-store" }).then(async (response) => ({ response, body: await response.json().catch(() => ({})) })).then(({ response, body }) => {
      if (!active || !response.ok) return;
      const preferences = body.preferences as { assistantName?: string; appearance?: JarvisAppearance } | null;
      if (preferences?.assistantName) setAssistantNameState(preferences.assistantName);
      if (preferences?.appearance) setAppearance((current) => ({ ...current, ...preferences.appearance }));
      if (Array.isArray(body.history)) setHistory(body.history.slice(0, 20));
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const data = useMemo(() => adaptJarvisData({ accounts, skus, periods, imports, actions, reviews, psm, storage, currentAccountId, currentPeriodId }), [accounts, skus, periods, imports, actions, reviews, psm, storage, currentAccountId, currentPeriodId]);
  const briefing = useMemo(() => data.currentAccount ? buildAccountBriefing(data, data.currentAccount.id) : buildPortfolioBriefing(data), [data]);
  const demoDataWarning = data.demoData ? "Demo data is active. Findings are sample-only, read-only, and not proof of production account state." : "";

  const recommendationFromAction = useCallback((action: JarvisSuggestedAction): AuditRecommendation => {
    if (action.originalRecommendation) return {
      ...action.originalRecommendation,
      proposedAction: String(action.proposedFields?.proposedAction || action.originalRecommendation.proposedAction),
    };
    const entity = action.type === "escalate_blocker" ? "blocker" : "task";
    const recommendationId = action.recommendationId || `command-recommendation:${action.id}`;
    return {
      id: recommendationId,
      findingId: `command-finding:${action.id}`,
      accountId: action.accountId || "",
      actionType: action.type,
      proposedAction: action.label,
      proposedPayload: { entity, record: { accountId: action.accountId, ...action.proposedFields }, evidence: action.evidence },
      approvalRequired: true,
      requiredRole: action.requiredRole || "psm",
      executionCapability: action.executionCapability || "garden_psm_write",
      riskLevel: action.type === "escalate_blocker" ? "medium" : "low",
      status: "proposed",
    };
  }, []);

  const persistProposal = useCallback(async (action: JarvisSuggestedAction) => {
    if (!storage.writable || !psm.storage.writable || !action.accountId) return action;
    const recommendation = recommendationFromAction(action);
    const response = await fetch("/api/recommendations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operation: "propose", recommendation }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "The proposal could not be recorded in audit history.");
    return { ...action, recommendationId: body.recommendation?.id || recommendation.id };
  }, [psm.storage.writable, recommendationFromAction, storage.writable]);

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
    let approval = result.requiresApproval ? result.suggestedActions.find((action) => action.requiresApproval) || null : null;
    if (approval && storage.writable && psm.storage.writable) {
      try { approval = await persistProposal(approval); }
      catch (reason) { setPsmError(reason instanceof Error ? reason.message : "The proposal audit record could not be saved."); }
    }
    setPendingApproval(approval);
    setDraftText(result.draft || "");
    setCommandText("");
    setHistory((current) => [{ id: `history-${Date.now()}`, command: nextCommand, response: result.response, intent: result.intent, timestamp: new Date().toISOString() }, ...current].slice(0, 20));
    if (storage.writable) void fetch("/api/user-settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operation: "history", accountId: data.currentAccount?.id, command: nextCommand, response: result.response, intent: result.intent }) }).catch(() => undefined);
    if (result.intent === "OPEN_SETTINGS") setSettingsOpen(true);
    if (result.navigation) {
      setMode("navigating");
      onNavigate(result.navigation);
    }
    setMode(result.error ? "needsAttention" : result.draft ? "draftReady" : result.evidence.length ? "briefing" : "idle");
    return result;
  }, [commandText, data, onNavigate, persistProposal, psm.storage.writable, storage.writable]);

  const chooseSuggestedAction = useCallback(async (action: JarvisSuggestedAction) => {
    if (action.requiresApproval) {
      try { setPendingApproval(await persistProposal(action)); }
      catch (reason) { setPendingApproval(action); setPsmError(reason instanceof Error ? reason.message : "The proposal audit record could not be saved."); }
      setOpen(true);
      setMode("needsAttention");
      return;
    }
    if (action.accountId && action.accountId !== currentAccountId) onNavigate({ accountId: action.accountId });
    if (action.type === "open_import_center") onNavigate({ view: "imports", accountId: action.accountId });
    else if (action.type === "start_weekly_review") onNavigate({ view: "review", accountId: action.accountId });
    else if (action.type === "open_account") onNavigate({ view: "accounts", accountId: action.accountId });
    else if (action.type === "draft_partner_update") setOpen(true);
  }, [currentAccountId, onNavigate, persistProposal]);

  const updatePendingApproval = useCallback(async (fields: Record<string, string | boolean>) => {
    if (!pendingApproval) return;
    const updated = { ...pendingApproval, proposedFields: fields };
    setPendingApproval(updated);
    if (!updated.recommendationId) return;
    const recommendation = recommendationFromAction(updated);
    const response = await fetch("/api/recommendations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operation: "edit", recommendationId: updated.recommendationId, proposedPayload: recommendation.proposedPayload, proposedAction: recommendation.proposedAction }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "The edited proposal could not be recorded.");
  }, [pendingApproval, recommendationFromAction]);

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
    setMode("thinking");
    try {
      const recorded = pendingApproval.recommendationId ? pendingApproval : await persistProposal(pendingApproval);
      if (!recorded.recommendationId) throw new Error("The proposal could not be recorded before approval.");
      const response = await fetch("/api/recommendations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operation: "approve", recommendationId: recorded.recommendationId }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.error || "The approved action could not be saved.");
      await refreshPsm();
      setLastResponse(body.approvedOnly ? `${pendingApproval.label} was approved and recorded. This recommendation has no enabled execution capability, so no operational or external action ran.` : `${pendingApproval.label} was approved, saved to Garden, and confirmed by reading the record back. No external message or API action was sent.`);
      setSuggestedActions((current) => current.filter((action) => action.id !== pendingApproval.id));
      setPendingApproval(null);
      setMode("briefing");
    } catch (reason) {
      setMode("error");
      setLastResponse(reason instanceof Error ? reason.message : "The approved action could not be saved.");
    }
  }, [pendingApproval, persistProposal, psm.storage.writable, refreshPsm, storage.writable]);

  const savePreferences = useCallback((nextName: string, nextAppearance: JarvisAppearance) => {
    if (!storage.writable) return;
    void fetch("/api/user-settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operation: "preferences", preferences: { assistantName: nextName, appearance: nextAppearance } }) }).catch(() => undefined);
  }, [storage.writable]);
  const updateAppearance = useCallback((updates: Partial<JarvisAppearance>) => setAppearance((current) => { const next = { ...current, ...updates }; savePreferences(assistantName, next); return next; }), [assistantName, savePreferences]);
  const setAssistantName = useCallback((name: string) => { const next = name || "JARVIS"; setAssistantNameState(next); savePreferences(next, appearance); }, [appearance, savePreferences]);
  const cancelPendingAction = useCallback(async () => {
    const current = pendingApproval;
    setPendingApproval(null);
    setLastResponse("Proposal canceled. No Garden operational data was changed.");
    setMode("idle");
    if (!current?.recommendationId) return;
    try {
      const response = await fetch("/api/recommendations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operation: "cancel", recommendationId: current.recommendationId }) });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || "Cancellation audit event could not be saved."); }
    } catch (reason) { setPsmError(reason instanceof Error ? reason.message : "Cancellation audit event could not be saved."); }
  }, [pendingApproval]);
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
