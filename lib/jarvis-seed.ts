import type { DashboardSku, PeriodPayload, Status } from "./analyze-reports";

export type Account = { id: string; name: string; status: Status };
export type ImportItem = { id: string; accountId: string; reportType: string; filename: string; period: string; receivedAt: string; status: string };
export type ActionItem = { id: string; accountId: string; skuId?: string | null; title: string; detail: string; status: string; createdAt: string };

export const accountsSeed: Account[] = [{ id: "caldwell", name: "Caldwell", status: "critical" }];

export const seedSkus: DashboardSku[] = [
  ["knife", "Magnetic Knife Holder", "CaldwellMKH", "B0FKJSJFZ2", 95.96, 152, 4, 2.63, 91, 125.94, 6, -75.4, 48, 32, 14, 1, "attention", "Exact traffic is expensive and product-page placement produced spend without orders.", "Keep auto active. Reduce magnetic knife block to $0.20 to $0.30 and remove placement multipliers."],
  ["mixing", "Mixing Bowls", "CaldwellMBow", "B0FLF8GWM3", 74.97, 45, 3, 6.67, 28.83, 74.97, 3, -13.88, 91, 90, 1, 0, "monitor", "Auto found strong long-tail terms while the broad exact term consumed inefficient clicks.", "Pause mixing bowls exact. Add the proven stainless-steel and lids terms at conservative bids."],
  ["coffee", "Portable Coffee Grinder", "CaldwellPCG", "B0FKPFDTK9", 47.98, 40, 2, 5, 27.89, 23.99, 1, -39.68, 45, 43, 0, 2, "attention", "Recent traffic was inefficient and both sold units were refunded in the economics report.", "Pause phrase, lower auto to $0.30 to $0.35, and review the offer before scaling."],
  ["salt", "Salt & Pepper Grinders", "CaldwellSPS", "B0FLF6B1SZ", 16.99, 26, 2, 7.69, 11.85, 16.99, 1, -27.68, 89, 86, 2, 0, "critical", "One unit sold and one unit was refunded, leaving zero net units in SKU Economics.", "Reduce bids sharply and inspect the return reason before buying more traffic."],
  ["pasta", "Pasta Bowls", "CadlwellPBS", "B0FLF6TLBY", 24.99, 143, 1, .7, 48.86, 44.98, 2, -43.51, 267, 131, 6, 129, "critical", "Traffic is present, but 143 sessions converted only one unit.", "Pause exact and reduce auto close-match to $0.30 to $0.35 while the offer is reviewed."],
  ["shelf", "Pot & Pan Shelf", "CaldwellPPS", "B0FKJ69GGJ", 0, 19, 0, 0, 3.8, 0, 0, -76.66, 79, 79, 0, 0, "critical", "$72.86 in aged-inventory storage cost drove nearly the entire weekly loss.", "Address aged inventory immediately and enter COGS before evaluating ads."],
  ["smoker", "Whiskey Smoker", "CaldwellWSK", "B0FKJ9VRLM", 0, 4, 0, 0, 2.61, 0, 0, -39.24, 80, 80, 0, 0, "critical", "No sales and $36.63 in aged-inventory storage cost. Unit economics are structurally negative.", "Stop ads until pricing, COGS, and inventory strategy are corrected."],
  ["pots", "Pots & Pans Set", "Caldwell PotPanSet", "B0FL4M9TH5", 0, 3, 0, 0, 0, 0, 0, -30.93, 36, 36, 0, 0, "attention", "The listing received almost no traffic and incurred storage cost without a sale.", "Confirm listing availability before deciding whether to advertise or discontinue."],
].map((row) => {
  const [id, name, sku, asin, sales, sessions, units, conversion, adSpend, adSales, adOrders, profit, inventory, fulfillable, reserved, transfer, status, issue, recommendation] = row as [string, string, string, string, number, number, number, number, number, number, number, number, number, number, number, number, Status, string, string];
  return { id, accountId: "caldwell", name, sku, asin, sales, netSales: sales, sessions, units, refunds: 0, conversion, adSpend, adSales, adOrders, clicks: 0, profit, storage: name === "Pot & Pan Shelf" ? 72.86 : name === "Whiskey Smoker" ? 36.63 : 0, cogs: 0, inventory, fulfillable, reserved, transfer, unsellable: name === "Salt & Pepper Grinders" ? 1 : 0, inbound: 0, status, issue, recommendation };
});

