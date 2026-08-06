import type { PersistentDatabase } from "./persistent-database";
import type { ReportSummary } from "./report-parser";
import { PARSER_VERSION } from "./audit/shared/audit-versioning";

function base64(bytes: ArrayBuffer) {
  const values = new Uint8Array(bytes);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < values.length; offset += chunkSize) binary += String.fromCharCode(...values.subarray(offset, offset + chunkSize));
  return btoa(binary);
}

async function checksum(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function preserveRawReport(db: PersistentDatabase, input: { id: string; accountId: string; filename: string; reportType: string; bytes: ArrayBuffer; uploadedBy: string; uploadedAt: string; contentType?: string; objectKey?: string | null }) {
  const fileChecksum = await checksum(input.bytes);
  const storagePath = input.objectKey ? `database://raw-report/${input.id}; object://${input.objectKey}` : `database://raw-report/${input.id}`;
  const metadata = {
    id: input.id,
    accountId: input.accountId,
    reportType: input.reportType,
    originalFilename: input.filename,
    originalStoragePath: storagePath,
    uploadedBy: input.uploadedBy,
    uploadedAt: input.uploadedAt,
    fileChecksum,
    fileSize: input.bytes.byteLength,
    parserVersion: PARSER_VERSION,
    importStatus: "received",
    importErrors: [] as string[],
    contentType: input.contentType || "application/octet-stream",
  };
  await db.batch([
    { sql: "INSERT INTO raw_imports (id, account_id, report_type, original_filename, original_storage_path, uploaded_by, uploaded_at, file_checksum, file_size, report_start, report_end, parser_version, import_status, import_errors, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", params: [input.id, input.accountId, input.reportType, input.filename, storagePath, input.uploadedBy, input.uploadedAt, fileChecksum, String(input.bytes.byteLength), null, null, PARSER_VERSION, "received", "[]", JSON.stringify(metadata)] },
    { sql: "INSERT INTO raw_report_files (raw_import_id, encoding, data, created_at) VALUES (?, ?, ?, ?)", params: [input.id, "base64", base64(input.bytes), input.uploadedAt] },
  ]);
  return metadata;
}

export async function finishRawReportImport(db: PersistentDatabase, input: { rawImportId: string; accountId: string; periodId: string; summary: ReportSummary; uploadedBy: string; uploadedAt: string; filename: string; storagePath: string; fileChecksum: string; fileSize: number; status: string; errors: string[] }) {
  const metadata = {
    id: input.rawImportId,
    accountId: input.accountId,
    reportType: input.summary.type,
    originalFilename: input.filename,
    originalStoragePath: input.storagePath,
    uploadedBy: input.uploadedBy,
    uploadedAt: input.uploadedAt,
    fileChecksum: input.fileChecksum,
    fileSize: input.fileSize,
    reportDateRangeStart: input.summary.dateMin,
    reportDateRangeEnd: input.summary.dateMax,
    parserVersion: PARSER_VERSION,
    importStatus: input.status,
    importErrors: input.errors,
  };
  await db.run("UPDATE raw_imports SET report_type = ?, report_start = ?, report_end = ?, import_status = ?, import_errors = ?, payload = ? WHERE id = ?", [input.summary.type, input.summary.dateMin || null, input.summary.dateMax || null, input.status, JSON.stringify(input.errors), JSON.stringify(metadata), input.rawImportId]);
  await db.run("DELETE FROM normalized_report_rows WHERE raw_import_id = ?", [input.rawImportId]);
  const statements = input.summary.normalizedRows.map((row) => ({ sql: "INSERT INTO normalized_report_rows (id, raw_import_id, account_id, period_id, report_type, source_row, parser_version, imported_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", params: [crypto.randomUUID(), input.rawImportId, input.accountId, input.periodId, input.summary.type, `${row.sourceSheet}:${row.sourceRowNumber}`, PARSER_VERSION, input.uploadedAt, JSON.stringify(row)] }));
  for (let index = 0; index < statements.length; index += 100) await db.batch(statements.slice(index, index + 100));
  return metadata;
}
