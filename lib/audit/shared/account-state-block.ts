export type AccountFactSource = {
  field: string;
  sourceType: "account" | "sku" | "report" | "workflow" | "task" | "blocker" | "partner_request" | "audit" | "manual";
  sourceId: string;
  observedAt: string;
};

export type AccountStateBlock = {
  id: string;
  accountId: string;
  accountName: string;
  version: number;
  assignedPsm?: string;
  lifecyclePhase?: string;
  primarySkus: Array<{ id: string; sku: string; asin?: string; parentAsin?: string; productFamily?: string }>;
  assumptions: { cogs?: Record<string, number>; margin?: number; acosGoal?: number; tacosGoal?: number; revenueTarget?: number; profitTarget?: number };
  inventoryStatus: Array<{ skuId: string; onHand?: number; stockoutRisk?: boolean; overstockRisk?: boolean }>;
  pricingChanges: string[];
  promotionChanges: string[];
  listingChanges: string[];
  reviewIssues: string[];
  campaignChanges: string[];
  brandTerms: string[];
  harvestedKeywords: string[];
  negatives: string[];
  openBlockerIds: string[];
  openTaskIds: string[];
  partnerRequestIds: string[];
  previousAuditSummary?: string;
  previousApprovedActionIds: string[];
  unresolvedRecommendationIds: string[];
  doNotRepeatRecommendationIds: string[];
  sources: AccountFactSource[];
  createdAt: string;
  createdBy: string;
};

export type AccountStateBlockManualUpdate = Partial<Pick<AccountStateBlock,
  | "assignedPsm"
  | "lifecyclePhase"
  | "pricingChanges"
  | "promotionChanges"
  | "listingChanges"
  | "reviewIssues"
  | "campaignChanges"
  | "brandTerms"
  | "harvestedKeywords"
  | "negatives"
  | "doNotRepeatRecommendationIds"
>> & {
  assumptions?: Partial<AccountStateBlock["assumptions"]>;
};