export const seedPeriod: PeriodPayload = {
  id: "caldwell:2026-07-19:2026-07-25", accountId: "caldwell", startDate: "2026-07-19", endDate: "2026-07-25", label: "Jul 19, 2026 to Jul 25, 2026", kind: "weekly", status: "critical",
  metrics: { grossSales: 258.68, netSales: 193.71, netProceeds: -346.98, storage: 184.01, adSpend: 214.84, adSales: 286.87, clicks: 390, adOrders: 13, sessions: 432, units: 12, refunds: 0, inventory: 735, fulfillable: 577, acos: 74.9, tacos: 83.2, conversion: 2.78 },
  wow: {}, skus: seedSkus,
  daily: [["2026-07-19", 48.89, 23.99], ["2026-07-20", 32.06, 0], ["2026-07-21", 25.54, 64.97], ["2026-07-22", 23.44, 49.98], ["2026-07-23", 26.71, 24.99], ["2026-07-24", 24.96, 66.97], ["2026-07-25", 33.24, 55.97]].map(([date, spend, sales]) => ({ date: String(date), spend: Number(spend), sales: Number(sales), orders: 0, clicks: 0 })),
  insights: [
    { title: "Storage cost buried the period", detail: "$184.01 in aged-inventory storage accounted for 53% of the reported loss.", tone: "critical" },
    { title: "Advertising carried demand", detail: "Campaigns attributed $286.87 from $214.84 in spend, but ACoS remained 74.9%.", tone: "attention" },
    { title: "Conversion is the constraint", detail: "432 sessions produced only 12 units. Pasta Bowls received 143 sessions and converted one.", tone: "attention" },
  ],
  recommendations: seedSkus.filter((sku) => sku.status !== "healthy").map((sku) => ({ skuId: sku.id, title: `${sku.name}: next change`, detail: sku.recommendation, status: "recommended" })),
  dataQuality: ["SKU Economics advertising charges are $215.34. Campaign reports show $214.84.", "Business Report ordered sales are $260.89. SKU Economics gross sales are $258.68.", "Amazon condition SKUs are merged into primary products to prevent double-counting.", "Mixing Bowls and Pot & Pan Shelf still need confirmed COGS."],
  reports: ["SKU Economics", "Business Report by Child ASIN", "Advertised Product", "Search Term", "Targeting", "Placement", "Manage FBA Inventory"],
  placements: [{ placement: "Rest of Search", spend: 1, sales: 1, orders: 1, clicks: 1, acos: 58.8 }, { placement: "Product Pages", spend: 1, sales: 1, orders: 1, clicks: 1, acos: 90.2 }], funnel: [], generatedAt: "2026-08-01T12:00:00Z",
};

export const importSeed: ImportItem[] = [
  ["SKU Economics", "report_2026-08-02.xlsx"], ["Business Report by Child ASIN", "BusinessReport-8-01-26.csv"], ["Advertised Product", "Sponsored_Products_Advertised_product_report.xlsx"], ["Search Term", "Sponsored_Products_Search_term_report.xlsx"], ["Targeting", "Sponsored_Products_Targeting_report.xlsx"], ["Placement", "Sponsored_Products_Placement_report.xlsx"], ["Manage FBA Inventory", "131742020667.txt"],
].map((row, index) => ({ id: `seed-import-${index}`, accountId: "caldwell", reportType: row[0], filename: row[1], period: "Jul 19 to Jul 25, 2026", receivedAt: "2026-08-01T12:00:00Z", status: "Imported" }));

export const actionSeed: ActionItem[] = [
  { id: "a1", accountId: "caldwell", skuId: "knife", title: "Throttle magnetic knife block exact", detail: "Reduce bid to $0.20 to $0.30, down-only bidding, no placement multiplier.", status: "recommended", createdAt: "Jul 25, 2026" },
  { id: "a2", accountId: "caldwell", skuId: "pasta", title: "Fix Pasta Bowls conversion", detail: "Pause exact and lower auto close-match to $0.30 to $0.35.", status: "planned", createdAt: "Jul 25, 2026" },
  { id: "a3", accountId: "caldwell", skuId: "shelf", title: "Enter missing COGS", detail: "COGS is missing for Mixing Bowls and Pot & Pan Shelf.", status: "data-needed", createdAt: "Jul 25, 2026" },
];
