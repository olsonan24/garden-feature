"use client";

import {
  AlertTriangle, ArrowDownRight, ArrowLeft, ArrowUpRight, BarChart3, Building2, CalendarDays, Check, CheckCircle2,
  ChevronDown, ChevronRight, ClipboardCheck, ExternalLink, FileSpreadsheet,
  FileUp, Gauge, Menu, PackagePlus, Pencil, Plus, Save, Search, Send, Sparkles, Target,
  RefreshCw, Star, TrendingUp, Upload, Users, X,
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { DashboardMetrics, DashboardSku, PeriodPayload, Status } from "../lib/analyze-reports";
import { calculateUnitEconomics } from "../lib/unit-economics";

type View = "overview" | "accounts" | "imports" | "review";
type Account = { id: string; name: string; status: Status };
type ImportItem = { id: string; accountId: string; reportType: string; filename: string; period: string; receivedAt: string; status: string };
type ActionItem = { id: string; accountId: string; skuId?: string | null; title: string; detail: string; status: string; createdAt: string; completedAt?: string | null; completedPeriodId?: string | null };
type ReviewRecord = { id: string; accountId: string; periodId: string; note: string; updatedAt: string };
type WeeklySalesPoint = { startDate: string; endDate: string; label: string; sales: number };
type JarvisPhase = "idle" | "thinking";

const weeklyReports = ["SKU Economics", "Business Report by Child ASIN", "Advertised Product", "Search Term", "Targeting", "Placement", "Manage FBA Inventory"];
const monthlyReports = ["Search Query Performance", "Search Catalog Performance"];
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
const integer = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value || 0);
const pct = (value: number) => value >= 900 ? "No ad sales" : `${(value || 0).toFixed(1)}%`;
const unique = <T extends { id: string }>(items: T[]) => [...new Map(items.map((item) => [item.id, item])).values()];
const LOCAL_ECONOMICS_KEY = "jarvis:manual-economics:v1";

type ManualEconomicsValues = Pick<DashboardSku,
  "manualSalePrice" | "manualReferralRate" | "manualFbaFeePerUnit" |
  "manualStorageCostPerUnit" | "manualInboundCostPerUnit" | "manualCogsPerUnit" |
  "manualAngoraRate" | "manualAdSales" | "manualAdSpend"
>;

function manualEconomicsValues(sku: DashboardSku): ManualEconomicsValues {
  return {
    manualSalePrice: sku.manualSalePrice,
    manualReferralRate: sku.manualReferralRate,
    manualFbaFeePerUnit: sku.manualFbaFeePerUnit,
    manualStorageCostPerUnit: sku.manualStorageCostPerUnit,
    manualInboundCostPerUnit: sku.manualInboundCostPerUnit,
    manualCogsPerUnit: sku.manualCogsPerUnit,
    manualAngoraRate: sku.manualAngoraRate,
    manualAdSales: sku.manualAdSales,
    manualAdSpend: sku.manualAdSpend,
  };
}

function readLocalEconomics(): Record<string, ManualEconomicsValues> {
  try { return JSON.parse(localStorage.getItem(LOCAL_ECONOMICS_KEY) || "{}") as Record<string, ManualEconomicsValues>; }
  catch { return {}; }
}

function applyLocalEconomics(skus: DashboardSku[]) {
  const overrides = readLocalEconomics();
  return skus.map((sku) => overrides[sku.id] ? { ...sku, ...overrides[sku.id] } : sku);
}

function setLocalEconomics(sku: DashboardSku, keep: boolean) {
  try {
    const overrides = readLocalEconomics();
    if (keep) overrides[sku.id] = manualEconomicsValues(sku);
    else delete overrides[sku.id];
    localStorage.setItem(LOCAL_ECONOMICS_KEY, JSON.stringify(overrides));
  } catch {
    // The in-memory update still keeps the current PSM session usable when a
    // browser blocks storage entirely.
  }
}

