import { buildPeriodAnalysis, type KnownSku, type PeriodPayload } from "../../../lib/analyze-reports";
import { identifyReportType, parseAmazonReport, type ReportSummary } from "../../../lib/report-parser";
import { isAuthorizedRequest } from "../../../lib/jarvis-auth";

type StorageEnv = { DB: D1Database; BUCKET: R2Bucket };

async function getRuntime() {
  const runtime = await import("cloudflare:workers");
  return runtime.env as unknown as StorageEnv;
}

async function ensureSchema(db: D1Database) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'healthy', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS skus (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS imports (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, report_type TEXT NOT NULL, filename TEXT NOT NULL, period TEXT NOT NULL, received_at TEXT NOT NULL, status TEXT NOT NULL, object_key TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS report_summaries (id TEXT PRIMARY KEY, import_id TEXT NOT NULL, account_id TEXT NOT NULL, period_id TEXT NOT NULL, report_type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS periods (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'weekly', label TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
  ]);
}

function parsePayload<T>(value: unknown): T | null {
  try { return JSON.parse(String(value)) as T; } catch { return null; }
}

function isoDate(value: FormDataEntryValue | null) {
  const raw = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function fallbackSummary(filename: string, message: string): ReportSummary {
  return { type: identifyReportType(filename), filename, products: [], daily: [], candidates: [], placements: [], funnel: [], warnings: [message] };
}

export async function POST(request: Request) {
  if (!(await isAuthorizedRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const form = await request.formData();
    const accountId = String(form.get("accountId") ?? "");
    const files = form.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
    if (!accountId || !files.length) return Response.json({ error: "Account and files are required" }, { status: 400 });

    const runtime = await getRuntime();
    await ensureSchema(runtime.DB);
    const parsedFiles: Array<{ id: string; file: File; bytes: ArrayBuffer; objectKey: string; summary: ReportSummary }> = [];
    for (const file of files) {
      const id = crypto.randomUUID();
      const bytes = await file.arrayBuffer();
      const objectKey = `${accountId}/${new Date().toISOString().slice(0, 10)}/${id}-${file.name}`;
      let summary: ReportSummary;
      try { summary = parseAmazonReport(bytes, file.name); }
      catch (error) { summary = fallbackSummary(file.name, error instanceof Error ? `Parsing error: ${error.message}` : "The report could not be parsed."); }
      parsedFiles.push({ id, file, bytes, objectKey, summary });
    }

    const detectedStarts = parsedFiles.map((item) => item.summary.dateMin).filter((value): value is string => Boolean(value)).sort();
    const detectedEnds = parsedFiles.map((item) => item.summary.dateMax).filter((value): value is string => Boolean(value)).sort();
    const startDate = isoDate(form.get("startDate")) || detectedStarts[0] || new Date().toISOString().slice(0, 10);
    const endDate = isoDate(form.get("endDate")) || detectedEnds.at(-1) || startDate;
    const periodId = `${accountId}:${startDate}:${endDate}`;
    const periodLabel = `${startDate} to ${endDate}`;
    const created = [];

    for (const item of parsedFiles) {
      await runtime.BUCKET.put(item.objectKey, item.bytes, { httpMetadata: { contentType: item.file.type || "application/octet-stream" } });
      await runtime.DB.batch([
        runtime.DB.prepare("INSERT INTO imports (id, account_id, report_type, filename, period, received_at, status, object_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(item.id, accountId, item.summary.type, item.file.name, periodLabel, new Date().toISOString(), item.summary.warnings.length ? "Parsed with warning" : "Parsed", item.objectKey),
        runtime.DB.prepare("DELETE FROM report_summaries WHERE account_id = ? AND period_id = ? AND report_type = ?").bind(accountId, periodId, item.summary.type),
      ]);
      await runtime.DB.prepare("INSERT INTO report_summaries (id, import_id, account_id, period_id, report_type, payload) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), item.id, accountId, periodId, item.summary.type, JSON.stringify(item.summary)).run();
      created.push({
        id: item.id,
        accountId,
        reportType: item.summary.type,
        filename: item.file.name,
        period: periodLabel,
        receivedAt: new Date().toISOString(),
        status: item.summary.warnings.length ? "Parsed with warning" : "Parsed",
      });
    }

    const [summaryRows, skuRows, previousRow] = await Promise.all([
      runtime.DB.prepare("SELECT payload FROM report_summaries WHERE account_id = ? AND period_id = ? ORDER BY created_at").bind(accountId, periodId).all(),
      runtime.DB.prepare("SELECT payload FROM skus WHERE account_id = ? ORDER BY created_at").bind(accountId).all(),
      runtime.DB.prepare("SELECT payload FROM periods WHERE account_id = ? AND end_date < ? AND kind = 'weekly' ORDER BY end_date DESC LIMIT 1").bind(accountId, startDate).first(),
    ]);
    const summaries = (summaryRows.results as Array<{ payload: unknown }>).map((row) => parsePayload<ReportSummary>(row.payload)).filter((row): row is ReportSummary => Boolean(row));
    const knownSkus = (skuRows.results as Array<{ payload: unknown }>).map((row) => parsePayload<KnownSku>(row.payload)).filter((row): row is KnownSku => Boolean(row));
    const previous = previousRow ? parsePayload<PeriodPayload>((previousRow as Record<string, unknown>).payload) : null;
    const period = buildPeriodAnalysis({ accountId, startDate, endDate, summaries, knownSkus, previous });

    const writes = [
      runtime.DB.prepare("INSERT OR REPLACE INTO periods (id, account_id, start_date, end_date, kind, label, payload, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(period.id, accountId, period.startDate, period.endDate, period.kind, period.label, JSON.stringify(period), new Date().toISOString()),
      runtime.DB.prepare("UPDATE accounts SET status = ? WHERE id = ?").bind(period.status, accountId),
      ...period.skus.map((sku) => {
        const known = knownSkus.find((item) => item.id === sku.id);
        const preserved = known ? {
          listingUrl: known.listingUrl,
          reviewRating: known.reviewRating,
          reviewCount: known.reviewCount,
          reviewBreakdown: known.reviewBreakdown,
          reviewSource: known.reviewSource,
          reviewUpdatedAt: known.reviewUpdatedAt,
          reviewHistory: known.reviewHistory,
          manualFbaFeePerUnit: known.manualFbaFeePerUnit,
          manualCogsPerUnit: known.manualCogsPerUnit,
        } : {};
        return runtime.DB.prepare("INSERT OR REPLACE INTO skus (id, account_id, payload) VALUES (?, ?, ?)").bind(sku.id, accountId, JSON.stringify({ ...sku, ...preserved }));
      }),
    ];
    await runtime.DB.batch(writes);
    return Response.json({ imports: created, period }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: 500 });
  }
}
