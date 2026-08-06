import type { DashboardSku, PeriodPayload } from "../analyze-reports";
import type { JarvisPrincipal } from "../jarvis-auth";
import { canAccessAccount } from "../jarvis-auth";
import type { PersistentDatabase } from "../persistent-database";
import { loadPsmState } from "../psm-service";
import type { StorageStatus } from "../psm-types";
import type { ReportSummary } from "../report-parser";
import { auditBrandDefense } from "./amazon/brand-defense";
import { auditListingDiagnostics } from "./amazon/listing-diagnostics";
import { auditPpcGrowthOperator } from "./amazon/ppc-growth-operator";
import { rankPortfolioAttention, scoreAccountAttention, type FinancialAttentionResult } from "./amazon/account-triage";
import { auditSkuPerformance } from "./amazon/sku-performance";
import type { AccountStateBlock, AccountFactSource, AccountStateBlockManualUpdate } from "./shared/account-state-block";
import type { AuditAccountInput, AuditReportSource } from "./shared/audit-input";
import type { AuditFinding } from "./shared/audit-finding";
import type { AuditRecommendation } from "./shared/audit-recommendation";
import type { AuditRun } from "./shared/audit-run";
import type { DataReadiness } from "./shared/data-readiness";
import { auditRuleVersion } from "./shared/audit-versioning";

const parsePayload = <T>(value: unknown): T | null => {
  try { return JSON.parse(String(value)) as T; }
  catch { return null; }
};

function storageStatus(db: PersistentDatabase): StorageStatus {
  return { mode: db.kind, writable: true, label: db.kind === "postgres" ? "Central Postgres" : "Central D1", detail: "Audit input loaded from central storage." };
}

export async function loadAuditInputs(db: PersistentDatabase, principal: JarvisPrincipal): Promise<AuditAccountInput[]> {
  const [accountRows, skuRows, periodRows, reportRows, stateRows, psm] = await Promise.all([
    db.all<{ id: string; name: string; status: string }>("SELECT id, name, status FROM accounts ORDER BY created_at"),
    db.all("SELECT payload FROM skus ORDER BY created_at"),
    db.all("SELECT payload FROM periods ORDER BY end_date DESC"),
    db.all<{ importId: string; accountId: string; periodId: string; payload: unknown }>('SELECT import_id AS "importId", account_id AS "accountId", period_id AS "periodId", payload FROM report_summaries ORDER BY created_at DESC'),
    db.all<{ accountId: string; revision: number; payload: unknown }>('SELECT account_id AS "accountId", revision, payload FROM account_state_blocks ORDER BY account_id, revision DESC'),
    loadPsmState(db, storageStatus(db)),
  ]);
  const skus = skuRows.map((row) => parsePayload<DashboardSku>(row.payload)).filter((row): row is DashboardSku => Boolean(row));
  const periods = periodRows.map((row) => parsePayload<PeriodPayload>(row.payload)).filter((row): row is PeriodPayload => Boolean(row));
  const reports = reportRows.map((row) => {
    const summary = parsePayload<ReportSummary>(row.payload);
    return summary ? { rawImportId: row.importId, periodId: row.periodId, accountId: row.accountId, summary } : null;
  }).filter((row): row is AuditReportSource & { accountId: string } => Boolean(row));
  const latestBlocks = new Map<string, AccountStateBlock>();
  for (const row of stateRows) if (!latestBlocks.has(row.accountId)) {
    const parsed = parsePayload<AccountStateBlock>(row.payload);
    if (parsed) latestBlocks.set(row.accountId, parsed);
  }
  return accountRows.filter((account) => canAccessAccount(principal, account.id)).map((account) => ({ account, skus: skus.filter((sku) => sku.accountId === account.id), periods: periods.filter((period) => period.accountId === account.id), psm, reports: reports.filter((report) => report.accountId === account.id), stateBlock: latestBlocks.get(account.id) }));
}

function combinedReadiness(items: DataReadiness[]): DataReadiness {
  if (!items.length) return { completeness: 0, status: "blocked", issues: [] };
  const completeness = Number((items.reduce((sum, item) => sum + item.completeness, 0) / items.length).toFixed(2));
  const issues = [...new Map(items.flatMap((item) => item.issues).map((issue) => [issue.code, issue])).values()];
  return { completeness, status: issues.some((issue) => issue.severity === "blocking") ? "blocked" : issues.length ? "partial" : "ready", issues };
}