function previousCompletedWeek() {
  const today = new Date();
  const end = new Date(today);
  const daysSinceSaturday = (today.getDay() + 1) % 7;
  end.setDate(today.getDate() - (daysSinceSaturday || 7));
  const start = new Date(end); start.setDate(end.getDate() - 6);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function emptyPeriod(accountId: string): PeriodPayload {
  const dates = previousCompletedWeek();
  return { id: `empty-${accountId}`, accountId, startDate: dates.start, endDate: dates.end, label: "No imported week", kind: "weekly", status: "monitor", metrics: { grossSales: 0, netSales: 0, netProceeds: 0, storage: 0, adSpend: 0, adSales: 0, clicks: 0, adOrders: 0, sessions: 0, units: 0, refunds: 0, inventory: 0, fulfillable: 0, acos: 0, tacos: 0, conversion: 0 }, wow: {}, daily: [], skus: [], insights: [{ title: "No weekly data yet", detail: "Add this account's Monday report package to create its first saved week.", tone: "monitor" }], recommendations: [], dataQuality: ["No reports have been imported for this account."], reports: [], placements: [], funnel: [], generatedAt: new Date().toISOString() };
}

export default function Jarvis() {
  const [view, setView] = useState<View>("overview");
  const [mobile, setMobile] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [skus, setSkus] = useState<DashboardSku[]>([]);
  const [periods, setPeriods] = useState<PeriodPayload[]>([]);
  const [imports, setImports] = useState<ImportItem[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [accountId, setAccountId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [skuId, setSkuId] = useState("");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | "upload" | "account" | "editAccount" | "sku" | "action">(null);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/state").then((response) => response.ok ? response.json() : null).then((data) => {
      if (!data) return;
      const loadedAccounts = data.accounts || [], loadedSkus = applyLocalEconomics(data.skus || []), loadedPeriods = (data.periods || []).sort((a: PeriodPayload, b: PeriodPayload) => b.endDate.localeCompare(a.endDate));
      setAccounts(loadedAccounts); setSkus(loadedSkus); setPeriods(loadedPeriods); setImports(data.imports || []); setActions(data.actions || []); setReviews(data.reviews || []);
      const firstAccount = loadedAccounts[0]?.id || "";
      const firstPeriod = loadedPeriods.find((period: PeriodPayload) => period.accountId === firstAccount && period.kind === "weekly");
      setAccountId(firstAccount); setPeriodId(firstPeriod?.id || ""); setSkuId(firstPeriod?.skus?.[0]?.id || loadedSkus.find((sku: DashboardSku) => sku.accountId === firstAccount)?.id || "");
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 3500); return () => clearTimeout(timer); }, [toast]);

  const account = accounts.find((item) => item.id === accountId) || accounts[0];
  const accountPeriods = periods.filter((period) => period.accountId === accountId && period.kind === "weekly").sort((a, b) => b.endDate.localeCompare(a.endDate));
  const selectedPeriod = periods.find((period) => period.id === periodId && period.accountId === accountId) || accountPeriods[0] || emptyPeriod(accountId);
  const latestMonthlyPeriod = periods.filter((period) => period.accountId === accountId && period.kind === "monthly").sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
  const funnelPeriod = selectedPeriod.funnel.length ? selectedPeriod : latestMonthlyPeriod;
  const accountSkus = mergeSkuData(selectedPeriod.skus, skus.filter((sku) => sku.accountId === accountId));
  const selectedSku = accountSkus.find((sku) => sku.id === skuId) || accountSkus[0];
  const matchingPortfolioPeriods = periods.filter((period) => period.kind === "weekly" && period.startDate === selectedPeriod.startDate && period.endDate === selectedPeriod.endDate);
  const portfolioPeriods = matchingPortfolioPeriods.length ? matchingPortfolioPeriods : [selectedPeriod];
  const portfolioMetrics = aggregateMetrics(portfolioPeriods);
  const portfolioWeekly = portfolioSalesTrend(periods, selectedPeriod.endDate);
  const accountWeekly = accountSalesTrend(periods, accountId, selectedPeriod.endDate);
  const portfolioRevenueChange = portfolioNetRevenueChange(portfolioPeriods, periods);
  const accountActions = actions.filter((action) => action.accountId === accountId);
  const currentReview = reviews.find((review) => review.accountId === accountId && review.periodId === selectedPeriod.id);
  const currentReviewKey = `${accountId}:${selectedPeriod.id}`;
  const reviewDraft = reviewDrafts[currentReviewKey] ?? currentReview?.note ?? "";
  const completedThisWeek = accountActions.filter((action) => action.status === "completed" && action.completedPeriodId === selectedPeriod.id);
  const wins = actionWins(selectedPeriod, periods, accountActions);

  function changeAccount(value: string) {
    setAccountId(value);
    const latest = periods.filter((period) => period.accountId === value && period.kind === "weekly").sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
    if (latest) { setPeriodId(latest.id); setSkuId(latest.skus[0]?.id || ""); }
    else { setPeriodId(""); setSkuId(skus.find((sku) => sku.accountId === value)?.id || ""); }
  }
  function changePeriod(value: string) {
    setPeriodId(value);
    const period = periods.find((item) => item.id === value);
    if (period?.skus.length) setSkuId(period.skus[0].id);
  }
  const post = (body: Record<string, unknown>) => fetch("/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const go = (next: View) => { setView(next); setMobile(false); };

  async function addAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const name = String(form.get("name") || "").trim();
    const item: Account = { id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`, name, status: "healthy" };
    setAccounts((current) => [...current, item]); await post({ kind: "account", ...item }); changeAccount(item.id); setView("accounts"); setModal(null); setToast(`${name} added to JARVIS.`);
  }
  async function editAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const name = String(form.get("name") || "").trim();
    if (!name || !account) return;
    const updated = { ...account, name };
    setAccounts((current) => current.map((item) => item.id === account.id ? updated : item)); await post({ kind: "account", ...updated }); setModal(null); setToast(`Account renamed to ${name}.`);
  }
  async function addSku(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const name = String(form.get("name") || ""), sku = String(form.get("sku") || ""), asin = String(form.get("asin") || ""), listingUrl = String(form.get("listingUrl") || "").trim();
    const item: DashboardSku = { id: `${accountId}-${sku.toLowerCase().replace(/[^a-z0-9]/g, "") || Date.now()}`, accountId, name, sku, asin, listingUrl: listingUrl || undefined, sales: 0, netSales: 0, sessions: 0, units: 0, refunds: 0, conversion: 0, adSpend: 0, adSales: 0, adOrders: 0, clicks: 0, profit: 0, storage: 0, cogs: 0, inventory: 0, fulfillable: 0, reserved: 0, transfer: 0, unsellable: 0, inbound: 0, status: "monitor", issue: "No imported history yet.", recommendation: "Include this SKU in the next Monday report package." };
    setSkus((current) => unique([...current, item])); await post({ kind: "sku", ...item }); setSkuId(item.id); setModal(null); setToast(`${sku} added.`);
  }
  async function addAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const item: ActionItem = { id: `a-${Date.now()}`, accountId, skuId: String(form.get("skuId") || ""), title: String(form.get("title") || ""), detail: String(form.get("detail") || ""), status: "planned", createdAt: new Date().toISOString() };
    setActions((current) => [item, ...current]); await post({ kind: "action", ...item }); setModal(null); setToast("Action added to this account's checklist.");
  }
  async function toggleAction(item: ActionItem) {
    const completed = item.status !== "completed";
    const updated: ActionItem = { ...item, status: completed ? "completed" : "planned", completedAt: completed ? new Date().toISOString() : null, completedPeriodId: completed ? selectedPeriod.id : null };
    setActions((current) => unique([updated, ...current.filter((action) => action.id !== item.id)])); await post({ kind: "action", ...updated });
    setToast(completed ? "Completed action added to this week's review notes." : "Action moved back to the open checklist.");
  }
  async function toggleRecommendation(index: number) {
    const recommendation = selectedPeriod.recommendations[index];
    const id = `rec-${selectedPeriod.id}-${index}`;
    const existing = accountActions.find((action) => action.id === id);
    await toggleAction(existing || { id, accountId, skuId: recommendation.skuId, title: recommendation.title, detail: recommendation.detail, status: "planned", createdAt: new Date().toISOString() });
  }
  async function processUpload(data: FormData, stayInReview: boolean) {
    setUploading(true); data.set("accountId", accountId);
    try {
      const response = await fetch("/api/imports", { method: "POST", body: data }); const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Upload failed");
      setImports((current) => unique([...(body.imports || []), ...current]));
      if (body.period) {
        const period = body.period as PeriodPayload;
        setPeriods((current) => unique([period, ...current.filter((item) => item.id !== period.id)])); setSkus((current) => unique([...current, ...period.skus])); setPeriodId(period.id); setSkuId(period.skus[0]?.id || "");
      }
      setToast(stayInReview ? "Report loaded. The business review preview has been refreshed." : "Reports parsed. The saved week and recommendations are ready.");
      if (!stayInReview) setModal(null);
    } catch (error) { setToast(error instanceof Error ? error.message : "Files could not be processed."); }
    finally { setUploading(false); }
  }
  async function upload(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await processUpload(new FormData(event.currentTarget), false); }
  async function uploadReviewFiles(files: File[]) {
    if (!files.length) return;
    const data = new FormData(); data.set("startDate", selectedPeriod.startDate); data.set("endDate", selectedPeriod.endDate); files.forEach((file) => data.append("files", file));
    await processUpload(data, true);
  }
  async function saveReviewNote() {
    const item: ReviewRecord = { id: currentReviewKey, accountId, periodId: selectedPeriod.id, note: reviewDraft.trim(), updatedAt: new Date().toISOString() };
    setReviews((current) => unique([item, ...current.filter((review) => review.id !== item.id)])); await post({ kind: "review", ...item }); setToast("Weekly review note saved.");
  }
  async function saveSkuEconomics(updated: DashboardSku) {
    setSkus((current) => unique([updated, ...current.filter((item) => item.id !== updated.id)]));
    const response = await post({ kind: "sku", ...updated }).catch(() => null);
    const savedToServer = Boolean(response?.ok);
    setLocalEconomics(updated, !savedToServer);
    setToast(savedToServer ? `Manual economics saved for ${updated.name}.` : `Manual economics saved in this browser for ${updated.name}.`);
  }

  if (loading) return <main className="login-shell"><section className="login-card loading-card"><div className="login-mark"><Sparkles /></div><small>SECURE PORTFOLIO INTELLIGENCE</small><h1>JARVIS</h1><p>Loading your command center...</p></section></main>;
  if (!account) return <main className="login-shell"><section className="login-card"><div className="login-mark"><AlertTriangle /></div><small>DATA UNAVAILABLE</small><h1>JARVIS</h1><p>The portfolio could not be loaded. Refresh the page to try again.</p></section></main>;

  return <div className="shell">
    <aside className={mobile ? "open" : ""}><div className="brand"><b>JARVIS</b><small>Portfolio Intelligence</small><button aria-label="Close navigation" onClick={() => setMobile(false)}><X /></button></div><nav>{([['overview', BarChart3], ['accounts', Users], ['imports', FileSpreadsheet]] as const).map(([item, Icon]) => <button key={item} className={view === item ? "active" : ""} onClick={() => go(item)}><Icon size={19} />{item}</button>)}</nav><div className="system"><i /> Systems operational</div></aside>
    <main><header><button className="menu" aria-label="Open navigation" onClick={() => setMobile(true)}><Menu /></button><label><Building2 /><select aria-label="Account" value={accountId} onChange={(event) => changeAccount(event.target.value)}>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown /></label><label><CalendarDays /><select aria-label="Saved reporting week" value={selectedPeriod.id.startsWith("empty-") ? "" : selectedPeriod.id} onChange={(event) => changePeriod(event.target.value)}><option value="" disabled>{accountPeriods.length ? "Select a saved week" : "No saved weeks"}</option>{accountPeriods.map((period) => <option key={period.id} value={period.id}>{period.label}</option>)}</select><ChevronDown /></label><button className="primary upload" onClick={() => setModal("upload")}><Upload /> Upload Reports</button></header>

      {view === "overview" && <section><Title eyebrow="Weekly command brief" title="Portfolio Overview" sub={`${selectedPeriod.label} · ${matchingPortfolioPeriods.length || 1} account${(matchingPortfolioPeriods.length || 1) === 1 ? "" : "s"}`} />
        <JarvisCompanion key={`portfolio-${selectedPeriod.id}`} account={account} period={selectedPeriod} periods={periods} skus={accountSkus} actions={accountActions} scope="portfolio" portfolioMetrics={portfolioMetrics} revenueChangePercent={portfolioRevenueChange} />
        <div className="net-revenue-hero"><div><small>PRIMARY PORTFOLIO METRIC</small><span>Net Revenue</span><div className="metric-value-row"><strong>{money(portfolioMetrics.netSales)}</strong><RevenueDelta value={portfolioRevenueChange} /></div><p>{wowNote(selectedPeriod, "netSales")} · after refunds</p></div><TrendingUp /></div>
        <div className="overview-grid revenue-grid"><Panel title="Portfolio Net Revenue by Week" sub="Total weekly sales after refunds, including organic and ad-driven sales. Hover any week for the exact amount."><WeeklySalesChart data={portfolioWeekly} /></Panel><Panel title="JARVIS Synopsis" sub="Confirmed drivers for this saved week">{selectedPeriod.insights.slice(0, 4).map((insight, index) => <Insight key={insight.title} n={String(index + 1).padStart(2, "0")} title={insight.title}>{insight.detail}</Insight>)}</Panel></div>
        <div className="kpis secondary-kpis"><Kpi label="Net Proceeds" value={money(portfolioMetrics.netProceeds)} note={`${money(portfolioMetrics.storage)} in storage cost`} icon={<Gauge />} /><Kpi label="Ad Spend" value={money(portfolioMetrics.adSpend)} note={`${integer(portfolioMetrics.clicks)} clicks · ${integer(portfolioMetrics.units)} gross units sold`} icon={<Target />} /><Kpi label="ACoS" value={pct(portfolioMetrics.acos)} note={placementNote(selectedPeriod)} icon={<BarChart3 />} /><Kpi label="Sessions" value={integer(portfolioMetrics.sessions)} note={`${integer(portfolioMetrics.units)} ordered units`} icon={<Users />} /></div>
        <Panel title="Accounts" sub="Portfolio performance for the selected reporting week" right={<button className="secondary" onClick={() => setModal("account")}><Plus /> Add Account</button>}><Table><thead><tr><th>Account</th><th>Net Revenue</th><th>Net Proceeds</th><th>Ad Spend</th><th>ACoS</th><th>Inventory</th></tr></thead><tbody>{accounts.map((item) => { const period = periods.find((candidate) => candidate.accountId === item.id && candidate.startDate === selectedPeriod.startDate && candidate.endDate === selectedPeriod.endDate); return <tr key={item.id} onClick={() => { changeAccount(item.id); go("accounts"); }}><td><b>{item.name}</b><small>{period ? `${period.skus.length} active SKUs` : "No import for this week"}</small></td><td><b>{money(period?.metrics.netSales || 0)}</b></td><td className={(period?.metrics.netProceeds || 0) < 0 ? "bad" : ""}>{money(period?.metrics.netProceeds || 0)}</td><td>{money(period?.metrics.adSpend || 0)}</td><td>{pct(period?.metrics.acos || 0)}</td><td>{integer(period?.metrics.inventory || 0)}</td></tr>; })}</tbody></Table></Panel>
      </section>}

      {view === "accounts" && <section><Title eyebrow="Account command center" title={account.name} sub={`${accountSkus.length} SKUs · ${selectedPeriod.label}`} right={<div className="buttons"><button className="secondary" onClick={() => setModal("editAccount")}><Pencil /> Edit Name</button><button className="secondary" onClick={() => setModal("sku")}><PackagePlus /> Add SKU</button><button className="primary" onClick={() => go("review")}><ClipboardCheck /> Start Weekly Business Review</button></div>} />
        <JarvisCompanion key={`account-${account.id}-${selectedPeriod.id}`} account={account} period={selectedPeriod} periods={periods} skus={accountSkus} actions={accountActions} scope="account" revenueChangePercent={netRevenueChange(selectedPeriod)} />
        <div className="account-revenue"><div><small>PRIMARY ACCOUNT METRIC</small><span>Net Revenue</span><div className="metric-value-row"><strong>{money(selectedPeriod.metrics.netSales)}</strong><RevenueDelta value={netRevenueChange(selectedPeriod)} /></div><p>{wowNote(selectedPeriod, "netSales")} · after refunds</p></div><div className="account-chart"><WeeklySalesChart data={accountWeekly} compact /></div></div>
        <div className="account-strip">{[["Net proceeds", money(selectedPeriod.metrics.netProceeds)], ["Ad spend", money(selectedPeriod.metrics.adSpend)], ["Sessions", integer(selectedPeriod.metrics.sessions)], ["FBA inventory", integer(selectedPeriod.metrics.inventory)], ["Open actions", String(openActionCount(selectedPeriod, accountActions))]].map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div>
        <div className="tabs">{accountSkus.map((sku) => <button key={sku.id} className={selectedSku?.id === sku.id ? "active" : ""} onClick={() => setSkuId(sku.id)}>{sku.name}</button>)}</div>
        {selectedSku ? <div className="sku-grid"><Panel className="sku-main" title={selectedSku.name} sub={`${selectedSku.sku} · ${selectedSku.asin || "ASIN not mapped"}`}><div className="sku-metrics">{[["Net revenue", money(selectedSku.netSales)], ["Net proceeds", money(selectedSku.profit)], ["Sessions", integer(selectedSku.sessions)], ["Conversion", pct(selectedSku.conversion)], ["Ad spend", money(selectedSku.adSpend)], ["Ad sales", money(selectedSku.adSales)], ["ACoS", pct(selectedSku.adSales ? selectedSku.adSpend / selectedSku.adSales * 100 : selectedSku.adSpend ? 999 : 0)]].map(([label, value]) => <div key={label}><span>{label}</span><b className={label === "Net proceeds" && selectedSku.profit < 0 ? "bad" : ""}>{value}</b></div>)}<div><span>Total order units</span><b>{integer(selectedSku.units)}</b><small className="sku-metric-note">Includes {integer(selectedSku.b2bUnits || 0)} B2B</small></div></div></Panel><InventorySnapshot sku={selectedSku} period={selectedPeriod} periods={periods} /><ListingReputation sku={selectedSku} onSaved={(updated) => setSkus((current) => unique([...current.filter((item) => item.id !== updated.id), updated]))} onToast={setToast} /><SkuEconomicsPanel key={selectedSku.id} sku={selectedSku} onSave={saveSkuEconomics} /><Panel title="What Happened" className="danger"><p className="copy">{selectedSku.issue}</p></Panel><Panel title="Recommended Change" className="recommend"><p className="copy">{selectedSku.recommendation}</p><button className="link" onClick={() => setModal("action")}>Add to checklist <ChevronRight /></button></Panel></div> : <Panel title="No SKU data" sub="Add a SKU manually or upload the weekly report package."><button className="primary" onClick={() => setModal("sku")}><PackagePlus /> Add SKU</button></Panel>}
        <ActionChecklist period={selectedPeriod} account={account} skus={accountSkus} actions={accountActions} onToggleAction={toggleAction} onToggleRecommendation={toggleRecommendation} onAdd={() => setModal("action")} />
        <Panel title="SKU Directory" sub={`All products attached to ${account.name}`} right={<label className="search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search SKU or ASIN" /></label>}><Table><thead><tr><th>Product</th><th>SKU / ASIN</th><th>Net Revenue</th><th>Sessions</th><th>Units</th><th>Conversion</th><th>Inventory</th><th>Net Proceeds</th></tr></thead><tbody>{accountSkus.filter((sku) => `${sku.name}${sku.sku}${sku.asin}`.toLowerCase().includes(search.toLowerCase())).map((sku) => <tr key={sku.id} onClick={() => setSkuId(sku.id)}><td><b>{sku.name}</b></td><td>{sku.sku}<small>{sku.asin}</small></td><td><b>{money(sku.netSales)}</b></td><td>{integer(sku.sessions)}</td><td>{integer(sku.units)}</td><td>{pct(sku.conversion)}</td><td>{integer(sku.inventory)}</td><td className={sku.profit < 0 ? "bad" : ""}>{money(sku.profit)}</td></tr>)}</tbody></Table></Panel>
        {funnelPeriod && funnelPeriod.funnel.length > 0 && <Panel title="Monthly Search Funnel" sub={`Latest monthly package · ${funnelPeriod.label}`}><Table><thead><tr><th>Query</th><th>Volume</th><th>Impression Share</th><th>Click Share</th><th>Cart Share</th><th>Purchase Share</th></tr></thead><tbody>{funnelPeriod.funnel.slice(0, 15).map((item) => <tr key={item.query}><td><b>{item.query}</b></td><td>{integer(item.volume)}</td><td>{item.impressionShare === undefined ? "—" : pct(item.impressionShare)}</td><td>{item.clickShare === undefined ? "—" : pct(item.clickShare)}</td><td>{item.cartShare === undefined ? "—" : pct(item.cartShare)}</td><td>{item.purchaseShare === undefined ? "—" : pct(item.purchaseShare)}</td></tr>)}</tbody></Table></Panel>}
      </section>}

      {view === "imports" && <section><Title eyebrow="Data operations" title="Import Center" sub="Every source file, reporting period, and parsing result stays attached to its account." right={<button className="primary" onClick={() => setModal("upload")}><Upload /> Upload Reports</button>} />
        <h3 className="section-label">Weekly Monday package</h3><div className="report-grid">{weeklyReports.map((report) => <ReportCard key={report} report={report} present={selectedPeriod.reports.includes(report as PeriodPayload["reports"][number])} period={selectedPeriod} />)}</div>
        <h3 className="section-label">Monthly search package</h3><div className="report-grid monthly">{monthlyReports.map((report) => <ReportCard key={report} report={report} present={periods.some((period) => period.accountId === accountId && period.reports.includes(report as PeriodPayload["reports"][number]))} period={selectedPeriod} />)}</div>
        <Panel title="Import History" sub="Original files remain saved with the account and source period."><Table><thead><tr><th>Report</th><th>File</th><th>Coverage</th><th>Received</th><th>Status</th></tr></thead><tbody>{imports.filter((item) => item.accountId === accountId).map((item) => <tr key={item.id}><td><b>{item.reportType}</b></td><td>{item.filename}</td><td>{item.period}</td><td>{formatDate(item.receivedAt)}</td><td><span className={item.status.toLowerCase().includes("warning") ? "imported warning" : "imported"}><Check /> {item.status}</span></td></tr>)}</tbody></Table></Panel>
        <Panel title="Data Quality Notes" className="notes"><ul>{selectedPeriod.dataQuality.length ? selectedPeriod.dataQuality.map((note) => <li key={note}>{note}</li>) : <li>All required reports reconciled within the configured tolerance.</li>}</ul></Panel>
      </section>}

      {view === "review" && <section className="review-workspace"><Title eyebrow="Client-facing weekly review" title={`${account.name} Weekly Business Review`} sub={selectedPeriod.label} right={<button className="secondary" onClick={() => go("accounts")}><ArrowLeft /> Back to Account</button>} />
        <div className="review-layout"><aside className="review-builder"><div className="builder-head"><small>REVIEW BUILDER</small><h2>Add this week&apos;s reports</h2><p>Drop reports one at a time or together. Each successful import refreshes the preview immediately.</p></div><label className={`review-drop ${uploading ? "loading" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void uploadReviewFiles(Array.from(event.dataTransfer.files)); }}><FileUp /><b>{uploading ? "Analyzing report..." : "Drop report files here"}</b><span>or click to browse</span><input type="file" accept=".csv,.xlsx,.xls,.txt" multiple disabled={uploading} onChange={(event) => { void uploadReviewFiles(Array.from(event.target.files || [])); event.currentTarget.value = ""; }} /></label><div className="review-report-list">{weeklyReports.map((report) => { const present = selectedPeriod.reports.includes(report as PeriodPayload["reports"][number]); return <div key={report} className={present ? "ready" : ""}><span>{present ? <CheckCircle2 /> : <AlertTriangle />}</span><p><b>{report}</b><small>{present ? "Included in preview" : "Waiting for report"}</small></p></div>; })}</div></aside>
          <div className="wbr-preview" aria-busy={uploading}><header><div><small>WEEKLY BUSINESS REVIEW</small><h1>{account.name}</h1><p>{selectedPeriod.label}</p></div></header><div className="client-kpis"><div className="primary-client-kpi"><span>Net Revenue</span><div className="metric-value-row"><strong>{money(selectedPeriod.metrics.netSales)}</strong><RevenueDelta value={netRevenueChange(selectedPeriod)} light /></div><small>{wowNote(selectedPeriod, "netSales")}</small></div><div><span>Units</span><strong>{integer(selectedPeriod.metrics.units)}</strong><small>{integer(selectedPeriod.metrics.sessions)} sessions</small></div><div><span>ACoS</span><strong>{pct(selectedPeriod.metrics.acos)}</strong><small>{money(selectedPeriod.metrics.adSpend)} spend</small></div></div>
            <ReviewSection title="Executive Summary"><p>{executiveSummary(selectedPeriod)}</p></ReviewSection>
            <ReviewSection title="Weekly Net Revenue Trend" sub="Total weekly sales after refunds, including organic and ad-driven sales. Hover a week to see the exact amount."><WeeklySalesChart data={accountWeekly} /></ReviewSection>
            <ReviewSection title="What We Saw Last Week"><div className="synopsis-list">{selectedPeriod.insights.map((insight) => <article key={insight.title}><span className={insight.tone} /><div><b>{insight.title}</b><p>{insight.detail}</p></div></article>)}{wins.map((win) => <article className="win" key={win}><span /><div><b>Win from a previous change</b><p>{win}</p></div></article>)}</div></ReviewSection>
            <ReviewSection title="What We Did This Week" sub="Completed checklist items are added here automatically."><ul className="completed-notes">{completedThisWeek.length ? completedThisWeek.map((item) => <li key={item.id}><CheckCircle2 /><span><b>{item.title}</b>{item.detail && <small>{item.detail}</small>}</span></li>) : <li className="empty-note">No checklist items have been marked complete for this review yet.</li>}</ul></ReviewSection>
            <ReviewSection title="Additional Notes" sub="Optional client-facing context for this week."><textarea className="review-note" value={reviewDraft} onChange={(event) => setReviewDrafts((current) => ({ ...current, [currentReviewKey]: event.target.value }))} placeholder="Add any context you want the client to see..." rows={4} /><button className="secondary save-note" onClick={saveReviewNote}><Save /> Save Note</button></ReviewSection>
            {uploading && <div className="review-generating"><Sparkles /> Updating the client preview from the new report...</div>}
          </div></div>
      </section>}
    </main>

    {modal && <div className="backdrop" onMouseDown={() => !uploading && setModal(null)}><div className="modal" onMouseDown={(event) => event.stopPropagation()}><button className="close" aria-label="Close modal" disabled={uploading} onClick={() => setModal(null)}><X /></button>
      {modal === "upload" && <UploadForm account={account} uploading={uploading} onSubmit={upload} />}
      {modal === "account" && <form onSubmit={addAccount}><h2>Add Account</h2><p>Create the account once. Its SKUs, imports, notes, and history stay attached.</p><label>Account name<input name="name" required autoFocus /></label><button className="primary full">Add Account</button></form>}
      {modal === "editAccount" && <form onSubmit={editAccount}><h2>Edit Account Name</h2><p>Use the official Seller Central account name. This updates every JARVIS view without changing the saved history.</p><label>Official account name<input name="name" defaultValue={account.name} required autoFocus /></label><button className="primary full">Save Account Name</button></form>}
      {modal === "sku" && <form onSubmit={addSku}><h2>Add SKU</h2><p>Add a product manually or let the next report identify it.</p><label>Product name<input name="name" required /></label><label>Seller SKU<input name="sku" required /></label><label>ASIN<input name="asin" /></label><label>Amazon listing link<input name="listingUrl" type="url" placeholder="https://www.amazon.com/dp/..." /></label><button className="primary full">Add SKU</button></form>}
      {modal === "action" && <form onSubmit={addAction}><h2>Add Checklist Item</h2><p>Save what changed so the next review has the context needed to explain the result.</p><label>Product<select name="skuId" defaultValue={selectedSku?.id}>{accountSkus.map((sku) => <option key={sku.id} value={sku.id}>{sku.name}</option>)}</select></label><label>Action title<input name="title" required /></label><label>Details<textarea name="detail" rows={4} /></label><button className="primary full">Add to Checklist</button></form>}
    </div></div>}
    {toast && <div className="toast"><Check />{toast}</div>}
  </div>;
}

