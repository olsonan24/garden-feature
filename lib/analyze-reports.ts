import type { Candidate, ProductPartial, ReportSummary, ReportType } from "./report-parser";

export type Status = "critical" | "attention" | "monitor" | "healthy";

export type ReviewHistoryPoint = {
  checkedAt: string;
  rating: number;
  reviewCount: number;
};

export type KnownSku = {
  id: string;
  accountId: string;
  name: string;
  sku: string;
  asin: string;
  listingUrl?: string;
  reviewRating?: number;
  reviewCount?: number;
  reviewBreakdown?: Record<string, number>;
  reviewSource?: "amazon" | "manual";
  reviewUpdatedAt?: string;
  reviewHistory?: ReviewHistoryPoint[];
  manualSalePrice?: number;
  manualReferralRate?: number;
  manualFbaFeePerUnit?: number;
  manualStorageCostPerUnit?: number;
  manualInboundCostPerUnit?: number;
  manualCogsPerUnit?: number;
  manualAngoraRate?: number;
  manualAdSales?: number;
  manualAdSpend?: number;
};

export type DashboardSku = KnownSku & {
  sales: number;
  netSales: number;
  sessions: number;
  units: number;
  b2bUnits?: number;
  refunds: number;
  conversion: number;
  adSpend: number;
  adSales: number;
  adOrders: number;
  clicks: number;
  profit: number;
  storage: number;
  cogs: number;
  inventory: number;
  fulfillable: number;
  reserved: number;
  transfer: number;
  unsellable: number;
  inbound: number;
  status: Status;
  issue: string;
  recommendation: string;
};

export type DashboardMetrics = {
  grossSales: number;
  netSales: number;
  netProceeds: number;
  storage: number;
  adSpend: number;
  adSales: number;
  clicks: number;
  adOrders: number;
  sessions: number;
  units: number;
  refunds: number;
  inventory: number;
  fulfillable: number;
  acos: number;
  tacos: number;
  conversion: number;
};

export type PeriodPayload = {
  id: string;
  accountId: string;
  startDate: string;
  endDate: string;
  label: string;
  kind: "weekly" | "monthly";
  status: Status;
  metrics: DashboardMetrics;
  wow: Partial<Record<keyof DashboardMetrics, number>>;
  daily: Array<{ date: string; spend: number; sales: number; orders: number; clicks: number }>;
  skus: DashboardSku[];
  insights: Array<{ title: string; detail: string; tone: Status }>;
  recommendations: Array<{ skuId?: string; title: string; detail: string; status: string }>;
  dataQuality: string[];
  reports: ReportType[];
  placements: Array<{ placement: string; spend: number; sales: number; orders: number; clicks: number; acos: number }>;
  funnel: ReportSummary["funnel"];
  generatedAt: string;
};

type ProductBucket = KnownSku & {
  finance?: ProductPartial;
  traffic?: ProductPartial;
  ads?: ProductPartial;
  inventory?: ProductPartial;
};

const clean = (value?: string) => (value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const round = (value: number, precision = 2) => Number(value.toFixed(precision));
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const percent = (value: number) => `${value.toFixed(1)}%`;

function statusFor(product: Omit<DashboardSku, "status" | "issue" | "recommendation">): Status {
  const acos = product.adSales ? product.adSpend / product.adSales * 100 : product.adSpend ? 999 : 0;
  if (product.profit < -25 || acos > 100 || (product.sessions >= 40 && product.conversion < 1)) return "critical";
  if (product.profit < 0 || acos > 60 || (product.sessions >= 25 && product.conversion < 2)) return "attention";
  if (!product.sales && product.inventory) return "monitor";
  return "healthy";
}

function mergeNumeric(target: ProductPartial | undefined, source: ProductPartial) {
  const next = target ? { ...target } : { source: source.source };
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "number") (next as Record<string, unknown>)[key] = Number((next as Record<string, unknown>)[key] || 0) + value;
    else if (value && !(next as Record<string, unknown>)[key]) (next as Record<string, unknown>)[key] = value;
  }
  return next as ProductPartial;
}

