import { buildPeriodAnalysis, type KnownSku, type PeriodPayload } from "../../../lib/analyze-reports";
import { identifyReportType, parseAmazonReport, type ReportSummary } from "../../../lib/report-parser";
import { isAuthorizedWriteRequest } from "../../../lib/jarvis-auth";
import { getCloudflareRuntime, type R2Bucket } from "../../../lib/cloudflare-runtime";
import { ensurePersistentSchema, getPersistentDatabase } from "../../../lib/persistent-database";
import { authorizeRequest } from "../../../lib/jarvis-auth";
import { finishRawReportImport, preserveRawReport } from "../../../lib/report-storage";

const MAX_REPORT_FILES = 20;
const MAX_REPORT_BYTES = 20 * 1024 * 1024;

function parsePayload<T>(value: unknown): T | null {
  try { return JSON.parse(String(value)) as T; }
  catch { return null; }
}

function isoDate(value: FormDataEntryValue | null) {
  const raw = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function fallbackSummary(filename: string, message: string): ReportSummary {
  return { type: identifyReportType(filename), filename, products: [], daily: [], candidates: [], placements: [], funnel: [], normalizedRows: [], warnings: [message] };
}

export async function POST(request: Request) {
  if (!(await isAuthorizedWriteRequest(request))) return Response.json({ error: "Protected writes require a configured JARVIS_PASSCODE and an authenticated session." }, { status: 401 });
  try {
    const form = await request.formData();
    const accountId = String(form.get("accountId") ?? "");
    const files = form.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
    if (!accountId || !files.length) return Response.json({ error: "Account and files are required" }, { status: 400 });
    if (files.length > MAX_REPORT_FILES) return Response.json({ error: `Upload at most ${MAX_REPORT_FILES} reports at a time.` }, { status: 413 });
    const oversized = files.find((file) => file.size > MAX_REPORT_BYTES);
    if (oversized) return Response.json({ error: `${oversized.name} exceeds the 20 MB per-report limit.` }, { status: 413 });

    const db = await getPersistentDatabase();
    if (!db) return Response.json({ error: "Central report storage is not configured. No files were processed or saved." }, { status: 503 });
    await ensurePersistentSchema(db);
    const access = await authorizeRequest(request, "import_reports", accountId);
    if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
    const account = await db.first("SELECT id FROM accounts WHERE id = ?", [accountId]);
    if (!account) return Response.json({ error: "The selected account does not exist in central storage." }, { status: 404 });
    const runtime = await getCloudflareRuntime<{ BUCKET?: R2Bucket }>();
    const bucket = runtime?.BUCKET;

    const parsedFiles: Array<{ id: string; file: File; bytes: ArrayBuffer; objectKey: string | null; summary: ReportSummary; uploadedAt: string; raw: Awaited<ReturnType<typeof preserveRawReport>>; parseFailed: boolean }> = [];
    for (const file of files) {
      const id = crypto.randomUUID();
      const bytes = await file.arrayBuffer();
      const objectKey = bucket ? `${accountId}/${new Date().toISOString().slice(0, 10)}/${id}-${file.name}` : null;
      const uploadedAt = new Date().toISOString();
      const raw = await preserveRawReport(db, { id, accountId, filename: file.name, reportType: identifyReportType(file.name), bytes, uploadedBy: access.principal.userId, uploadedAt, contentType: file.type, objectKey });
      let summary: ReportSummary;
      let parseFailed = false;
      try { summary = parseAmazonReport(bytes, file.name); }
      catch (error) { parseFailed = true; summary = fallbackSummary(file.name, error instanceof Error ? `Parsing error: ${error.message}` : "The report could not be parsed."); }
      parsedFiles.push({ id, file, bytes, objectKey, summary, uploadedAt, raw, parseFailed });
    }

    const detectedStarts = parsedFiles.map((item) => item.summary.dateMin).filter((value): value is string => Boolean(value)).sort();
    const detectedEnds = parsedFiles.map((item) => item.summary.dateMax).filter((value): value is string => Boolean(value)).sort();
    const startDate = isoDate(form.get("startDate")) || detectedStarts[0] || new Date().toISOString().slice(0, 10);
    const endDate = isoDate(form.get("endDate")) || detectedEnds.at(-1) || startDate;
    const periodId = `${accountId}:${startDate}:${endDate}`;
    const periodLabel = `${startDate} to ${endDate}`;
    const created = [];

    for (const item of parsedFiles) {
      if (bucket && item.objectKey) await bucket.put(item.objectKey, item.bytes, { httpMetadata: { contentType: item.file.type || "application/octet-stream" } });
      const receivedAt = item.uploadedAt;
      const status = item.parseFailed ? "Parse failed" : item.summary.warnings.length ? "Parsed with warning" : "Parsed";
      await finishRawReportImport(db, { rawImportId: item.id, accountId, periodId, summary: item.summary, uploadedBy: access.principal.userId, uploadedAt: receivedAt, filename: item.file.name, storagePath: item.raw.originalStoragePath, fileChecksum: item.raw.fileChecksum, fileSize: item.file.size, status, errors: item.summary.warnings });
      await db.batch([
        { sql: "INSERT INTO imports (id, account_id, report_type, filename, period, received_at, status, object_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET account_id = excluded.account_id, report_type = excluded.report_type, filename = excluded.filename, period = excluded.period, received_at = excluded.received_at, status = excluded.status, object_key = excluded.object_key", params: [item.id, accountId, item.summary.type, item.file.name, periodLabel, receivedAt, status, item.objectKey] },
        { sql: "DELETE FROM report_summaries WHERE account_id = ? AND period_id = ? AND report_type = ?", params: [accountId, periodId, item.summary.type] },
      ]);
      await db.run("INSERT INTO report_summaries (id, import_id, account_id, period_id, report_type, payload) VALUES (?, ?, ?, ?, ?, ?)", [crypto.randomUUID(), item.id, accountId, periodId, item.summary.type, JSON.stringify(item.summary)]);
      created.push({ id: item.id, accountId, reportType: item.summary.type, filename: item.file.name, period: periodLabel, receivedAt, status, rawPreserved: true, checksum: item.raw.fileChecksum, parserVersion: item.raw.parserVersion });
    }

    const [summaryRows, skuRows, previousRow] = await Promise.all([
      db.all("SELECT payload FROM report_summaries WHERE account_id = ? AND period_id = ? ORDER BY created_at", [accountId, periodId]),
      db.all("SELECT payload FROM skus WHERE account_id = ? ORDER BY created_at", [accountId]),
      db.first("SELECT payload FROM periods WHERE account_id = ? AND end_date < ? AND kind = 'weekly' ORDER BY end_date DESC LIMIT 1", [accountId, startDate]),
    ]);
    const summaries = summaryRows.map((row) => parsePayload<ReportSummary>(row.payload)).filter((row): row is ReportSummary => Boolean(row));
    const knownSkus = skuRows.map((row) => parsePayload<KnownSku>(row.payload)).filter((row): row is KnownSku => Boolean(row));
    const previous = previousRow ? parsePayload<PeriodPayload>(previousRow.payload) : null;
    const period = buildPeriodAnalysis({ accountId, startDate, endDate, summaries, knownSkus, previous });

    const writes: Array<{ sql: string; params: unknown[] }> = [
      { sql: "INSERT INTO periods (id, account_id, start_date, end_date, kind, label, payload, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET account_id = excluded.account_id, start_date = excluded.start_date, end_date = excluded.end_date, kind = excluded.kind, label = excluded.label, payload = excluded.payload, updated_at = excluded.updated_at", params: [period.id, accountId, period.startDate, period.endDate, period.kind, period.label, JSON.stringify(period), new Date().toISOString()] },
      { sql: "UPDATE accounts SET status = ? WHERE id = ?", params: [period.status, accountId] },
    ];
    for (const sku of period.skus) {
      const known = knownSkus.find((item) => item.id === sku.id);
      const preserved = known ? {
        listingUrl: known.listingUrl, reviewRating: known.reviewRating, reviewCount: known.reviewCount, reviewBreakdown: known.reviewBreakdown,
        reviewSource: known.reviewSource, reviewUpdatedAt: known.reviewUpdatedAt, reviewHistory: known.reviewHistory,
        manualSalePrice: known.manualSalePrice, manualReferralRate: known.manualReferralRate, manualFbaFeePerUnit: known.manualFbaFeePerUnit,
        manualStorageCostPerUnit: known.manualStorageCostPerUnit, manualInboundCostPerUnit: known.manualInboundCostPerUnit,
        manualCogsPerUnit: known.manualCogsPerUnit, manualAngoraRate: known.manualAngoraRate, manualAdSales: known.manualAdSales, manualAdSpend: known.manualAdSpend,
      } : {};
      writes.push({ sql: "INSERT INTO skus (id, account_id, payload) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET account_id = excluded.account_id, payload = excluded.payload", params: [sku.id, accountId, JSON.stringify({ ...sku, ...preserved })] });
    }
    await db.batch(writes);
    return Response.json({ imports: created, period, originalFilesStored: true, rawStorage: "central-database", objectCopyStored: Boolean(bucket), storageNote: bucket ? "Original bytes were preserved in the central database and copied to object storage." : "Original bytes and parsed data were preserved in the central database." }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: 503 });
  }
}
