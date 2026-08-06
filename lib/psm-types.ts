export const TASK_STATUSES = [
  "Not started",
  "In progress",
  "Waiting on partner",
  "Waiting internally",
  "Blocked",
  "Completed",
  "Canceled",
] as const;

export const RESPONSIBLE_PARTIES = ["Angora", "Partner", "Both"] as const;
export const PRIORITIES = ["Low", "Normal", "High", "Critical"] as const;
export const PARTNER_REQUEST_STATUSES = ["Open", "Waiting", "Received", "Canceled"] as const;
export const BLOCKER_STATUSES = ["Open", "Monitoring", "Resolved", "Canceled"] as const;
export const ACCOUNT_STAGES = [
  "New partner",
  "Onboarding",
  "Waiting on access",
  "Setup",
  "Active management",
  "Optimization",
  "At risk",
  "Paused",
  "Closed",
] as const;
export const HEALTH_STATUSES = ["Healthy", "Monitor", "At risk", "Critical", "Paused"] as const;
export const PARTNER_REQUEST_TYPES = [
  "COGS",
  "Inventory information",
  "Login access",
  "Ad approval",
  "Product photos",
  "Pricing decision",
  "Missing document",
  "Report upload",
  "SKU clarification",
  "Other",
] as const;
export const BLOCKER_CATEGORIES = [
  "Waiting on partner",
  "Missing data",
  "Access issue",
  "Inventory issue",
  "COGS missing",
  "Ad approval needed",
  "Internal review needed",
  "Technical issue",
  "Report not uploaded",
  "Other",
] as const;
export const DATA_SOURCES = ["Manual entry", "Uploaded report", "Imported file", "Future API placeholder"] as const;

export type TaskStatus = typeof TASK_STATUSES[number];
export type ResponsibleParty = typeof RESPONSIBLE_PARTIES[number];
export type Priority = typeof PRIORITIES[number];
export type PartnerRequestStatus = typeof PARTNER_REQUEST_STATUSES[number];
export type BlockerStatus = typeof BLOCKER_STATUSES[number];
export type HealthStatus = typeof HEALTH_STATUSES[number];
export type DataSource = typeof DATA_SOURCES[number];
export type StorageMode = "d1" | "postgres" | "demo" | "unavailable";

export type CompletionHistoryEntry = {
  completedAt: string;
  note?: string;
};

export type PsmTask = {
  id: string;
  accountId: string;
  title: string;
  owner: string;
  responsibleParty: ResponsibleParty;
  dueDate: string;
  priority: Priority;
  status: TaskStatus;
  blockedReason: string;
  notes: string;
  completionHistory: CompletionHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  source: DataSource;
};

export type PartnerRequest = {
  id: string;
  accountId: string;
  title: string;
  requestType: string;
  description: string;
  responsibleParty: ResponsibleParty;
  dateRequested: string;
  dueDate: string;
  status: PartnerRequestStatus;
  lastFollowUpDate: string;
  blocksAccount: boolean;
  relatedTaskId: string;
  relatedBlockerId: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  source: DataSource;
};

export type PsmBlocker = {
  id: string;
  accountId: string;
  title: string;
  category: string;
  responsibleParty: ResponsibleParty;
  status: BlockerStatus;
  dateOpened: string;
  dateResolved: string;
  relatedTaskId: string;
  relatedPartnerRequestId: string;
  resolutionNotes: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  source: DataSource;
};

export type AccountWorkflow = {
  accountId: string;
  stage: string;
  healthStatus: HealthStatus;
  healthReason: string;
  nextAction: string;
  psmOwner: string;
  lastWeeklyReview: string;
  updatedAt: string;
  source: DataSource;
};

export type WeeklyReview = {
  id: string;
  accountId: string;
  periodId: string;
  weekStart: string;
  weekEnd: string;
  revenueStatus: string;
  adsStatus: string;
  inventoryIssues: string;
  skuIssues: string;
  reportsStatus: "Received" | "Missing" | "Partial" | "Not reviewed";
  completedWork: string;
  openBlockers: string;
  partnerRequests: string;
  nextActions: string;
  healthStatus: HealthStatus;
  internalNotes: string;
  partnerUpdateNotes: string;
  partnerUpdateDraft: string;
  status: "Draft" | "Completed";
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  source: DataSource;
};

export type AccountEvent = {
  id: string;
  accountId: string;
  eventType: string;
  title: string;
  detail: string;
  occurredAt: string;
  source: DataSource;
  relatedId?: string;
};

export type StorageStatus = {
  mode: StorageMode;
  writable: boolean;
  label: string;
  detail: string;
};

export type PsmState = {
  workflows: AccountWorkflow[];
  tasks: PsmTask[];
  partnerRequests: PartnerRequest[];
  blockers: PsmBlocker[];
  weeklyReviews: WeeklyReview[];
  events: AccountEvent[];
  storage: StorageStatus;
};

export const emptyPsmState = (storage: StorageStatus): PsmState => ({
  workflows: [],
  tasks: [],
  partnerRequests: [],
  blockers: [],
  weeklyReviews: [],
  events: [],
  storage,
});
