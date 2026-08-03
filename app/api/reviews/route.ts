import { fetchAmazonReviewSnapshot, validateAmazonListingUrl } from "../../../lib/amazon-listing";
import { isAuthorizedRequest } from "../../../lib/jarvis-auth";
import type { DashboardSku, ReviewHistoryPoint } from "../../../lib/analyze-reports";

type DbEnv = { DB: D1Database };

function asFiniteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function parseSku(value: unknown) {
  try { return JSON.parse(String(value)) as DashboardSku; }
  catch { return null; }
}

export async function POST(request: Request) {
  if (!(await isAuthorizedRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const input = await request.json() as Record<string, unknown>;
    const skuId = String(input.skuId || "");
    const accountId = String(input.accountId || "");
    const listingUrl = validateAmazonListingUrl(String(input.listingUrl || "")).toString();
    if (!skuId || !accountId) return Response.json({ error: "SKU and account are required." }, { status: 400 });

    const runtime = await import("cloudflare:workers");
    const db = (runtime.env as unknown as DbEnv).DB;
    await db.prepare("CREATE TABLE IF NOT EXISTS skus (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
    const row = await db.prepare("SELECT payload FROM skus WHERE id = ? AND account_id = ?").bind(skuId, accountId).first();
    const current = parseSku(row?.payload);
    if (!current) return Response.json({ error: "This SKU is not saved yet. Add or import it before pulling ratings." }, { status: 404 });

    const manualRating = asFiniteNumber(input.manualRating);
    const manualReviewCount = asFiniteNumber(input.manualReviewCount);
    const manual = manualRating !== undefined || manualReviewCount !== undefined;
    if (manual && (manualRating === undefined || manualReviewCount === undefined || manualRating < 0 || manualRating > 5 || manualReviewCount < 0)) {
      return Response.json({ error: "Manual updates need a rating from 0 to 5 and a nonnegative rating count." }, { status: 400 });
    }

    const snapshot = manual
      ? { rating: manualRating!, reviewCount: Math.round(manualReviewCount!), breakdown: current.reviewBreakdown || {}, resolvedUrl: listingUrl }
      : await fetchAmazonReviewSnapshot(listingUrl);
    const checkedAt = new Date().toISOString();
    const history = [...(current.reviewHistory || [])];
    const point: ReviewHistoryPoint = { checkedAt, rating: snapshot.rating, reviewCount: snapshot.reviewCount };
    const today = checkedAt.slice(0, 10);
    const existingToday = history.findIndex((item) => item.checkedAt.slice(0, 10) === today);
    if (existingToday >= 0) history[existingToday] = point;
    else history.push(point);

    const updated: DashboardSku = {
      ...current,
      listingUrl,
      reviewRating: snapshot.rating,
      reviewCount: snapshot.reviewCount,
      reviewBreakdown: snapshot.breakdown,
      reviewSource: manual ? "manual" : "amazon",
      reviewUpdatedAt: checkedAt,
      reviewHistory: history.slice(-104),
    };
    await db.prepare("INSERT OR REPLACE INTO skus (id, account_id, payload) VALUES (?, ?, ?)").bind(updated.id, updated.accountId, JSON.stringify(updated)).run();
    return Response.json({ sku: updated, review: snapshot });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The listing rating could not be refreshed.", canEnterManually: true }, { status: 502 });
  }
}