export async function persistAuditRun(db: PersistentDatabase, run: AuditRun) {
  const statements: Array<{ sql: string; params: unknown[] }> = [{ sql: "INSERT INTO audit_runs (id, account_id, audit_type, audit_version, playbook_version, started_at, completed_at, created_by, status, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", params: [run.id, run.accountId || null, run.auditType, run.versions.engine, run.versions.playbook, run.startedAt, run.completedAt, run.createdBy, run.status, JSON.stringify(run)] }];
  for (const finding of run.findings) {
    statements.push({ sql: "INSERT INTO audit_findings (id, audit_run_id, account_id, sku_id, severity, category, payload) VALUES (?, ?, ?, ?, ?, ?, ?)", params: [finding.id, run.id, finding.accountId, finding.skuId || null, finding.severity, finding.category, JSON.stringify(finding)] });
    for (const evidence of finding.evidence) statements.push({ sql: "INSERT INTO audit_evidence (id, finding_id, raw_import_id, source_report, source_row, payload) VALUES (?, ?, ?, ?, ?, ?)", params: [evidence.id, finding.id, evidence.rawImportId || null, evidence.sourceReport, evidence.sourceRowReference || null, JSON.stringify(evidence)] });
    if (finding.recommendation) {
      const recommendation = finding.recommendation;
      statements.push({ sql: "INSERT INTO audit_recommendations (id, finding_id, account_id, sku_id, status, required_role, execution_capability, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", params: [recommendation.id, recommendation.findingId, recommendation.accountId, recommendation.skuId || null, recommendation.status, recommendation.requiredRole, recommendation.executionCapability, JSON.stringify(recommendation), run.completedAt, run.completedAt] });
    }
  }
  for (let index = 0; index < statements.length; index += 100) await db.batch(statements.slice(index, index + 100));
}

function factSources(input: AuditAccountInput, now: string): AccountFactSource[] {
  const sources: AccountFactSource[] = [{ field: "accountName", sourceType: "account", sourceId: input.account.id, observedAt: now }];
  for (const sku of input.skus) sources.push({ field: `sku:${sku.id}`, sourceType: "sku", sourceId: sku.id, observedAt: now });
  const workflow = input.psm.workflows.find((item) => item.accountId === input.account.id);
  if (workflow) sources.push({ field: "workflow", sourceType: "workflow", sourceId: workflow.accountId, observedAt: workflow.updatedAt });
  for (const report of input.reports) sources.push({ field: `report:${report.summary.type}`, sourceType: "report", sourceId: report.rawImportId, observedAt: now });
  return sources;
}

