import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { buildPeriodAnalysis } from "../lib/analyze-reports";
import { parseAmazonReport } from "../lib/report-parser";

function workbook(rows: Record<string, unknown>[]) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), "Report");
  return XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

test("parses and joins a complete weekly report package", () => {
  const economics = parseAmazonReport(workbook([{ SKU: "TEST-1", ASIN: "B000TEST01", "Product Name": "Test Product", "Gross Sales": 100, "Net Sales": 90, "Units Sold": 5, "Units Refunded": 1, COGS: 20, "Net Proceeds": 10, "Storage Fees": 5, Advertising: 30 }]), "SKU_Economics_report.xlsx");
  const business = parseAmazonReport(workbook([{ "(Child) ASIN": "B000TEST01", Title: "Test Product", "Sessions - Total": 100, "Units Ordered": 5, "Ordered Product Sales": 101, "Unit Session Percentage": "5%" }]), "BusinessReport.csv");
  const advertised = parseAmazonReport(workbook([{ Date: "2026-07-19", "Advertised SKU": "TEST-1", "Advertised ASIN": "B000TEST01", Spend: 30, "7 Day Total Sales": 75, "7 Day Total Orders (#)": 3, Clicks: 20 }]), "Sponsored_Products_Advertised_product_report.xlsx");
  const targeting = parseAmazonReport(workbook([{ "Advertised SKU": "TEST-1", Targeting: "test keyword", Spend: 12, "7 Day Total Sales": 0, "7 Day Total Orders (#)": 0, Clicks: 12 }]), "Sponsored_Products_Targeting_report.xlsx");
  const inventory = parseAmazonReport(workbook([{ sku: "TEST-1", asin: "B000TEST01", "product-name": "Test Product", "afn-warehouse-quantity": 40, "afn-fulfillable-quantity": 35, "afn-reserved-quantity": 5 }]), "Manage_FBA_Inventory.txt");
  const result = buildPeriodAnalysis({ accountId: "test", startDate: "2026-07-19", endDate: "2026-07-25", summaries: [economics, business, advertised, targeting, inventory] });
  assert.equal(result.skus.length, 1);
  assert.equal(result.metrics.grossSales, 100);
  assert.equal(result.metrics.sessions, 100);
  assert.equal(result.metrics.adSpend, 30);
  assert.equal(result.metrics.inventory, 40);
  assert.equal(result.metrics.acos, 40);
  assert.match(`${result.recommendations[0].title} ${result.recommendations[0].detail}`, /test keyword/i);
});

test("uses the previous saved week for week-over-week changes", () => {
  const report = parseAmazonReport(workbook([{ SKU: "TEST-1", ASIN: "B000TEST01", "Gross Sales": 200, "Net Proceeds": 40 }]), "SKU_Economics_report.xlsx");
  const previous = buildPeriodAnalysis({ accountId: "test", startDate: "2026-07-12", endDate: "2026-07-18", summaries: [parseAmazonReport(workbook([{ SKU: "TEST-1", ASIN: "B000TEST01", "Gross Sales": 125, "Net Proceeds": 20 }]), "SKU_Economics_report.xlsx")] });
  const current = buildPeriodAnalysis({ accountId: "test", startDate: "2026-07-19", endDate: "2026-07-25", summaries: [report], previous });
  assert.equal(current.wow.grossSales, 75);
  assert.match(current.insights[0].detail, /\$125\.00 to \$200\.00/);
});
