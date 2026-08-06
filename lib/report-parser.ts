import * as XLSX from "xlsx";

export type ReportType =
  | "SKU Economics"
  | "Business Report by Child ASIN"
  | "Advertised Product"
  | "Search Term"
  | "Targeting"
  | "Placement"
  | "Manage FBA Inventory"
  | "Search Query Performance"
  | "Search Catalog Performance"
  | "Unclassified Report";

export type ProductPartial = {
  source: ReportType;
  sku?: string;
  asin?: string;
  name?: string;
  sales?: number;
  orderedProductSales?: number;
  b2bSales?: number;
  netSales?: number;
  units?: number;
  b2bUnits?: number;
  refunds?: number;
  refundAmount?: number;
  cogs?: number;
  profit?: number;
  storage?: number;
  sessions?: number;
  pageViews?: number;
  conversion?: number;
  buyBox?: number;
  adSpend?: number;
  adSales?: number;
  adOrders?: number;
  clicks?: number;
  impressions?: number;
  inventory?: number;
  fulfillable?: number;
  reserved?: number;
  transfer?: number;
  unsellable?: number;
  researching?: number;
  inbound?: number;
};

export type Candidate = {
  sku?: string;
  asin?: string;
  campaign?: string;
  label: string;
  spend: number;
  sales: number;
  orders: number;
  clicks: number;
  bid?: number;
};

export type PlacementMetric = {
  placement: string;
  spend: number;
  sales: number;
  orders: number;
  clicks: number;
};

export type FunnelMetric = {
  query: string;
  volume: number;
  impressionShare?: number;
  clickShare?: number;
  cartShare?: number;
  purchaseShare?: number;
};

export type NormalizedReportRow = {
  sourceRowNumber: number;
  sourceSheet: string;
  recordType: "product" | "search_term" | "targeting" | "placement" | "funnel" | "unclassified";
  sku?: string;
  asin?: string;
  payload: Record<string, unknown>;
};

export type ReportSummary = {
  type: ReportType;
  filename: string;
  products: ProductPartial[];
  daily: Array<{ date: string; spend: number; sales: number; orders: number; clicks: number }>;
  candidates: Candidate[];
  placements: PlacementMetric[];
  funnel: FunnelMetric[];
  normalizedRows: NormalizedReportRow[];
  dateMin?: string;
  dateMax?: string;
  warnings: string[];
};

type Row = Record<string, unknown>;
type WorkbookRow = { sourceRowNumber: number; sourceSheet: string; values: Row };

const normalize = (value: string) => value.toLowerCase().replace(/^\ufeff/, "").replace(/[^a-z0-9]/g, "");

function normalizedRow(row: Row) {
  const result: Row = {};
  for (const [key, value] of Object.entries(row)) result[normalize(key)] = value;
  return result;
}

function read(row: Row, ...aliases: string[]) {
  for (const alias of aliases) {
    const value = row[normalize(alias)];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function text(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function number(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value === undefined || value === null || value === "") return 0;
  const raw = String(value).trim();
  const negative = raw.startsWith("(") && raw.endsWith(")");
  const parsed = Number(raw.replace(/[$,%(),]/g, "").replace(/\s/g, ""));
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : 0;
}

function date(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const raw = text(value);
  if (!raw) return "";
  const parsed = new Date(raw);
  return Number.isNaN(parsed.valueOf()) ? "" : parsed.toISOString().slice(0, 10);
}

function inferReportType(filename: string, rows: Row[]): ReportType {
  const name = normalize(filename);
  const headers = new Set(rows.flatMap((row) => Object.keys(row)));
  const has = (...values: string[]) => values.some((value) => headers.has(normalize(value)));
  if (name.includes("searchqueryperformance") || (has("search query volume") && has("search query"))) return "Search Query Performance";
  if (name.includes("searchcatalogperformance") || has("catalog performance")) return "Search Catalog Performance";
  if (name.includes("targeting") || has("targeting", "keyword bid")) return "Targeting";
  if (name.includes("placement") || has("placement classification", "placement")) return "Placement";
  if (name.includes("advertisedproduct") || has("advertised sku", "advertised asin")) return "Advertised Product";
  if (name.includes("searchterm") || has("customer search term")) return "Search Term";
  if (name.includes("businessreport") || (has("sessions total", "unit session percentage") && has("child asin"))) return "Business Report by Child ASIN";
  if (name.endsWith("txt") || has("afn fulfillable quantity", "afn warehouse quantity")) return "Manage FBA Inventory";
  if (name.includes("skueconomics") || name.startsWith("report") || has("net proceeds", "estimated profit", "contribution profit")) return "SKU Economics";
  return "Unclassified Report";
}

function workbookRows(bytes: ArrayBuffer) {
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true, raw: false });
  const rows: WorkbookRow[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const values = XLSX.utils.sheet_to_json<Row>(sheet, { defval: "", raw: false });
    values.forEach((value, index) => rows.push({ sourceRowNumber: index + 2, sourceSheet: sheetName, values: normalizedRow(value) }));
  }
  return rows;
}