function family(source: ReportType): "finance" | "traffic" | "ads" | "inventory" | null {
  if (source === "SKU Economics") return "finance";
  if (source === "Business Report by Child ASIN") return "traffic";
  if (source === "Advertised Product") return "ads";
  if (source === "Manage FBA Inventory") return "inventory";
  return null;
}

function stableId(accountId: string, sku: string, asin: string) {
  const base = clean(sku || asin) || crypto.randomUUID();
  return `${accountId}-${base}`;
}

function productIssue(product: Omit<DashboardSku, "status" | "issue" | "recommendation">) {
  const acos = product.adSales ? product.adSpend / product.adSales * 100 : product.adSpend ? 999 : 0;
  const returnRate = product.units ? product.refunds / product.units * 100 : 0;
  if (product.storage > 0 && product.storage >= Math.abs(product.profit) * .45) return `${money(product.storage)} in storage charges materially reduced the period's proceeds.`;
  if (product.sessions >= 30 && product.conversion < 1.5) return `Traffic is present, but ${product.sessions} sessions converted ${product.units} unit${product.units === 1 ? "" : "s"} at ${percent(product.conversion)}.`;
  if (returnRate >= 20) return `${product.refunds} refund${product.refunds === 1 ? "" : "s"} produced a ${percent(returnRate)} return rate for the period.`;
  if (product.adSpend > 0 && !product.adOrders) return `${money(product.adSpend)} in advertising spend produced no attributed orders.`;
  if (acos > 60) return `Advertising generated ${money(product.adSales)} from ${money(product.adSpend)} in spend at ${percent(acos)} ACoS.`;
  if (!product.sales && product.inventory) return `${product.inventory} FBA units remain, but the product produced no sales in the selected period.`;
  return `The product generated ${money(product.sales)} from ${product.units} unit${product.units === 1 ? "" : "s"} with no single critical driver detected.`;
}

function matchingCandidate(product: Omit<DashboardSku, "status" | "issue" | "recommendation">, candidates: Candidate[]) {
  const sku = clean(product.sku), asin = clean(product.asin);
  return candidates.find((candidate) => {
    const campaign = clean(candidate.campaign);
    return (candidate.sku && clean(candidate.sku) === sku) || (candidate.asin && clean(candidate.asin) === asin) || (sku && campaign.includes(sku));
  });
}

function productRecommendation(product: Omit<DashboardSku, "status" | "issue" | "recommendation">, candidates: Candidate[]) {
  const acos = product.adSales ? product.adSpend / product.adSales * 100 : product.adSpend ? 999 : 0;
  const waste = matchingCandidate(product, candidates.filter((item) => item.clicks >= 10 && item.orders === 0).sort((a, b) => b.spend - a.spend));
  if (product.sales > 0 && product.cogs === 0) return "Enter confirmed COGS before treating the reported profit as complete.";
  if (product.profit < 0 && product.sales > 0 && product.cogs > product.sales) return "Correct the price or unit economics before sending additional paid traffic.";
  if (product.sessions >= 30 && product.conversion < 1.5) return "Reduce inefficient traffic and improve the offer, price, or listing before scaling sessions further.";
  if (waste) return `Reduce or pause “${waste.label}”; it spent ${money(waste.spend)} across ${waste.clicks} clicks without an order.`;
  if (product.adSpend > 0 && !product.adOrders) return "Lower bids materially or pause ads until the offer can convert paid traffic.";
  if (acos > 80) return `Reduce bids by roughly 25% to 35% and protect only the targets already producing orders.`;
  if (acos > 55) return `Lower inefficient bids by roughly 15% to 25% and move proven search terms into controlled exact targets.`;
  if (!product.sales && product.inventory) return "Confirm listing availability and pricing, then choose between a controlled launch test and an inventory-exit plan.";
  return "Maintain the current structure, monitor conversion, and scale only the targets that stay within the account's ACoS goal.";
}

function sum(items: DashboardSku[], field: keyof DashboardSku) {
  return items.reduce((total, item) => total + (typeof item[field] === "number" ? Number(item[field]) : 0), 0);
}