function UploadForm({ account, uploading, onSubmit }: { account: Account; uploading: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const dates = previousCompletedWeek();
  return <form onSubmit={onSubmit}><h2>Upload Reports</h2><p>Attach any or all weekly reports for {account.name}. JARVIS identifies each file, updates the saved week, and regenerates the account and SKU analysis.</p><div className="date-fields"><label>Week starts<input type="date" name="startDate" defaultValue={dates.start} required /></label><label>Week ends<input type="date" name="endDate" defaultValue={dates.end} required /></label></div><label className="drop"><Upload /><b>Choose Amazon report files</b><small>CSV, XLSX, XLS, or TXT · multiple files allowed</small><input name="files" type="file" accept=".csv,.xlsx,.xls,.txt" multiple required /></label><button className="primary full" disabled={uploading}>{uploading ? "Parsing reports..." : "Import and Analyze"}</button><small className="privacy-note">Original files are saved with this account. Overlapping reports update the same saved week instead of creating duplicate metrics.</small></form>;
}

function ActionChecklist({ period, account, skus, actions, onToggleAction, onToggleRecommendation, onAdd }: { period: PeriodPayload; account: Account; skus: DashboardSku[]; actions: ActionItem[]; onToggleAction: (item: ActionItem) => void; onToggleRecommendation: (index: number) => void; onAdd: () => void }) {
  const manual = actions.filter((action) => !action.id.startsWith(`rec-${period.id}-`));
  return <Panel title="Action Checklist" sub="Check an item when it is finished. Completed items automatically become notes in this week's business review." right={<button className="secondary" onClick={onAdd}><Plus /> Add Item</button>}><div className="checklist">
    {period.recommendations.map((item, index) => { const saved = actions.find((action) => action.id === `rec-${period.id}-${index}`); const checked = saved?.status === "completed"; return <label className={checked ? "done" : ""} key={`${item.title}-${index}`}><input type="checkbox" checked={checked} onChange={() => onToggleRecommendation(index)} /><span className="check-box"><Check /></span><span><small>{period.skus.find((sku) => sku.id === item.skuId)?.name || account.name} · JARVIS recommendation</small><b>{item.title}</b><p>{item.detail}</p></span></label>; })}
    {manual.map((item) => <label className={item.status === "completed" ? "done" : ""} key={item.id}><input type="checkbox" checked={item.status === "completed"} onChange={() => onToggleAction(item)} /><span className="check-box"><Check /></span><span><small>{skus.find((sku) => sku.id === item.skuId)?.name || account.name} · Added {formatDate(item.createdAt)}</small><b>{item.title}</b><p>{item.detail}</p></span></label>)}
    {!period.recommendations.length && !manual.length && <div className="empty-checklist"><ClipboardCheck /><b>No actions yet</b><span>Add an item or import the weekly reports to generate recommendations.</span></div>}
  </div></Panel>;
}

function ListingReputation({ sku, onSaved, onToast }: { sku: DashboardSku; onSaved: (sku: DashboardSku) => void; onToast: (message: string) => void }) {
  return <ListingReputationInner key={sku.id} sku={sku} onSaved={onSaved} onToast={onToast} />;
}

function ListingReputationInner({ sku, onSaved, onToast }: { sku: DashboardSku; onSaved: (sku: DashboardSku) => void; onToast: (message: string) => void }) {
  const [listingUrl, setListingUrl] = useState(sku.listingUrl || "");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>, manual = false) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setRefreshing(true); setError("");
    try {
      const payload: Record<string, unknown> = { skuId: sku.id, accountId: sku.accountId, listingUrl };
      if (manual) { payload.manualRating = form.get("manualRating"); payload.manualReviewCount = form.get("manualReviewCount"); }
      const response = await fetch("/api/reviews", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The rating could not be refreshed.");
      onSaved(body.sku as DashboardSku);
      onToast(manual ? "Manual listing rating saved." : "Amazon rating and review count refreshed.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The rating could not be refreshed."); }
    finally { setRefreshing(false); }
  }

  const history = [...(sku.reviewHistory || [])].sort((a, b) => a.checkedAt.localeCompare(b.checkedAt));
  const previous = history.length > 1 ? history.at(-2) : undefined;
  const reviewDelta = previous !== undefined && sku.reviewCount !== undefined ? sku.reviewCount - previous.reviewCount : undefined;
  const hasRating = sku.reviewRating !== undefined && sku.reviewCount !== undefined;
  return <Panel className="reputation-panel" title="Listing Reputation" sub={sku.reviewUpdatedAt ? `Last refreshed ${formatDate(sku.reviewUpdatedAt)} · ${sku.reviewSource === "manual" ? "manual" : "Amazon"}` : "Add the Amazon listing link to begin tracking ratings"}>
    {hasRating && <div className="rating-summary"><div><div className="rating-number"><strong>{sku.reviewRating?.toFixed(1)}</strong><span>/ 5</span></div><div className="rating-stars" aria-label={`${sku.reviewRating} out of 5 stars`}>{[1, 2, 3, 4, 5].map((star) => <Star key={star} className={star <= Math.round(sku.reviewRating || 0) ? "filled" : ""} />)}</div></div><div className="rating-count"><strong>{integer(sku.reviewCount || 0)}</strong><span>ratings</span>{reviewDelta !== undefined && reviewDelta !== 0 && <small className={reviewDelta > 0 ? "up" : "down"}>{reviewDelta > 0 ? "+" : ""}{integer(reviewDelta)} since last pull</small>}</div></div>}
    {hasRating && Object.keys(sku.reviewBreakdown || {}).length > 0 && <div className="rating-breakdown">{[5, 4, 3, 2, 1].map((stars) => { const value = sku.reviewBreakdown?.[String(stars)] || 0; return <div key={stars}><span>{stars}★</span><i><b style={{ width: `${value}%` }} /></i><small>{value}%</small></div>; })}</div>}
    <form className="listing-link-form" onSubmit={(event) => void save(event)}><label htmlFor={`listing-${sku.id}`}>Amazon listing link</label><div><input id={`listing-${sku.id}`} type="url" required value={listingUrl} onChange={(event) => setListingUrl(event.target.value)} placeholder="https://www.amazon.com/dp/..." /><button className="secondary" disabled={refreshing}><RefreshCw className={refreshing ? "spinning" : ""} />{refreshing ? "Pulling..." : hasRating ? "Refresh" : "Save & Pull"}</button>{sku.listingUrl && <a className="secondary icon-button" href={sku.listingUrl} target="_blank" rel="noreferrer" aria-label="Open Amazon listing"><ExternalLink /></a>}</div></form>
    {error && <p className="listing-error"><AlertTriangle />{error}</p>}
    <details className="manual-rating"><summary>Enter rating manually</summary><form onSubmit={(event) => void save(event, true)}><label>Star rating<input name="manualRating" type="number" min="0" max="5" step="0.1" defaultValue={sku.reviewRating} required /></label><label>Rating count<input name="manualReviewCount" type="number" min="0" step="1" defaultValue={sku.reviewCount} required /></label><button className="secondary" disabled={refreshing}>Save Manual Update</button></form></details>
  </Panel>;
}