export async function createAccountStateBlockRevision(db: PersistentDatabase, input: AuditAccountInput, principal: JarvisPrincipal, auditRun: AuditRun) {
  const previousRow = await db.first<{ revision: number; payload: unknown }>("SELECT revision, payload FROM account_state_blocks WHERE account_id = ? ORDER BY revision DESC LIMIT 1", [input.account.id]);
  const previous = previousRow ? parsePayload<AccountStateBlock>(previousRow.payload) : null;
  const revision = Number(previousRow?.revision || 0) + 1;
  const now = new Date().toISOString();
  const workflow = input.psm.workflows.find((item) => item.accountId === input.account.id);
  const recommendations = auditRun.findings.flatMap((finding) => finding.recommendation ? [finding.recommendation] : []);
  const block: AccountStateBlock = {
    id: `${input.account.id}:state:${revision}:${crypto.randomUUID()}`,
    accountId: input.account.id,
    accountName: input.account.name,
    version: revision,
    assignedPsm: workflow?.psmOwner || previous?.assignedPsm,
    lifecyclePhase: workflow?.stage || previous?.lifecyclePhase,
    primarySkus: input.skus.map((sku) => ({ id: sku.id, sku: sku.sku, asin: sku.asin || undefined })),
    assumptions: previous?.assumptions || { cogs: Object.fromEntries(input.skus.filter((sku) => sku.manualCogsPerUnit !== undefined).map((sku) => [sku.id, sku.manualCogsPerUnit!])) },
    inventoryStatus: input.skus.map((sku) => ({ skuId: sku.id, onHand: sku.inventory, stockoutRisk: sku.units > 0 && sku.inventory / sku.units < 2, overstockRisk: sku.inventory > 0 && (sku.units === 0 || sku.inventory / sku.units > 12) })),
    pricingChanges: previous?.pricingChanges || [],
    promotionChanges: previous?.promotionChanges || [],
    listingChanges: previous?.listingChanges || [],
    reviewIssues: input.skus.filter((sku) => sku.reviewRating !== undefined && sku.reviewRating < 4).map((sku) => `${sku.sku}: rating ${sku.reviewRating}`),
    campaignChanges: previous?.campaignChanges || [],
    brandTerms: previous?.brandTerms || [],
    harvestedKeywords: previous?.harvestedKeywords || [],
    negatives: previous?.negatives || [],
    openBlockerIds: input.psm.blockers.filter((item) => item.accountId === input.account.id && !["Resolved", "Canceled"].includes(item.status)).map((item) => item.id),
    openTaskIds: input.psm.tasks.filter((item) => item.accountId === input.account.id && !["Completed", "Canceled"].includes(item.status)).map((item) => item.id),
    partnerRequestIds: input.psm.partnerRequests.filter((item) => item.accountId === input.account.id && !["Received", "Canceled"].includes(item.status)).map((item) => item.id),
    previousAuditSummary: `${auditRun.findings.length} finding${auditRun.findings.length === 1 ? "" : "s"}; ${auditRun.status}; completeness ${Math.round(auditRun.dataReadiness.completeness * 100)}%.`,
    previousApprovedActionIds: previous?.previousApprovedActionIds || [],
    unresolvedRecommendationIds: recommendations.map((item) => item.id),
    doNotRepeatRecommendationIds: previous?.doNotRepeatRecommendationIds || [],
    sources: factSources(input, now),
    createdAt: now,
    createdBy: principal.userId,
  };
  await db.run("INSERT INTO account_state_blocks (id, account_id, revision, created_by, created_at, payload) VALUES (?, ?, ?, ?, ?, ?)", [block.id, block.accountId, block.version, block.createdBy, block.createdAt, JSON.stringify(block)]);
  return block;
}

export async function runPortfolioTriage(db: PersistentDatabase, principal: JarvisPrincipal) {
  const startedAt = new Date().toISOString();
  const id = `audit-portfolio-${crypto.randomUUID()}`;
  const inputs = await loadAuditInputs(db, principal);
  const rankings = rankPortfolioAttention(inputs, id);
  const readiness = combinedReadiness(rankings.map((ranking) => ranking.dataReadiness));
  const completedAt = new Date().toISOString();
  const run: AuditRun = { id, auditType: "portfolio-triage", versions: auditRuleVersion("portfolioTriage"), startedAt, completedAt, createdBy: principal.userId, dataWindowStart: inputs.flatMap((input) => input.periods.map((period) => period.startDate)).sort()[0], dataWindowEnd: inputs.flatMap((input) => input.periods.map((period) => period.endDate)).sort().at(-1), status: readiness.status === "ready" ? "completed" : "partial", dataReadiness: readiness, sourceReports: [...new Set(inputs.flatMap((input) => input.reports.map((report) => report.summary.type)))], findings: rankings.flatMap((ranking) => ranking.findings), metadata: { rankings } };
  await persistAuditRun(db, run);
  for (const input of inputs) await createAccountStateBlockRevision(db, input, principal, { ...run, accountId: input.account.id, findings: run.findings.filter((finding) => finding.accountId === input.account.id) });
  return { run, rankings };
}

export async function runDeepAccountAudit(db: PersistentDatabase, principal: JarvisPrincipal, accountId: string) {
  const startedAt = new Date().toISOString();
  const id = `audit-account-${crypto.randomUUID()}`;
  const input = (await loadAuditInputs(db, principal)).find((item) => item.account.id === accountId);
  if (!input) throw new Error("The account is unavailable or not assigned to this user.");
  const triage = scoreAccountAttention(input, id);
  const sku = auditSkuPerformance(input, id);
  const ppc = auditPpcGrowthOperator(input, id);
  const brand = auditBrandDefense(input);
  const findings: AuditFinding[] = [...triage.findings, ...sku.findings, ...ppc.findings, ...auditListingDiagnostics(input, id)];
  const readiness = combinedReadiness([triage.dataReadiness, sku.readiness, ppc.readiness, brand.readiness]);
  const periods = input.periods.filter((period) => period.kind === "weekly").sort((left, right) => right.endDate.localeCompare(left.endDate));
  const completedAt = new Date().toISOString();
  const run: AuditRun = { id, accountId, auditType: "account-deep", versions: auditRuleVersion("skuPerformance"), startedAt, completedAt, createdBy: principal.userId, dataWindowStart: periods.at(-1)?.startDate, dataWindowEnd: periods[0]?.endDate, status: readiness.status === "ready" ? "completed" : "partial", dataReadiness: readiness, sourceReports: [...new Set(input.reports.map((report) => report.summary.type))], sourceAccountStateBlockVersion: input.stateBlock?.version, findings };
  await persistAuditRun(db, run);
  const stateBlock = await createAccountStateBlockRevision(db, input, principal, run);
  return { run, stateBlock, ppcDoctrine: ppc.doctrine, brandDefenseReadiness: brand.readiness };
}

