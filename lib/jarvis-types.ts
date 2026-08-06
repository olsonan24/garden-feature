import type { DashboardSku, PeriodPayload, Status } from "./analyze-reports";
import type {
  AccountEvent,
  AccountWorkflow,
  PartnerRequest,
  PsmBlocker,
  PsmState,
  PsmTask,
  StorageStatus,
  WeeklyReview,
} from "./psm-types";

export type GardenView = "overview" | "my-day" | "operations" | "accounts" | "imports" | "review" | "jarvis";

export type JarvisAssistantMode =
  | "idle"
  | "listening"
  | "thinking"
  | "analyzing"
  | "navigating"
  | "briefing"
  | "draftReady"
  | "needsAttention"
  | "error";

export type JarvisCommandIntent =
  | "NAVIGATE_ACCOUNT"
  | "ANALYZE_ACCOUNT"
  | "SHOW_MISSION_QUEUE"
  | "SHOW_BLOCKERS"
  | "SHOW_PARTNER_REQUESTS"
  | "SHOW_OVERDUE_TASKS"
  | "SHOW_MISSING_REPORTS"
  | "DRAFT_WEEKLY_UPDATE"
  | "START_WEEKLY_REVIEW"
  | "CREATE_TASK_PROPOSAL"
  | "ESCALATE_BLOCKER_PROPOSAL"
  | "OPEN_SETTINGS"
  | "SHOW_HELP"
  | "UNKNOWN_COMMAND";

export type JarvisEvidenceType =
  | "task"
  | "action"
  | "blocker"
  | "partner_request"
  | "review"
  | "report"
  | "account"
  | "history"
  | "data_quality"
  | "data_freshness"
  | "sku"
  | "import";

export type JarvisEvidenceItem = {
  type: JarvisEvidenceType;
  label: string;
  detail: string;
  accountId?: string;
  sourceId?: string;
  severity?: "info" | "warning" | "critical";
  timestamp?: string;
};

export type JarvisSuggestedActionType =
  | "create_task"
  | "escalate_blocker"
  | "start_weekly_review"
  | "draft_partner_update"
  | "open_import_center"
  | "open_account";

export type JarvisSuggestedAction = {
  id: string;
  type: JarvisSuggestedActionType;
  label: string;
  accountId?: string;
  accountName?: string;
  reason: string;
  evidence: JarvisEvidenceItem[];
  proposedFields?: Record<string, string | boolean>;
  requiresApproval: boolean;
};

export type JarvisCommandResult = {
  intent: JarvisCommandIntent;
  confidence: number;
  response: string;
  targetAccountId?: string;
  targetAccountName?: string;
  navigation?: {
    view?: GardenView;
    route?: string;
    accountId?: string;
  };
  evidence: JarvisEvidenceItem[];
  suggestedActions: JarvisSuggestedAction[];
  requiresApproval: boolean;
  draft?: string;
  error?: string;
};

export type JarvisCoreAccount = { id: string; name: string; status: Status | string };
export type JarvisCoreImport = { id: string; accountId: string; reportType: string; filename: string; period: string; receivedAt: string; status: string };
export type JarvisCoreAction = { id: string; accountId: string; skuId?: string | null; title: string; detail: string; status: string; createdAt: string; completedAt?: string | null; completedPeriodId?: string | null };
export type JarvisCoreReview = { id: string; accountId: string; periodId: string; note: string; updatedAt: string };

export type JarvisDataAdapterInput = {
  accounts: JarvisCoreAccount[];
  skus: DashboardSku[];
  periods: PeriodPayload[];
  imports: JarvisCoreImport[];
  actions: JarvisCoreAction[];
  reviews: JarvisCoreReview[];
  psm: PsmState;
  storage: StorageStatus;
  currentAccountId?: string;
  currentPeriodId?: string;
};

export type JarvisAccountData = JarvisCoreAccount & {
  skus: DashboardSku[];
  periods: PeriodPayload[];
  selectedPeriod?: PeriodPayload;
  imports: JarvisCoreImport[];
  actions: JarvisCoreAction[];
  workflow?: AccountWorkflow;
  tasks: PsmTask[];
  blockers: PsmBlocker[];
  partnerRequests: PartnerRequest[];
  weeklyReviews: WeeklyReview[];
  events: AccountEvent[];
  missingReports: string[];
  freshnessTimestamp?: string;
};

export type JarvisDataContext = {
  accounts: JarvisAccountData[];
  currentAccount?: JarvisAccountData;
  currentPeriod?: PeriodPayload;
  storage: StorageStatus;
  psm: PsmState;
  demoData: boolean;
  generatedAt: string;
};

export type JarvisMissionSectionKey =
  | "dueToday"
  | "overdue"
  | "blocked"
  | "waitingOnPartner"
  | "missingReports"
  | "needsReview"
  | "criticalAccounts";

export type JarvisMissionItem = {
  id: string;
  section: JarvisMissionSectionKey;
  label: string;
  detail: string;
  accountId: string;
  accountName: string;
  severity: "info" | "warning" | "critical";
  evidence: JarvisEvidenceItem[];
};

export type JarvisMissionQueue = Record<JarvisMissionSectionKey, JarvisMissionItem[]>;

export type JarvisBriefing = {
  scope: "portfolio" | "account";
  title: string;
  summary: string;
  status: "operational" | "attention" | "critical" | "empty";
  evidence: JarvisEvidenceItem[];
  suggestedActions: JarvisSuggestedAction[];
  missionQueue: JarvisMissionQueue;
  dataWarnings: string[];
};

export type JarvisAccountMatch =
  | { status: "matched"; account: JarvisAccountData; score: number }
  | { status: "multiple"; accounts: JarvisAccountData[]; score: number }
  | { status: "not_found"; score: number };