function JarvisCompanion({ account, period, periods, skus, actions, scope, portfolioMetrics, revenueChangePercent }: { account: Account; period: PeriodPayload; periods: PeriodPayload[]; skus: DashboardSku[]; actions: ActionItem[]; scope: "portfolio" | "account"; portfolioMetrics?: DashboardMetrics; revenueChangePercent?: number }) {
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState(`Good morning. I am synchronized with ${scope === "portfolio" ? "the portfolio" : account.name} for ${period.label}. Ask me for the weekly brief, advertising performance, inventory risk, or the SKU that needs attention.`);
  const [phase, setPhase] = useState<JarvisPhase>("idle");
  const thinkingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (thinkingTimer.current) clearTimeout(thinkingTimer.current);
  }, []);

  function ask(value: string) {
    const cleanPrompt = value.trim();
    if (!cleanPrompt) return;
    setPrompt(cleanPrompt); setPhase("thinking");
    if (thinkingTimer.current) clearTimeout(thinkingTimer.current);
    thinkingTimer.current = setTimeout(() => {
      const response = buildJarvisAnswer(cleanPrompt, { account, period, periods, skus, actions, scope, metrics: portfolioMetrics || period.metrics, revenueChangePercent });
      setAnswer(response); setPrompt(""); setPhase("idle");
    }, 720);
  }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); ask(prompt); }

  const status = phase === "thinking" ? "NEURAL PROCESSING" : "NEURAL CORE ONLINE";
  const suggestions = ["How did we do last week?", "What changed week over week?", "Which SKU needs attention?", "How are ads performing?"];
  return <article className={`jarvis-command ${phase}`}>
    <div className="jarvis-visual"><NeuralCore thinking={phase === "thinking"} /><small><i /> {status}</small></div>
    <div className="jarvis-console"><div className="jarvis-console-head"><div><small>JARVIS INTELLIGENCE</small><h2>Ask the command center</h2></div></div>
      <div className="jarvis-response" aria-live="polite">{phase === "thinking" ? <><span className="thinking-dots"><i /><i /><i /></span>Cross-referencing saved account history...</> : <p>{answer}</p>}</div>
      <div className="jarvis-prompts">{suggestions.map((item) => <button key={item} onClick={() => ask(item)}>{item}</button>)}</div>
      <form className="jarvis-chat" onSubmit={submit}><input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask JARVIS about last week, ads, inventory, or any SKU..." aria-label="Ask JARVIS" /><button type="submit" disabled={!prompt.trim() || phase === "thinking"} aria-label="Send question"><Send /></button></form>
      <small className="jarvis-data-note">Answers use the selected reporting period and saved JARVIS history.</small>
    </div>
  </article>;
}