export async function latestAuditHistory(db: PersistentDatabase, principal: JarvisPrincipal, accountId?: string) {
  const rows = await db.all<{ accountId: string | null; payload: unknown }>("SELECT account_id AS \"accountId\", payload FROM audit_runs ORDER BY completed_at DESC LIMIT 50");
  return rows.filter((row) => !row.accountId || canAccessAccount(principal, row.accountId)).map((row) => parsePayload<AuditRun>(row.payload)).filter((run): run is AuditRun => Boolean(run)).filter((run) => !accountId || run.accountId === accountId);
}

export async function latestPortfolioRankings(db: PersistentDatabase, principal: JarvisPrincipal): Promise<{ run: AuditRun; rankings: FinancialAttentionResult[] } | null> {
  const history = await latestAuditHistory(db, principal);
  const run = history.find((item) => item.auditType === "portfolio-triage");
  if (!run) return null;
  return { run, rankings: Array.isArray(run.metadata?.rankings) ? run.metadata.rankings as FinancialAttentionResult[] : [] };
}

export async function accountStateBlockHistory(db: PersistentDatabase, principal: JarvisPrincipal, accountId: string) {
  if (!canAccessAccount(principal, accountId)) throw new Error("This user is not assigned to the requested account.");
  const rows = await db.all<{ payload: unknown }>("SELECT payload FROM account_state_blocks WHERE account_id = ? ORDER BY revision DESC LIMIT 100", [accountId]);
  return rows.map((row) => parsePayload<AccountStateBlock>(row.payload)).filter((block): block is AccountStateBlock => Boolean(block));
}