function productIdentity(row: Row) {
  return {
    sku: text(read(row, "SKU", "Seller SKU", "Advertised SKU", "Merchant SKU", "MSKU")),
    asin: text(read(row, "ASIN", "Child ASIN", "(Child) ASIN", "Advertised ASIN", "FNSKU")),
    name: text(read(row, "Product Name", "Title", "Product", "Item Name", "Advertised product")),
  };
}

function groupProducts(items: ProductPartial[]) {
  const map = new Map<string, ProductPartial>();
  for (const item of items) {
    if (!item.sku && !item.asin) continue;
    const key = normalize(item.sku || item.asin || "");
    const previous = map.get(key);
    if (!previous) map.set(key, { ...item });
    else {
      for (const [field, value] of Object.entries(item)) {
        if (typeof value === "number") (previous as Record<string, unknown>)[field] = number((previous as Record<string, unknown>)[field]) + value;
        else if (value && !(previous as Record<string, unknown>)[field]) (previous as Record<string, unknown>)[field] = value;
      }
    }
  }
  return [...map.values()];
}

export function parseAmazonReport(bytes: ArrayBuffer, filename: string): ReportSummary {
  const sourceRows = workbookRows(bytes);
  const rows = sourceRows.map((row) => row.values);
  const type = inferReportType(filename, rows);
  const products: ProductPartial[] = [];
  const daily = new Map<string, { date: string; spend: number; sales: number; orders: number; clicks: number }>();
  const candidates: Candidate[] = [];
  const placements = new Map<string, PlacementMetric>();
  const funnel: FunnelMetric[] = [];
  const normalizedRows: NormalizedReportRow[] = [];
  const dates: string[] = [];
  const warnings: string[] = [];

  for (const sourceRow of sourceRows) {
    const row = sourceRow.values;
    const identity = productIdentity(row);
    const rowDate = date(read(row, "Date", "Start Date", "Report Date", "Snapshot Date"));
    if (rowDate) dates.push(rowDate);

    if (type === "SKU Economics") {
      const product: ProductPartial = {
        source: type,
        ...identity,
        sales: number(read(row, "Gross Sales", "Product Sales", "Sales Revenue", "Total Sales", "Ordered Product Sales")),
        orderedProductSales: number(read(row, "Ordered Product Sales", "Product Sales", "Sales Revenue", "Gross Sales")),
        b2bSales: number(read(row, "Ordered Product Sales - B2B")),
        netSales: number(read(row, "Net Sales", "Net Product Sales", "Sales After Refunds")),
        units: number(read(row, "Units Sold", "Net Units", "Units Ordered", "Quantity")),
        refunds: number(read(row, "Units Refunded", "Refunded Units", "Returns", "Refund Quantity")),
        refundAmount: number(read(row, "Refunds", "Refund Amount", "Refunded Sales")),
        cogs: number(read(row, "COGS", "Cost of Goods Sold", "Product Cost")),
        profit: number(read(row, "Net Proceeds", "Estimated Profit", "Contribution Profit", "Profit")),
        storage: number(read(row, "Storage Fees", "Aged Inventory Surcharge", "Inventory Storage", "Storage Cost")),
        adSpend: number(read(row, "Advertising", "Advertising Cost", "Ad Spend", "Sponsored Ads")),
      };
      products.push(product);
      normalizedRows.push({ sourceRowNumber: sourceRow.sourceRowNumber, sourceSheet: sourceRow.sourceSheet, recordType: "product", sku: identity.sku, asin: identity.asin, payload: product });
    } else if (type === "Business Report by Child ASIN") {
      const product: ProductPartial = {
        source: type,
        ...identity,
        sessions: number(read(row, "Sessions - Total", "Sessions Total", "Sessions")),
        pageViews: number(read(row, "Page Views - Total", "Page Views Total", "Page Views")),
        units: number(read(row, "Units Ordered", "Units Ordered - B2B", "Units")),
        b2bUnits: number(read(row, "Units Ordered - B2B")),
        sales: number(read(row, "Ordered Product Sales", "Ordered Product Sales - B2B", "Sales")),
        orderedProductSales: number(read(row, "Ordered Product Sales", "Sales")),
        b2bSales: number(read(row, "Ordered Product Sales - B2B")),
        conversion: number(read(row, "Unit Session Percentage", "Unit Session Percentage - B2B", "Conversion Rate")),
        buyBox: number(read(row, "Featured Offer (Buy Box) Percentage", "Buy Box Percentage", "Buy Box")),
      };
      products.push(product);
      normalizedRows.push({ sourceRowNumber: sourceRow.sourceRowNumber, sourceSheet: sourceRow.sourceSheet, recordType: "product", sku: identity.sku, asin: identity.asin, payload: product });
    } else if (type === "Advertised Product") {
      const partial = {
        source: type,
        ...identity,
        adSpend: number(read(row, "Spend", "Cost")),
        adSales: number(read(row, "7 Day Total Sales", "14 Day Total Sales", "Attributed Sales", "Sales")),
        adOrders: number(read(row, "7 Day Total Orders (#)", "14 Day Total Orders (#)", "Orders", "Purchases")),
        clicks: number(read(row, "Clicks")),
        impressions: number(read(row, "Impressions")),
      } satisfies ProductPartial;
      products.push(partial);
      normalizedRows.push({ sourceRowNumber: sourceRow.sourceRowNumber, sourceSheet: sourceRow.sourceSheet, recordType: "product", sku: identity.sku, asin: identity.asin, payload: partial });
      if (rowDate) {
        const prior = daily.get(rowDate) || { date: rowDate, spend: 0, sales: 0, orders: 0, clicks: 0 };
        prior.spend += partial.adSpend || 0; prior.sales += partial.adSales || 0; prior.orders += partial.adOrders || 0; prior.clicks += partial.clicks || 0;
        daily.set(rowDate, prior);
      }
    } else if (type === "Search Term" || type === "Targeting") {
      const candidate: Candidate = {
        sku: identity.sku,
        asin: identity.asin,
        campaign: text(read(row, "Campaign Name", "Campaign")),
        label: text(read(row, type === "Search Term" ? "Customer Search Term" : "Targeting", "Keyword", "Target", "Search Term")),
        spend: number(read(row, "Spend", "Cost")),
        sales: number(read(row, "7 Day Total Sales", "14 Day Total Sales", "Attributed Sales", "Sales")),
        orders: number(read(row, "7 Day Total Orders (#)", "14 Day Total Orders (#)", "Orders", "Purchases")),
        clicks: number(read(row, "Clicks")),
        bid: number(read(row, "Bid", "Keyword Bid")) || undefined,
      };
      candidates.push(candidate);
      normalizedRows.push({ sourceRowNumber: sourceRow.sourceRowNumber, sourceSheet: sourceRow.sourceSheet, recordType: type === "Search Term" ? "search_term" : "targeting", sku: identity.sku, asin: identity.asin, payload: candidate });
    } else if (type === "Placement") {
      const label = text(read(row, "Placement Classification", "Placement", "Placement Type")) || "Unknown";
      const prior = placements.get(label) || { placement: label, spend: 0, sales: 0, orders: 0, clicks: 0 };
      prior.spend += number(read(row, "Spend", "Cost"));
      prior.sales += number(read(row, "7 Day Total Sales", "14 Day Total Sales", "Attributed Sales", "Sales"));
      prior.orders += number(read(row, "7 Day Total Orders (#)", "14 Day Total Orders (#)", "Orders", "Purchases"));
      prior.clicks += number(read(row, "Clicks"));
      placements.set(label, prior);
      normalizedRows.push({ sourceRowNumber: sourceRow.sourceRowNumber, sourceSheet: sourceRow.sourceSheet, recordType: "placement", payload: { placement: label, spend: number(read(row, "Spend", "Cost")), sales: number(read(row, "7 Day Total Sales", "14 Day Total Sales", "Attributed Sales", "Sales")), orders: number(read(row, "7 Day Total Orders (#)", "14 Day Total Orders (#)", "Orders", "Purchases")), clicks: number(read(row, "Clicks")) } });
    } else if (type === "Manage FBA Inventory") {
      const product: ProductPartial = {
        source: type,
        ...identity,
        inventory: number(read(row, "afn-warehouse-quantity", "AFN Warehouse Quantity", "Warehouse Quantity", "Total Quantity")),
        fulfillable: number(read(row, "afn-fulfillable-quantity", "AFN Fulfillable Quantity", "Fulfillable")),
        reserved: number(read(row, "afn-reserved-quantity", "AFN Reserved Quantity", "Reserved")),
        transfer: number(read(row, "afn-reserved-fc-transfer", "FC Transfer", "Reserved FC Transfer")),
        unsellable: number(read(row, "afn-unsellable-quantity", "AFN Unsellable Quantity", "Unsellable")),
        researching: number(read(row, "afn-researching-quantity", "AFN Researching Quantity", "Researching")),
        inbound: number(read(row, "afn-inbound-working-quantity", "Inbound Working")) + number(read(row, "afn-inbound-shipped-quantity", "Inbound Shipped")) + number(read(row, "afn-inbound-receiving-quantity", "Inbound Receiving")),
      };
      products.push(product);
      normalizedRows.push({ sourceRowNumber: sourceRow.sourceRowNumber, sourceSheet: sourceRow.sourceSheet, recordType: "product", sku: identity.sku, asin: identity.asin, payload: product });
    } else if (type === "Search Query Performance" || type === "Search Catalog Performance") {
      const query = text(read(row, "Search Query", "Query", "Search Term", "ASIN"));
      if (query) {
        const funnelRow: FunnelMetric = {
        query,
        volume: number(read(row, "Search Query Volume", "Query Volume", "Search Volume", "Impressions")),
        impressionShare: number(read(row, "ASIN Impression Share", "Impression Share")) || undefined,
        clickShare: number(read(row, "ASIN Click Share", "Click Share")) || undefined,
        cartShare: number(read(row, "ASIN Cart Add Share", "Cart Add Share")) || undefined,
        purchaseShare: number(read(row, "ASIN Purchase Share", "Purchase Share")) || undefined,
        };
        funnel.push(funnelRow);
        normalizedRows.push({ sourceRowNumber: sourceRow.sourceRowNumber, sourceSheet: sourceRow.sourceSheet, recordType: "funnel", sku: identity.sku, asin: identity.asin, payload: funnelRow });
      }
    } else {
      normalizedRows.push({ sourceRowNumber: sourceRow.sourceRowNumber, sourceSheet: sourceRow.sourceSheet, recordType: "unclassified", sku: identity.sku, asin: identity.asin, payload: row });
    }
  }

  if (!rows.length) warnings.push("The file contained no readable data rows.");
  if (type === "Unclassified Report") warnings.push("JARVIS could not identify this Amazon report type from its filename or columns.");
  return {
    type,
    filename,
    products: groupProducts(products),
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    candidates: candidates.filter((item) => item.label).sort((a, b) => b.spend - a.spend).slice(0, 50),
    placements: [...placements.values()],
    funnel: funnel.sort((a, b) => b.volume - a.volume).slice(0, 50),
    normalizedRows,
    dateMin: dates.sort()[0],
    dateMax: dates.sort().at(-1),
    warnings,
  };
}

export function identifyReportType(filename: string) {
  const value = normalize(filename);
  if (value.includes("searchqueryperformance")) return "Search Query Performance";
  if (value.includes("searchcatalogperformance")) return "Search Catalog Performance";
  if (value.includes("targeting")) return "Targeting";
  if (value.includes("placement")) return "Placement";
  if (value.includes("advertised")) return "Advertised Product";
  if (value.includes("searchterm")) return "Search Term";
  if (value.includes("business")) return "Business Report by Child ASIN";
  if (value.endsWith("txt")) return "Manage FBA Inventory";
  if (value.includes("skueconomics") || value.startsWith("report")) return "SKU Economics";
  return "Unclassified Report";
}