function NeuralCore({ thinking }: { thinking: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activityRef = useRef(thinking ? 1 : 0);

  useEffect(() => { activityRef.current = thinking ? 1 : 0; }, [thinking]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d")!;
    if (!context) return;

    type CoreNode = { x: number; y: number; radius: number; phaseX: number; phaseY: number; drift: number; flash: number; depth: number };
    type Edge = { from: number; to: number; strength: number; bend: number; phase: number };
    type Signal = { edge: number; progress: number; speed: number };
    type ProjectedNode = CoreNode & { px: number; py: number };
    const nodes: CoreNode[] = [];
    const edges: Edge[] = [];
    const signals: Signal[] = [];
    let width = 330, height = 250, frame = 0, activity = activityRef.current, lastSignal = 0;
    let seed = 74831;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

    // Overlapping lobes create a cohesive but deliberately irregular neural cloud.
    const lobes = [
      { x: -.62, y: -.03, rx: .39, ry: .55, weight: 36 },
      { x: -.27, y: -.34, rx: .49, ry: .35, weight: 42 },
      { x: .18, y: -.37, rx: .48, ry: .34, weight: 40 },
      { x: .57, y: -.08, rx: .36, ry: .48, weight: 34 },
      { x: .37, y: .31, rx: .47, ry: .36, weight: 42 },
      { x: -.08, y: .42, rx: .52, ry: .30, weight: 40 },
      { x: -.48, y: .29, rx: .40, ry: .38, weight: 34 },
    ];
    const gaussian = () => Math.sqrt(-2 * Math.log(Math.max(random(), .0001))) * Math.cos(Math.PI * 2 * random());
    for (const lobe of lobes) {
      for (let index = 0; index < lobe.weight; index += 1) {
        const angle = random() * Math.PI * 2;
        const distance = Math.pow(random(), .64);
        const ragged = 1 + Math.sin(angle * 5 + lobe.x * 9) * .09 + gaussian() * .035;
        nodes.push({
          x: lobe.x + Math.cos(angle) * distance * lobe.rx * ragged,
          y: lobe.y + Math.sin(angle) * distance * lobe.ry * ragged,
          radius: .22 + random() * .48,
          phaseX: random() * Math.PI * 2,
          phaseY: random() * Math.PI * 2,
          drift: .45 + random() * .8,
          flash: random() < .035 ? random() * .45 : 0,
          depth: .25 + random() * .75,
        });
      }
    }

    // Dense local synapses make the mass feel almost impossibly intricate.
    for (let from = 0; from < nodes.length; from += 1) {
      const candidates: Array<{ index: number; distance: number }> = [];
      for (let to = 0; to < nodes.length; to += 1) {
        if (to === from) continue;
        const a = nodes[from], b = nodes[to];
        const dx = a.x - b.x, dy = a.y - b.y;
        candidates.push({ index: to, distance: Math.hypot(dx, dy) + Math.abs(a.depth - b.depth) * .08 });
      }
      candidates.sort((a, b) => a.distance - b.distance);
      const connectionCount = 2 + (from % 5 === 0 ? 1 : 0);
      for (const candidate of candidates.slice(0, connectionCount)) {
        if (candidate.index < from) continue;
        edges.push({
          from,
          to: candidate.index,
          strength: Math.max(.18, 1 - candidate.distance * 1.7),
          bend: (random() - .5) * .12,
          phase: random() * Math.PI * 2,
        });
      }
    }

    // A few longer axons stitch distant lobes together without imposing symmetry.
    for (let index = 0; index < 46; index += 1) {
      const from = Math.floor(random() * nodes.length);
      let to = Math.floor(random() * nodes.length);
      let attempts = 0;
      while (Math.hypot(nodes[from].x - nodes[to].x, nodes[from].y - nodes[to].y) < .42 && attempts < 20) {
        to = Math.floor(random() * nodes.length); attempts += 1;
      }
      edges.push({ from, to, strength: .1 + random() * .16, bend: (random() - .5) * .32, phase: random() * Math.PI * 2 });
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width); height = Math.max(1, rect.height);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize); observer.observe(canvas);

    function draw(time: number) {
      frame = requestAnimationFrame(draw);
      activity += (activityRef.current - activity) * .045;
      context.clearRect(0, 0, width, height);
      const scaleX = width * .45, scaleY = height * .44;
      const centerX = width * .5, centerY = height * .5;
      const projected: ProjectedNode[] = nodes.map((node) => ({
        ...node,
        px: centerX + (node.x + Math.sin(time * .00027 * node.drift + node.phaseX) * (.012 + activity * .006)) * scaleX,
        py: centerY + (node.y + Math.cos(time * .00023 * node.drift + node.phaseY) * (.014 + activity * .007)) * scaleY,
      }));

      const orderedEdges = edges.map((edge) => ({ edge, depth: (projected[edge.from].depth + projected[edge.to].depth) / 2 })).sort((a, b) => a.depth - b.depth);
      context.save();
      context.globalCompositeOperation = "lighter";
      for (const { edge, depth } of orderedEdges) {
        const a = projected[edge.from], b = projected[edge.to];
        const alpha = (.045 + depth * .09 + activity * .018) * edge.strength;
        const bend = edge.bend + Math.sin(time * .00022 + edge.phase) * .018;
        const midX = (a.px + b.px) / 2 + (b.py - a.py) * bend;
        const midY = (a.py + b.py) / 2 - (b.px - a.px) * bend;
        context.beginPath(); context.moveTo(a.px, a.py); context.quadraticCurveTo(midX, midY, b.px, b.py);
        context.strokeStyle = `rgba(255,147,54,${alpha})`;
        context.lineWidth = .22 + depth * .24 + activity * .05;
        context.stroke();
      }

      const signalInterval = 310 - activity * 245;
      if (time - lastSignal > signalInterval && signals.length < 34) {
        const burst = activity > .55 ? 2 + Math.floor(random() * 3) : 1;
        for (let index = 0; index < burst; index += 1) {
          const edge = Math.floor(random() * edges.length);
          signals.push({ edge, progress: 0, speed: .006 + random() * .008 + activity * .009 });
          nodes[edges[edge].from].flash = .7 + random() * .3;
        }
        lastSignal = time;
      }

      for (let index = signals.length - 1; index >= 0; index -= 1) {
        const signal = signals[index], edge = edges[signal.edge], a = projected[edge.from], b = projected[edge.to];
        signal.progress += signal.speed * (.8 + activity * .65);
        const t = Math.min(1, signal.progress);
        const curve = Math.sin(t * Math.PI) * edge.bend;
        const x = a.px + (b.px - a.px) * t + (b.py - a.py) * curve;
        const y = a.py + (b.py - a.py) * t - (b.px - a.px) * curve;
        const glowRadius = 2.5 + a.depth * 2.7 + activity * 1.2;
        const glow = context.createRadialGradient(x, y, 0, x, y, glowRadius);
        glow.addColorStop(0, "rgba(255,238,194,.88)"); glow.addColorStop(.22, "rgba(255,169,67,.52)"); glow.addColorStop(1, "rgba(255,104,12,0)");
        context.fillStyle = glow; context.beginPath(); context.arc(x, y, glowRadius, 0, Math.PI * 2); context.fill();
        context.fillStyle = "rgba(255,239,198,.82)"; context.beginPath(); context.arc(x, y, .35 + a.depth * .24, 0, Math.PI * 2); context.fill();
        if (signal.progress >= 1) { nodes[edge.to].flash = 1; signals.splice(index, 1); }
      }

      for (const node of projected.sort((a, b) => a.depth - b.depth)) {
        const nodePulse = .5 + Math.sin(time * .00135 + node.phaseX) * .5;
        const radius = node.radius + node.depth * .22 + node.flash * .5;
        if (node.flash > .06) {
          const glowRadius = 2.5 + node.flash * 4;
          const glow = context.createRadialGradient(node.px, node.py, 0, node.px, node.py, glowRadius);
          glow.addColorStop(0, `rgba(255,220,158,${.38 * node.flash})`); glow.addColorStop(1, "rgba(255,119,0,0)");
          context.fillStyle = glow; context.beginPath(); context.arc(node.px, node.py, glowRadius, 0, Math.PI * 2); context.fill();
        }
        const nodeAlpha = .18 + node.depth * .28 + nodePulse * .04 + node.flash * .24;
        context.fillStyle = `rgba(255,166,69,${nodeAlpha})`;
        context.beginPath(); context.arc(node.px, node.py, radius, 0, Math.PI * 2); context.fill();
        node.flash *= .94 - activity * .012;
      }
      context.restore();
    }

    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, []);

  return <div className={`neural-core ${thinking ? "active" : ""}`} role="img" aria-label={thinking ? "JARVIS neural network processing" : "JARVIS neural network online"}><canvas ref={canvasRef} /></div>;
}