export async function createManualAccountStateBlockRevision(db: PersistentDatabase, principal: JarvisPrincipal, accountId: string, update: AccountStateBlockManualUpdate) {
  const input = (await loadAuditInputs(db, principal)).find((item) => item.account.id === accountId);
  if (!input) throw new Error("The account is unavailable or not assigned to this user.");
  const previous = input.stateBlock;
  const revision = (previous?.version || 0) + 1;
  const now = new Date().toISOString();
  const workflow = input.psm.workflows.find((item) => item.accountId === accountId);
  const manualFields = Object.keys(update);
  const previousSources = previous?.sources.filter((source) => !manualFields.includes(source.field)) || [];
  const block: AccountStateBlock = {
    id: `${accountId}:state:${revision}:${crypto.randomUUID()}`,
    accountId,
    accountName: input.account.name,
    version: revision,
    assignedPsm: update.assignedPsm ?? previous?.assignedPsm ?? workflow?.psmOwner,
    lifecyclePhase: update.lifecyclePhase ?? previous?.lifecyclePhase ?? workflow?.stage,
    primarySkus: previous?.primarySkus || input.skus.map((sku) => ({ id: sku.id, sku: sku.sku, asin: sku.asin || undefined })),
    assumptions: { ...(previous?.assumptions || {}), ...(update.assumptions || {}) },
    inventoryStatus: previous?.inventoryStatus || input.skus.map((sku) => ({ skuId: sku.id, onHand: sku.inventory })),
    pricingChanges: update.pricingChanges ?? previous?.pricingChanges ?? [],
    promotionChanges: update.promotionChanges ?? previous?.promotionChanges ?? [],
    listingChanges: update.listingChanges ?? previous?.listingChanges ?? [],
    reviewIssues: update.reviewIssues ?? previous?.reviewIssues ?? [],
    campaignChanges: update.campaignChanges ?? previous?.campaignChanges ?? [],
    brandTerms: update.brandTerms ?? previous?.brandTerms ?? [],
    harvestedKeywords: update.harvestedKeywords ?? previous?.harvestedKeywords ?? [],
    negatives: update.negatives ?? previous?.negatives ?? [],
    openBlockerIds: previous?.openBlockerIds || input.psm.blockers.filter((item) => item.accountId === accountId && !["Resolved", "Canceled"].includes(item.status)).map((item) => item.id),
    openTaskIds: previous?.openTaskIds || input.psm.tasks.filter((item) => item.accountId === accountId && !["Completed", "Canceled"].includes(item.status)).map((item) => item.id),
    partnerRequestIds: previous?.partnerRequestIds || input.psm.partnerRequests.filter((item) => item.accountId === accountId && !["Received", "Canceled"].includes(item.status)).map((item) => item.id),
    previousAuditSummary: previous?.previousAuditSummary,
    previousApprovedActionIds: previous?.previousApprovedActionIds || [],
    unresolvedRecommendationIds: previous?.unresolvedRecommendationIds || [],
    doNotRepeatRecommendationIds: update.doNotRepeatRecommendationIds ?? previous?.doNotRepeatRecommendationIds ?? [],
    sources: [
      ...previousSources,
      ...factSources(input, now).filter((source) => !previousSources.some((previousSource) => previousSource.field === source.field)),
      ...manualFields.map((field) => ({ field, sourceType: "manual" as const, sourceId: `user:${principal.userId}`, observedAt: now })),
    ],
    createdAt: now,
    createdBy: principal.userId,
  };
  await db.run("INSERT INTO account_state_blocks (id, account_id, revision, created_by, created_at, payload) VALUES (?, ?, ?, ?, ?, ?)", [block.id, accountId, revision, principal.userId, now, JSON.stringify(block)]);
  const saved = await db.first<{ payload: unknown }>("SELECT payload FROM account_state_blocks WHERE id = ?", [block.id]);
  const confirmed = saved ? parsePayload<AccountStateBlock>(saved.payload) : null;
  if (!confirmed || confirmed.id !== block.id || confirmed.version !== block.version) throw new Error("The Account State Block revision could not be confirmed after saving.");
  return confirmed;
}

export async function recordRecommendationStateBlockRevision(db: PersistentDatabase, principal: JarvisPrincipal, recommendation: AuditRecommendation, eventType: "proposed" | "edited" | "approved" | "rejected" | "executed" | "failed" | "canceled") {
  const row = await db.first<{ revision: number; payload: unknown }>("SELECT revision, payload FROM account_state_blocks WHERE account_id = ? ORDER BY revision DESC LIMIT 1", [recommendation.accountId]);
  const previous = row ? parsePayload<AccountStateBlock>(row.payload) : null;
  if (!previous) return null;
  const revision = Number(row?.revision || previous.version) + 1;
  const now = new Date().toISOString();
  const isApproved = eventType === "approved" || eventType === "executed";
  const isResolved = ["rejected", "executed", "failed", "canceled"].includes(eventType);
  const shouldSuppressRepeat = ["rejected", "executed", "canceled"].includes(eventType);
  const block: AccountStateBlock = {
    ...previous,
    id: `${recommendation.accountId}:state:${revision}:${crypto.randomUUID()}`,
    version: revision,
    previousApprovedActionIds: isApproved ? [...new Set([...previous.previousApprovedActionIds, recommendation.id])] : previous.previousApprovedActionIds,
    unresolvedRecommendationIds: isResolved
      ? previous.unresolvedRecommendationIds.filter((id) => id !== recommendation.id)
      : [...new Set([...previous.unresolvedRecommendationIds, recommendation.id])],
    doNotRepeatRecommendationIds: shouldSuppressRepeat ? [...new Set([...previous.doNotRepeatRecommendationIds, recommendation.id])] : previous.doNotRepeatRecommendationIds,
    sources: [...previous.sources, { field: `recommendation:${recommendation.id}:${eventType}`, sourceType: "audit", sourceId: recommendation.id, observedAt: now }],
    createdAt: now,
    createdBy: principal.userId,
  };
  await db.run("INSERT INTO account_state_blocks (id, account_id, revision, created_by, created_at, payload) VALUES (?, ?, ?, ?, ?, ?)", [block.id, block.accountId, block.version, block.createdBy, block.createdAt, JSON.stringify(block)]);
  return block;
}