function reportSpend(summary: ReportSummary) {
  if (summary.type === "Advertised Product") return summary.products.reduce((total, item) => total + (item.adSpend || 0), 0);
  if (summary.type === "Targeting" || summary.type === "Search Term") return summary.candidates.reduce((total, item) => total + item.spend, 0);
  if (summary.type === "Placement") return summary.placements.reduce((total, item) => total + item.spend, 0);
  return 0;
}

export function buildPeriodAnalysis(args: {
  accountId: string;
  startDate: string;
  endDate: string;
  summaries: ReportSummary[];
  knownSkus?: KnownSku[];
  previous?: PeriodPayload | null;
}) {
  const { accountId, summaries, previous } = args;
  const buckets: ProductBucket[] = (args.knownSkus || []).map((sku) => ({ ...sku }));
  const skuIndex = new Map(buckets.filter((item) => item.sku).map((item) => [clean(item.sku), item]));
  const asinIndex = new Map(buckets.filter((item) => item.asin).map((item) => [clean(item.asin), item]));

  for (const summary of summaries) {
    for (const partial of summary.products) {
      const skuKey = clean(partial.sku), asinKey = clean(partial.asin);
      let bucket = (skuKey && skuIndex.get(skuKey)) || (asinKey && asinIndex.get(asinKey));
      if (!bucket) {
        bucket = {
          id: stableId(accountId, partial.sku || "", partial.asin || ""),
          accountId,
          name: partial.name || partial.sku || partial.asin || "Unmapped product",
          sku: partial.sku || "",
          asin: partial.asin || "",
        };
        buckets.push(bucket);
      }
      if (partial.sku && (!bucket.sku || bucket.sku.startsWith("amzn.gr"))) bucket.sku = partial.sku;
      if (partial.asin && !bucket.asin) bucket.asin = partial.asin;
      if (partial.name && (!bucket.name || bucket.name === bucket.sku || bucket.name === bucket.asin)) bucket.name = partial.name;
      if (skuKey) skuIndex.set(skuKey, bucket);
      if (asinKey) asinIndex.set(asinKey, bucket);
      const group = family(partial.source);
      if (group) bucket[group] = mergeNumeric(bucket[group], partial);
    }
  }

  const candidates = summaries.flatMap((summary) => summary.candidates);
  const skus: DashboardSku[] = buckets.map((bucket) => {
    const finance = bucket.finance || { source: "SKU Economics" as const };
    const traffic = bucket.traffic || { source: "Business Report by Child ASIN" as const };
    const ads = bucket.ads || { source: "Advertised Product" as const };
    const inventory = bucket.inventory || { source: "Manage FBA Inventory" as const };
    const base = {
      id: bucket.id,
      accountId,
      name: bucket.name,
      sku: bucket.sku,
      asin: bucket.asin,
      sales: round(finance.sales || traffic.sales || 0),
      netSales: round(finance.netSales || Math.max(0, (finance.sales || traffic.sales || 0) - Math.abs(finance.refundAmount || 0))),
      sessions: round(traffic.sessions || 0, 0),
      units: round(traffic.units || finance.units || 0, 0),
      b2bUnits: round(traffic.b2bUnits || 0, 0),
      refunds: round(finance.refunds || 0, 0),
      conversion: round(traffic.conversion || (traffic.sessions ? (traffic.units || 0) / traffic.sessions * 100 : 0)),
      adSpend: round(ads.adSpend || finance.adSpend || 0),
      adSales: round(ads.adSales || 0),
      adOrders: round(ads.adOrders || 0, 0),
      clicks: round(ads.clicks || 0, 0),
      profit: round(finance.profit || 0),
      storage: round(finance.storage || 0),
      cogs: round(finance.cogs || 0),
      inventory: round(inventory.inventory || 0, 0),
      fulfillable: round(inventory.fulfillable || 0, 0),
      reserved: round(inventory.reserved || 0, 0),
      transfer: round(inventory.transfer || 0, 0),
      unsellable: round(inventory.unsellable || 0, 0),
      inbound: round(inventory.inbound || 0, 0),
      listingUrl: bucket.listingUrl,
      reviewRating: bucket.reviewRating,
      reviewCount: bucket.reviewCount,
      reviewBreakdown: bucket.reviewBreakdown,
      reviewSource: bucket.reviewSource,
      reviewUpdatedAt: bucket.reviewUpdatedAt,
      reviewHistory: bucket.reviewHistory,
      manualSalePrice: bucket.manualSalePrice,
      manualReferralRate: bucket.manualReferralRate,
      manualFbaFeePerUnit: bucket.manualFbaFeePerUnit,
      manualStorageCostPerUnit: bucket.manualStorageCostPerUnit,
      manualInboundCostPerUnit: bucket.manualInboundCostPerUnit,
      manualCogsPerUnit: bucket.manualCogsPerUnit,
      manualAngoraRate: bucket.manualAngoraRate,
      manualAdSales: bucket.manualAdSales,
      manualAdSpend: bucket.manualAdSpend,
    };
    return { ...base, status: statusFor(base), issue: productIssue(base), recommendation: productRecommendation(base, candidates) };
  }).filter((product) => product.sku || product.asin);

  const grossSales = round(sum(skus, "sales"));
  const netSales = round(sum(skus, "netSales"));
  const netProceeds = round(sum(skus, "profit"));
  const storage = round(sum(skus, "storage"));
  const adSpend = round(sum(skus, "adSpend"));
  const adSales = round(sum(skus, "adSales"));
  const sessions = round(sum(skus, "sessions"), 0);
  const units = round(sum(skus, "units"), 0);
  const metrics: DashboardMetrics = {
    grossSales,
    netSales,
    netProceeds,
    storage,
    adSpend,
    adSales,
    clicks: round(sum(skus, "clicks"), 0),
    adOrders: round(sum(skus, "adOrders"), 0),
    sessions,
    units,
    refunds: round(sum(skus, "refunds"), 0),
    inventory: round(sum(skus, "inventory"), 0),
    fulfillable: round(sum(skus, "fulfillable"), 0),
    acos: round(adSales ? adSpend / adSales * 100 : adSpend ? 999 : 0),
    tacos: round(grossSales ? adSpend / grossSales * 100 : adSpend ? 999 : 0),
    conversion: round(sessions ? units / sessions * 100 : 0),
  };
  const wow: PeriodPayload["wow"] = {};
  if (previous) for (const key of Object.keys(metrics) as Array<keyof DashboardMetrics>) wow[key] = round(metrics[key] - previous.metrics[key]);

  const critical = skus.filter((sku) => sku.status === "critical");
  const status: Status = netProceeds < 0 || critical.length >= 2 ? "critical" : skus.some((sku) => sku.status === "attention") ? "attention" : "healthy";
  const insights: PeriodPayload["insights"] = [];
  if (previous) {
    const direction = metrics.netSales >= previous.metrics.netSales ? "increased" : "declined";
    insights.push({ title: `Net revenue ${direction} week over week`, detail: `Net revenue after refunds moved from ${money(previous.metrics.netSales)} to ${money(metrics.netSales)}, a ${money(Math.abs(metrics.netSales - previous.metrics.netSales))} change.`, tone: direction === "increased" ? "healthy" : "attention" });
  }
  if (storage > 0) insights.push({ title: "Storage cost reduced proceeds", detail: `${money(storage)} in storage charges represented ${netProceeds < 0 ? percent(storage / Math.abs(netProceeds || 1) * 100) + " of the reported loss" : "a direct drag on contribution profit"}.`, tone: "critical" });
  if (adSpend > 0) insights.push({ title: "Advertising efficiency", detail: `Campaigns attributed ${money(adSales)} from ${money(adSpend)} in spend at ${percent(metrics.acos)} ACoS.`, tone: metrics.acos > 60 ? "attention" : "healthy" });
  if (sessions > 0) insights.push({ title: "Traffic and conversion", detail: `${sessions} sessions produced ${units} units at ${percent(metrics.conversion)} conversion.`, tone: metrics.conversion < 3 ? "attention" : "healthy" });
  if (!insights.length) insights.push({ title: "Awaiting complete weekly data", detail: "Upload the Monday report package to generate the first confirmed driver analysis.", tone: "monitor" });

  const recommendations: PeriodPayload["recommendations"] = skus.filter((sku) => sku.status !== "healthy").map((sku) => ({ skuId: sku.id, title: `${sku.name}: next change`, detail: sku.recommendation, status: "recommended" }));
  const topWaste = candidates.filter((item) => item.clicks >= 10 && item.orders === 0).sort((a, b) => b.spend - a.spend)[0];
  if (topWaste && !recommendations.some((item) => item.detail.includes(topWaste.label))) recommendations.unshift({ title: `Stop wasted traffic on “${topWaste.label}”`, detail: `${topWaste.clicks} clicks and ${money(topWaste.spend)} in spend produced no order. Reduce or pause the target.`, status: "recommended" });

  const required: ReportType[] = ["SKU Economics", "Business Report by Child ASIN", "Advertised Product", "Search Term", "Targeting", "Placement", "Manage FBA Inventory"];
  const present = [...new Set(summaries.map((summary) => summary.type))];
  const dataQuality = summaries.flatMap((summary) => summary.warnings);
  const missing = required.filter((report) => !present.includes(report));
  if (missing.length) dataQuality.push(`Missing for this period: ${missing.join(", ")}.`);
  const advertised = summaries.find((summary) => summary.type === "Advertised Product");
  const targeting = summaries.find((summary) => summary.type === "Targeting");
  if (advertised && targeting) {
    const difference = Math.abs(reportSpend(advertised) - reportSpend(targeting));
    if (difference > 1) dataQuality.push(`Advertised Product and Targeting spend differ by ${money(difference)}.`);
  }
  const missingCogs = skus.filter((sku) => sku.sales > 0 && sku.cogs === 0).map((sku) => sku.name);
  if (missingCogs.length) dataQuality.push(`COGS is missing for: ${missingCogs.join(", ")}.`);

  const dailyMap = new Map<string, PeriodPayload["daily"][number]>();
  for (const item of summaries.flatMap((summary) => summary.daily)) {
    const prior = dailyMap.get(item.date) || { date: item.date, spend: 0, sales: 0, orders: 0, clicks: 0 };
    prior.spend += item.spend; prior.sales += item.sales; prior.orders += item.orders; prior.clicks += item.clicks;
    dailyMap.set(item.date, prior);
  }
  const placements = summaries.flatMap((summary) => summary.placements).map((item) => ({ ...item, spend: round(item.spend), sales: round(item.sales), acos: round(item.sales ? item.spend / item.sales * 100 : item.spend ? 999 : 0) }));
  const funnel = summaries.flatMap((summary) => summary.funnel).sort((a, b) => b.volume - a.volume).slice(0, 30);
  const startDate = args.startDate || summaries.map((summary) => summary.dateMin).filter(Boolean).sort()[0] || new Date().toISOString().slice(0, 10);
  const endDate = args.endDate || summaries.map((summary) => summary.dateMax).filter(Boolean).sort().at(-1) || startDate;

  return {
    id: `${accountId}:${startDate}:${endDate}`,
    accountId,
    startDate,
    endDate,
    label: `${formatDate(startDate)} to ${formatDate(endDate)}`,
    kind: present.some((report) => report === "Search Query Performance" || report === "Search Catalog Performance") && !present.some((report) => required.includes(report)) ? "monthly" : "weekly",
    status,
    metrics,
    wow,
    daily: [...dailyMap.values()].map((item) => ({ ...item, spend: round(item.spend), sales: round(item.sales) })).sort((a, b) => a.date.localeCompare(b.date)),
    skus,
    insights: insights.slice(0, 4),
    recommendations: recommendations.slice(0, 15),
    dataQuality: [...new Set(dataQuality)],
    reports: present,
    placements,
    funnel,
    generatedAt: new Date().toISOString(),
  } satisfies PeriodPayload;
}

function formatDate(value: string) {
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