type TrailingWindow = 6 | 8 | 12;

function InventorySnapshot({ sku, period, periods }: { sku: DashboardSku; period: PeriodPayload; periods: PeriodPayload[] }) {
  const [window, setWindow] = useState<TrailingWindow>(6);
  const weeklyHistory = periods
    .filter((item) => item.accountId === sku.accountId && item.kind === "weekly" && item.endDate <= period.endDate)
    .sort((left, right) => right.endDate.localeCompare(left.endDate))
    .slice(0, window);
  const trailingUnits = weeklyHistory.reduce((total, item) => {
    const match = item.skus.find((candidate) => candidate.id === sku.id
      || Boolean(sku.sku && candidate.sku && candidate.sku.toLowerCase() === sku.sku.toLowerCase())
      || Boolean(sku.asin && candidate.asin && candidate.asin.toLowerCase() === sku.asin.toLowerCase()));
    return total + (match?.units || 0);
  }, 0);
  const loadedWeeks = weeklyHistory.length;
  const averageUnits = loadedWeeks ? trailingUnits / loadedWeeks : 0;
  const weeksOfCover = averageUnits > 0 ? sku.fulfillable / averageUnits : null;

  return <Panel title="Inventory Snapshot" sub={`Latest package · ${formatDate(period.generatedAt)}`}>
    <div className="inventory"><b>{integer(sku.inventory)}</b><span>Total FBA</span><div>{[["Fulfillable", sku.fulfillable], ["Reserved", sku.reserved], ["FC transfer", sku.transfer]].map(([label, value]) => <p key={label}><small>{label}</small><strong>{integer(Number(value))}</strong></p>)}</div></div>
    <div className="inventory-velocity">
      <div className="inventory-velocity-head"><span>Average units sold / week</span><div className="inventory-range" role="group" aria-label="Trailing sales window">{([6, 8, 12] as TrailingWindow[]).map((value) => <button key={value} type="button" aria-pressed={window === value} onClick={() => setWindow(value)}>{value} weeks</button>)}</div></div>
      <div className="inventory-average"><strong>{averageUnits.toFixed(1)}</strong><span>units / week</span></div>
      <p>{integer(trailingUnits)} units across {loadedWeeks} saved week{loadedWeeks === 1 ? "" : "s"}{loadedWeeks < window ? ` · ${window - loadedWeeks} more needed for a full ${window}-week view` : ""}</p>
      {weeksOfCover !== null && <small>{weeksOfCover.toFixed(1)} weeks of cover from currently fulfillable inventory</small>}
    </div>
  </Panel>;
}

function SkuEconomicsPanel({ sku, onSave }: { sku: DashboardSku; onSave: (sku: DashboardSku) => Promise<void> }) {
  const averagePrice = sku.units ? (sku.netSales || sku.sales) / sku.units : 24.99;
  const importedCogsPerUnit = sku.units ? sku.cogs / sku.units : sku.cogs;
  const importedStoragePerUnit = sku.units ? sku.storage / sku.units : sku.storage;
  const [price, setPrice] = useState(sku.manualSalePrice ?? Math.max(.01, averagePrice));
  const [referralRate, setReferralRate] = useState(sku.manualReferralRate ?? 15);
  const [fbaFee, setFbaFee] = useState(sku.manualFbaFeePerUnit ?? 0);
  const [storageCost, setStorageCost] = useState(sku.manualStorageCostPerUnit ?? importedStoragePerUnit ?? 0);
  const [inboundCost, setInboundCost] = useState(sku.manualInboundCostPerUnit ?? 0);
  const [cogs, setCogs] = useState(sku.manualCogsPerUnit ?? importedCogsPerUnit ?? 0);
  const [angoraRate, setAngoraRate] = useState(sku.manualAngoraRate ?? 5);
  const [adSales, setAdSales] = useState(sku.manualAdSales ?? sku.adSales);
  const [adSpend, setAdSpend] = useState(sku.manualAdSpend ?? sku.adSpend);
  const [saving, setSaving] = useState(false);
  const currentUnits = Math.max(0, sku.units);
  const economics = calculateUnitEconomics({ salePrice: price, referralRate, fbaFee, storageCost, inboundCost, cogs, angoraRate, adSales, adSpend, units: currentUnits });

  async function saveCosts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    try {
      await onSave({
        ...sku,
        manualSalePrice: Math.max(0, price),
        manualReferralRate: Math.max(0, referralRate),
        manualFbaFeePerUnit: Math.max(0, fbaFee),
        manualStorageCostPerUnit: Math.max(0, storageCost),
        manualInboundCostPerUnit: Math.max(0, inboundCost),
        manualCogsPerUnit: Math.max(0, cogs),
        manualAngoraRate: Math.max(0, angoraRate),
        manualAdSales: Math.max(0, adSales),
        manualAdSpend: Math.max(0, adSpend),
      });
    }
    finally { setSaving(false); }
  }

  return <Panel className="economics-panel" title="Unit Economics">
    <form className="economics-inputs" onSubmit={saveCosts}>
      <EconomicsInput label="Unit sale price" value={price} onChange={setPrice} prefix="$" />
      <EconomicsInput label="Amazon referral" value={referralRate} onChange={setReferralRate} suffix="%" step="0.1" />
      <EconomicsInput label="FBA fees / unit" value={fbaFee} onChange={setFbaFee} prefix="$" />
      <EconomicsInput label="Storage cost / unit" value={storageCost} onChange={setStorageCost} prefix="$" />
      <EconomicsInput label="FBA inbound / unit" value={inboundCost} onChange={setInboundCost} prefix="$" />
      <EconomicsInput label="COGS / unit" value={cogs} onChange={setCogs} prefix="$" />
      <EconomicsInput label="Angora" value={angoraRate} onChange={setAngoraRate} suffix="%" step="0.1" />
      <EconomicsInput label="Ad sales" value={adSales} onChange={setAdSales} prefix="$" />
      <EconomicsInput label="Ad spend" value={adSpend} onChange={setAdSpend} prefix="$" />
      <button className="secondary economics-save" disabled={saving}><Save />{saving ? "Saving..." : "Save PSM Inputs"}</button>
    </form>
    <p className="imported-cost-note">Imported starting points: <b>{money(sku.adSales)} ad sales</b>, <b>{money(sku.adSpend)} ad spend</b>, and <b>{money(importedCogsPerUnit)} COGS per reported unit</b>. Saving locks the PSM values to this SKU.</p>
    <div className="economics-formulas">
      <EconomicsFormula label="Amazon fees" value={money(economics.amazonFees)} detail={`${referralRate.toFixed(1)}% × sale price`} />
      <EconomicsFormula label="Angora billable" value={money(economics.angoraBillable)} detail={`${angoraRate.toFixed(1)}% × sale price`} />
      <EconomicsFormula label="Breakeven before ads" value={money(economics.breakevenBeforeAds)} detail="Amazon + FBA + storage + inbound + COGS + Angora" />
      <EconomicsFormula label="Ad cost / unit" value={money(economics.adCostPerUnit)} detail={`${money(adSpend)} ÷ ${integer(currentUnits)} units`} />
      <EconomicsFormula label="ACoS" value={pct(economics.acos)} detail="Ad spend ÷ ad sales" />
      <EconomicsFormula label="Total cost / unit" value={money(economics.totalCostPerUnit)} detail="Breakeven + advertising" />
      <EconomicsFormula label="Net proceeds / unit" value={money(economics.netProceedsPerUnit)} detail="Sale price − total cost" negative={economics.netProceedsPerUnit < 0} />
      <EconomicsFormula label="Net profit margin" value={pct(economics.netProfitMargin)} detail="Net proceeds ÷ sale price" negative={economics.netProfitMargin < 0} />
      <EconomicsFormula label="At current units" value={money(economics.netProceedsAtCurrentUnits)} detail={`${integer(currentUnits)} units after ads`} negative={economics.netProceedsAtCurrentUnits < 0} />
    </div>
    <p className="scenario-formula">Sheet formula mapping: Amazon Fees = Sale Price × Referral %, Angora Billable = Sale Price × Angora %, Breakeven = Amazon Fees + FBA Fees + Storage + Inbound + COGS + Angora Billable, ACoS = Ad Spend ÷ Ad Sales, and NPM = Net Proceeds ÷ Sale Price.</p>
  </Panel>;
}

