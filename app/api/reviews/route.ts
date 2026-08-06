import { fetchAmazonReviewSnapshot, validateAmazonListingUrl } from "../../../lib/amazon-listing";
import { isAuthorizedWriteRequest } from "../../../lib/jarvis-auth";
import type { DashboardSku, ReviewHistoryPoint } from "../../../lib/analyze-reports";
import { ensurePersistentSchema, getPersistentDatabase } from "../../../lib/persistent-database";

function asFiniteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function parseSku(value: unknown) {
  try { return JSON.parse(String(value)) as DashboardSku; }
  catch { return null; }
}

export async function POST(request: Request) {
  if (!(await isAuthorizedWriteRequest(request))) return Response.json({ error: "Protected writes require a configured JARVIS_PASSCODE and an authenticated session." }, { status: 401 });
  try {
    const input = await request.json() as Record<string, unknown>;
    const skuId = String(input.skuId || "");
    const accountId = String(input.accountId || "");
    const listingUrl = validateAmazonListingUrl(String(input.listingUrl || "")).toString();
    if (!skuId || !accountId) return Response.json({ error: "SKU and account are required." }, { status: 400 });

    const db = await getPersistentDatabase();
    if (!db) return Response.json({ error: "Persistent review storage is not configured for this deployment.", canEnterManually: true }, { status: 503 });
    await ensurePersistentSchema(db);
    const row = await db.first("SELECT payload FROM skus WHERE id = ? AND account_id = ?", [skuId, accountId]);
    const current = parseSku(row?.payload);
    if (!current) return Response.json({ error: "This SKU is not saved yet. Add or import it before pulling ratings." }, { status: 404 });

    const manualRating = asFiniteNumber(input.manualRating);
    const manualReviewCount = asFiniteNumber(input.manualReviewCount);
    const manual = manualRating !== undefined || manualReviewCount !== undefined;
    if (manual && (manualRating === undefined || manualReviewCount === undefined || manualRating < 0 || manualRating > 5 || manualReviewCount < 0)) return Response.json({ error: "Manual updates need a rating from 0 to 5 and a nonnegative rating count." }, { status: 400 });

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

    const updated: DashboardSku = { ...current, listingUrl, reviewRating: snapshot.rating, reviewCount: snapshot.reviewCount, reviewBreakdown: snapshot.breakdown, reviewSource: manual ? "manual" : "amazon", reviewUpdatedAt: checkedAt, reviewHistory: history.slice(-104) };
    await db.run("INSERT INTO skus (id, account_id, payload) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET account_id = excluded.account_id, payload = excluded.payload", [updated.id, updated.accountId, JSON.stringify(updated)]);
    return Response.json({ sku: updated, review: snapshot });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The listing rating could not be refreshed.", canEnterManually: true }, { status: 502 });
  }
}