function EconomicsInput({ label, value, onChange, prefix, suffix, step = "0.01" }: { label: string; value: number; onChange: (value: number) => void; prefix?: string; suffix?: string; step?: string }) {
  return <label className="economics-input"><span>{label}</span><div>{prefix && <b>{prefix}</b>}<input type="number" min="0" step={step} value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(Math.max(0, Number(event.target.value)))} />{suffix && <b>{suffix}</b>}</div></label>;
}

function EconomicsFormula({ label, value, detail, negative = false }: { label: string; value: string; detail: string; negative?: boolean }) {
  return <div className="economics-formula"><span>{label}</span><strong className={negative ? "bad" : ""}>{value}</strong><small>{detail}</small></div>;
}

function buildJarvisAnswer(question: string, context: { account: Account; period: PeriodPayload; periods: PeriodPayload[]; skus: DashboardSku[]; actions: ActionItem[]; scope: "portfolio" | "account"; metrics: DashboardMetrics; revenueChangePercent?: number }) {
  const { account, period, periods, skus, actions, scope, metrics, revenueChangePercent } = context;
  const q = question.toLowerCase().replace(/^hey[, ]+jarvis[, ]*/, "");
  const label = scope === "portfolio" ? "the portfolio" : account.name;
  const delta = period.wow.netSales;
  const priorRevenue = delta === undefined ? undefined : period.metrics.netSales - delta;
  const changePercent = revenueChangePercent ?? (priorRevenue ? delta! / Math.abs(priorRevenue) * 100 : undefined);
  const openActions = actions.filter((item) => item.status !== "completed");
  const weakest = [...skus].sort((a, b) => a.profit - b.profit)[0];
  const highestRevenue = [...skus].sort((a, b) => b.netSales - a.netSales)[0];
  const namedSku = skus.find((sku) => q.includes(sku.name.toLowerCase()) || (sku.sku && q.includes(sku.sku.toLowerCase())) || (sku.asin && q.includes(sku.asin.toLowerCase())));
  const previous = periods.filter((item) => item.accountId === period.accountId && item.kind === "weekly" && item.endDate < period.startDate).sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
  const comparisonBase = scope === "portfolio" && changePercent !== undefined ? metrics.netSales / (1 + changePercent / 100) : priorRevenue;
  const movement = changePercent === undefined ? "This is the first saved comparison week." : `Net revenue was ${changePercent >= 0 ? "up" : "down"} ${Math.abs(changePercent).toFixed(1)}% from ${money(comparisonBase || 0)}.`;

  if (namedSku) {
    const skuAcos = namedSku.adSales ? namedSku.adSpend / namedSku.adSales * 100 : namedSku.adSpend ? 999 : 0;
    const manual = namedSku.manualFbaFeePerUnit !== undefined || namedSku.manualCogsPerUnit !== undefined ? ` Manual inputs currently show ${money(namedSku.manualFbaFeePerUnit || 0)} FBA and ${money(namedSku.manualCogsPerUnit || 0)} COGS per unit.` : " Manual FBA and COGS have not both been confirmed yet.";
    return `${namedSku.name} generated ${money(namedSku.netSales)} in net revenue from ${integer(namedSku.units)} units, with ${money(namedSku.profit)} in reported net proceeds. Advertising spent ${money(namedSku.adSpend)} at ${pct(skuAcos)} ACoS. ${namedSku.issue} ${namedSku.recommendation}${manual}`;
  }
  if (/ad|advert|ppc|acos|campaign/.test(q)) return `${label} spent ${money(metrics.adSpend)} on advertising and attributed ${money(metrics.adSales)} in ad sales at ${pct(metrics.acos)} ACoS. That produced ${integer(metrics.adOrders)} attributed orders from ${integer(metrics.clicks)} clicks. ${period.insights.find((item) => /advert/i.test(item.title))?.detail || placementNote(period)}`;
  if (/organic/.test(q)) {
    if (!metrics.netSales) return `There is no net revenue in the selected week, so I cannot calculate an organic share.`;
    if (metrics.adSales > metrics.netSales) return `Amazon attributed ${money(metrics.adSales)} in ad sales against ${money(metrics.netSales)} in net revenue. Because attribution windows can cross reporting periods, ad-attributed sales exceed the weekly total here, so an exact organic share would be misleading.`;
    const organic = Math.max(0, 100 - metrics.adSales / metrics.netSales * 100);
    return `The directional organic share is approximately ${organic.toFixed(1)}%, based on ${money(metrics.netSales)} in net revenue less ${money(metrics.adSales)} in attributed ad sales. Treat this as directional because Amazon attribution timing can cross weeks.`;
  }
  if (/inventory|stock|restock|supply/.test(q)) {
    const tight = [...skus].filter((sku) => sku.inventory > 0).sort((a, b) => a.fulfillable - b.fulfillable)[0];
    return `${label} has ${integer(metrics.inventory)} total FBA units, with ${integer(metrics.fulfillable)} currently fulfillable.${tight ? ` ${tight.name} has the tightest immediately fulfillable position at ${integer(tight.fulfillable)} units out of ${integer(tight.inventory)} total.` : ""}`;
  }
  if (/action|to do|todo|recommend/.test(q)) return openActions.length ? `There are ${openActions.length} open actions for ${account.name}. The highest-priority items are ${openActions.slice(0, 3).map((item) => item.title).join("; ")}. Marking them complete will add them to this week's business review.` : `There are no open checklist items for ${account.name}.`;
  if (/review|rating|stars/.test(q)) {
    const tracked = skus.filter((sku) => sku.reviewRating !== undefined);
    return tracked.length ? `${tracked.length} SKUs have listing reputation tracking. ${tracked.slice(0, 3).map((sku) => `${sku.name} is ${sku.reviewRating?.toFixed(1)} stars across ${integer(sku.reviewCount || 0)} ratings`).join("; ")}.` : `No SKUs have a saved Amazon rating yet. Add each listing link in its Listing Reputation card to begin tracking.`;
  }
  if (/sku|product|attention|problem|risk|worst|weak/.test(q)) return weakest ? `${weakest.name} needs the most attention based on reported net proceeds of ${money(weakest.profit)}. ${weakest.issue} My recommended next move is: ${weakest.recommendation}` : `There is not enough SKU-level data in the selected period to rank products yet.`;
  if (/best|winner|top/.test(q)) return highestRevenue ? `${highestRevenue.name} led SKU net revenue at ${money(highestRevenue.netSales)} from ${integer(highestRevenue.units)} units. Its reported net proceeds were ${money(highestRevenue.profit)}.` : `There is not enough SKU-level data to identify a leader yet.`;
  if (/change|compare|week over week|last week|previous/.test(q) && previous) return `${movement} Net proceeds moved from ${money(previous.metrics.netProceeds)} to ${money(period.metrics.netProceeds)}, while ACoS moved from ${pct(previous.metrics.acos)} to ${pct(period.metrics.acos)}. ${period.insights[0]?.detail || "No additional driver was confirmed."}`;
  return `For ${period.label}, ${label} generated ${money(metrics.netSales)} in net revenue and ${money(metrics.netProceeds)} in net proceeds. ${movement} Advertising ran at ${pct(metrics.acos)} ACoS, and ${integer(metrics.sessions)} sessions produced ${integer(metrics.units)} units.${weakest ? ` The clearest risk is ${weakest.name}: ${weakest.issue}` : ""}`;
}

function Kpi({ label, value, note, icon }: { label: string; value: string; note: string; icon: React.ReactNode }) { return <article className="kpi"><div>{label}<span>{icon}</span></div><strong>{value}</strong><small>{note}</small></article>; }
function RevenueDelta({ value, light = false }: { value?: number; light?: boolean }) { if (value === undefined || !Number.isFinite(value)) return <span className={`revenue-delta neutral ${light ? "light" : ""}`}>First week</span>; const up = value >= 0; return <span className={`revenue-delta ${up ? "up" : "down"} ${light ? "light" : ""}`}>{up ? <ArrowUpRight /> : <ArrowDownRight />}{Math.abs(value).toFixed(1)}%</span>; }
function Title({ eyebrow, title, sub, right }: { eyebrow: string; title: string; sub: string; right?: React.ReactNode }) { return <div className="title"><div><small><Sparkles />{eyebrow}</small><h1>{title}</h1><p>{sub}</p></div>{right}</div>; }
function Panel({ title, sub, right, children, className = "" }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) { return <article className={`panel ${className}`}><div className="panel-head"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>{right}</div>{children}</article>; }
function ReviewSection({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) { return <section className="review-section"><header><h2>{title}</h2>{sub && <p>{sub}</p>}</header>{children}</section>; }
function Insight({ n, title, children }: { n: string; title: string; children: React.ReactNode }) { return <div className="insight"><span>{n}</span><div><b>{title}</b><p>{children}</p></div></div>; }
function Table({ children }: { children: React.ReactNode }) { return <div className="table-wrap"><table>{children}</table></div>; }
function ReportCard({ report, present, period }: { report: string; present: boolean; period: PeriodPayload }) { return <article className={!present ? "missing" : ""}><span>{present ? <Check /> : <AlertTriangle />}</span><div><b>{report}</b><small>{present ? `Parsed for ${period.label}` : "Not received for this view"}</small></div></article>; }

function WeeklySalesChart({ data, compact = false }: { data: WeeklySalesPoint[]; compact?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return <div className={`chart-empty ${compact ? "compact" : ""}`}><BarChart3 /><b>No weekly sales history yet</b><span>Weekly SKU Economics imports will populate this chart.</span></div>;
  const width = 640, height = compact ? 155 : 230, left = 34, right = 610, top = 24, bottom = compact ? 124 : 190;
  const max = Math.max(1, ...data.map((item) => item.sales));
  const x = (index: number) => data.length === 1 ? (left + right) / 2 : left + index * (right - left) / (data.length - 1);
  const y = (value: number) => bottom - value / max * (bottom - top);
  const points = data.map((item, index) => `${x(index)},${y(item.sales)}`).join(" ");
  const active = hover === null ? null : data[hover];
  return <div className={`sales-chart ${compact ? "compact" : ""}`} onMouseLeave={() => setHover(null)}><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Weekly total net revenue line chart"><defs><linearGradient id={`sales-fill-${compact ? "compact" : "full"}`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ff8500" stopOpacity=".32" /><stop offset="1" stopColor="#ff8500" stopOpacity="0" /></linearGradient></defs>{[0, 1, 2, 3].map((index) => { const lineY = top + index * (bottom - top) / 3; return <line key={index} x1={left} x2={right} y1={lineY} y2={lineY} stroke="#17354a" />; })}{data.length > 1 && <polygon points={`${points} ${right},${bottom} ${left},${bottom}`} fill={`url(#sales-fill-${compact ? "compact" : "full"})`} />}{data.length > 1 && <polyline points={points} fill="none" stroke="#ff8500" strokeWidth="3" />}{data.map((item, index) => <circle key={`${item.startDate}-${item.endDate}`} cx={x(index)} cy={y(item.sales)} r={hover === index ? 6 : 4} fill="#ff9a2b" stroke="#071625" strokeWidth="3" tabIndex={0} onMouseEnter={() => setHover(index)} onFocus={() => setHover(index)} onBlur={() => setHover(null)}><title>{`${item.label}: ${money(item.sales)}`}</title></circle>)}</svg>{active && <div className="chart-tooltip" style={{ left: `${(x(hover || 0) / width) * 100}%`, top: `${(y(active.sales) / height) * 100}%` }}><small>{active.label}</small><b>{money(active.sales)}</b><span>Net revenue</span></div>}{!compact && <div className="chart-dates" style={{ gridTemplateColumns: `repeat(${data.length},1fr)` }}>{data.map((item) => <span key={`${item.startDate}-${item.endDate}`}>{formatWeekRange(item.startDate, item.endDate)}</span>)}</div>}</div>;
}

function aggregateMetrics(periods: PeriodPayload[]): DashboardMetrics {
  const total = periods.reduce((result, period) => { for (const key of Object.keys(result) as Array<keyof DashboardMetrics>) result[key] += period.metrics[key] || 0; return result; }, { grossSales: 0, netSales: 0, netProceeds: 0, storage: 0, adSpend: 0, adSales: 0, clicks: 0, adOrders: 0, sessions: 0, units: 0, refunds: 0, inventory: 0, fulfillable: 0, acos: 0, tacos: 0, conversion: 0 });
  total.acos = total.adSales ? total.adSpend / total.adSales * 100 : total.adSpend ? 999 : 0;
  total.tacos = total.grossSales ? total.adSpend / total.grossSales * 100 : total.adSpend ? 999 : 0;
  total.conversion = total.sessions ? total.units / total.sessions * 100 : 0;
  return total;
}
function mergeSkuData(periodSkus: DashboardSku[], savedSkus: DashboardSku[]) {
  const merged = new Map(periodSkus.map((sku) => [sku.id, sku]));
  for (const saved of savedSkus) {
    const period = merged.get(saved.id);
    if (!period) { merged.set(saved.id, saved); continue; }
    merged.set(saved.id, {
      ...saved,
      ...period,
      listingUrl: saved.listingUrl ?? period.listingUrl,
      reviewRating: saved.reviewRating ?? period.reviewRating,
      reviewCount: saved.reviewCount ?? period.reviewCount,
      reviewBreakdown: saved.reviewBreakdown ?? period.reviewBreakdown,
      reviewSource: saved.reviewSource ?? period.reviewSource,
      reviewUpdatedAt: saved.reviewUpdatedAt ?? period.reviewUpdatedAt,
      reviewHistory: saved.reviewHistory ?? period.reviewHistory,
      manualSalePrice: saved.manualSalePrice ?? period.manualSalePrice,
      manualReferralRate: saved.manualReferralRate ?? period.manualReferralRate,
      manualFbaFeePerUnit: saved.manualFbaFeePerUnit ?? period.manualFbaFeePerUnit,
      manualStorageCostPerUnit: saved.manualStorageCostPerUnit ?? period.manualStorageCostPerUnit,
      manualInboundCostPerUnit: saved.manualInboundCostPerUnit ?? period.manualInboundCostPerUnit,
      manualCogsPerUnit: saved.manualCogsPerUnit ?? period.manualCogsPerUnit,
      manualAngoraRate: saved.manualAngoraRate ?? period.manualAngoraRate,
      manualAdSales: saved.manualAdSales ?? period.manualAdSales,
      manualAdSpend: saved.manualAdSpend ?? period.manualAdSpend,
    });
  }
  return [...merged.values()];
}
function accountSalesTrend(periods: PeriodPayload[], accountId: string, throughEndDate: string, limit = 12): WeeklySalesPoint[] { return periods.filter((period) => period.kind === "weekly" && period.accountId === accountId && period.endDate <= throughEndDate).sort((a, b) => a.endDate.localeCompare(b.endDate)).slice(-limit).map((period) => ({ startDate: period.startDate, endDate: period.endDate, label: period.label, sales: period.metrics.netSales })); }
function portfolioSalesTrend(periods: PeriodPayload[], throughEndDate: string, limit = 12): WeeklySalesPoint[] { const map = new Map<string, WeeklySalesPoint>(); for (const period of periods.filter((item) => item.kind === "weekly" && item.endDate <= throughEndDate)) { const key = `${period.startDate}:${period.endDate}`; const row = map.get(key) || { startDate: period.startDate, endDate: period.endDate, label: period.label, sales: 0 }; row.sales += period.metrics.netSales; map.set(key, row); } return [...map.values()].sort((a, b) => a.endDate.localeCompare(b.endDate)).slice(-limit); }
function wowNote(period: PeriodPayload, metric: keyof DashboardMetrics, suffix = "") { const value = period.wow[metric]; if (value === undefined) return "First saved comparison period"; const direction = value > 0 ? "+" : ""; return `${direction}${suffix === "points" ? value.toFixed(1) : metric.toLowerCase().includes("sales") || metric === "netProceeds" ? money(value) : integer(value)}${suffix ? ` ${suffix}` : ""} vs prior week`; }
function placementNote(period: PeriodPayload) { const best = period.placements.filter((item) => item.sales > 0).sort((a, b) => a.acos - b.acos)[0]; return best ? `${best.placement} performed best` : "No converting placement yet"; }
function formatDate(value: string) { const parsed = new Date(value); return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }); }
function formatShortDate(value: string) { const parsed = new Date(`${value}T12:00:00Z`); return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }); }
function formatWeekRange(startDate: string, endDate: string) { return `${formatShortDate(startDate)}–${formatShortDate(endDate)}`; }
function openActionCount(period: PeriodPayload, actions: ActionItem[]) { const completedRecs = new Set(actions.filter((action) => action.status === "completed").map((action) => action.id)); return period.recommendations.filter((_, index) => !completedRecs.has(`rec-${period.id}-${index}`)).length + actions.filter((action) => !action.id.startsWith(`rec-${period.id}-`) && action.status !== "completed").length; }
function executiveSummary(period: PeriodPayload) { const change = period.wow.netSales; const movement = change === undefined ? "This is the first saved comparison period." : `Net revenue ${change >= 0 ? "increased" : "declined"} ${money(Math.abs(change))} week over week.`; const profit = period.metrics.netProceeds >= 0 ? `The account produced ${money(period.metrics.netProceeds)} in net proceeds.` : `The account reported a ${money(Math.abs(period.metrics.netProceeds))} loss after Amazon costs and advertising.`; return `${movement} ${profit} ${integer(period.metrics.sessions)} sessions produced ${integer(period.metrics.units)} units, while advertising ran at ${pct(period.metrics.acos)} ACoS.`; }
function netRevenueChange(period: PeriodPayload) { const delta = period.wow.netSales; if (delta === undefined) return undefined; const previous = period.metrics.netSales - delta; return previous ? delta / Math.abs(previous) * 100 : period.metrics.netSales ? 100 : 0; }
function portfolioNetRevenueChange(current: PeriodPayload[], all: PeriodPayload[]) { const previous = current.map((period) => all.filter((candidate) => candidate.accountId === period.accountId && candidate.kind === "weekly" && candidate.endDate < period.startDate).sort((a, b) => b.endDate.localeCompare(a.endDate))[0]).filter((period): period is PeriodPayload => Boolean(period)); if (!previous.length) return undefined; const currentRevenue = current.reduce((total, period) => total + period.metrics.netSales, 0); const previousRevenue = previous.reduce((total, period) => total + period.metrics.netSales, 0); return previousRevenue ? (currentRevenue - previousRevenue) / Math.abs(previousRevenue) * 100 : currentRevenue ? 100 : 0; }
function actionWins(period: PeriodPayload, periods: PeriodPayload[], actions: ActionItem[]) { const previous = periods.filter((item) => item.accountId === period.accountId && item.kind === "weekly" && item.endDate < period.startDate).sort((a, b) => b.endDate.localeCompare(a.endDate))[0]; if (!previous) return []; const priorActions = actions.filter((action) => action.status === "completed" && action.completedPeriodId === previous.id); return priorActions.flatMap((action) => { const currentSku = period.skus.find((sku) => sku.id === action.skuId); const priorSku = previous.skus.find((sku) => sku.id === action.skuId); if (currentSku && priorSku && currentSku.netSales > priorSku.netSales) return [`“${action.title}” was followed by net revenue increasing from ${money(priorSku.netSales)} to ${money(currentSku.netSales)} for ${currentSku.name}.`]; const currentAcos = currentSku?.adSales ? currentSku.adSpend / currentSku.adSales * 100 : 999; const priorAcos = priorSku?.adSales ? priorSku.adSpend / priorSku.adSales * 100 : 999; if (currentSku && priorSku && currentAcos < priorAcos && currentAcos < 999) return [`“${action.title}” was followed by ${currentSku.name} ACoS improving from ${pct(priorAcos)} to ${pct(currentAcos)}.`]; return []; }); }
