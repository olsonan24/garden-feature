export type AmazonReviewSnapshot = {
  rating: number;
  reviewCount: number;
  breakdown: Record<string, number>;
  resolvedUrl: string;
};

function decodeEntities(value: string) {
  return value
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|&#160;/g, " ");
}

function firstNumber(html: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return Number(match[1].replace(/,/g, ""));
  }
  return undefined;
}

export function parseAmazonReviewSnapshot(htmlInput: string, resolvedUrl = "") {
  const html = decodeEntities(htmlInput);
  const rating = firstNumber(html, [
    /"ratingValue"\s*:\s*"?([0-5](?:\.\d+)?)"?/i,
    /([0-5](?:\.\d+)?)\s+out of 5 stars/i,
    /a-icon-alt[^>]*>\s*([0-5](?:\.\d+)?)\s+out of 5/i,
  ]);
  const reviewCount = firstNumber(html, [
    /"ratingCount"\s*:\s*"?([\d,]+)"?/i,
    /"reviewCount"\s*:\s*"?([\d,]+)"?/i,
    /id="acrCustomerReviewText"[^>]*>\s*([\d,]+)\s+(?:global\s+)?ratings?/i,
    /([\d,]+)\s+(?:global\s+)?ratings?/i,
  ]);

  if (!Number.isFinite(rating) || !Number.isFinite(reviewCount)) {
    throw new Error("Amazon did not return readable rating data for this listing.");
  }

  const breakdown: Record<string, number> = {};
  for (let stars = 5; stars >= 1; stars -= 1) {
    const escaped = String(stars);
    const percent = firstNumber(html, [
      new RegExp(`${escaped}\\s*star(?:s)?[^%]{0,160}?([0-9]{1,3})\\s*%`, "i"),
      new RegExp(`aria-label="${escaped}\\s*star[^\"]*?([0-9]{1,3})\\s*percent`, "i"),
    ]);
    if (Number.isFinite(percent)) breakdown[String(stars)] = Math.max(0, Math.min(100, Number(percent)));
  }

  return { rating: Number(rating), reviewCount: Number(reviewCount), breakdown, resolvedUrl } satisfies AmazonReviewSnapshot;
}

function isAmazonHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "a.co" || host === "amzn.to" || host === "amazon.com" || host.endsWith(".amazon.com") || /^amazon\.[a-z.]+$/.test(host) || /^.+\.amazon\.[a-z.]+$/.test(host);
}

export function validateAmazonListingUrl(value: string) {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error("Paste a complete Amazon listing link beginning with https://."); }
  if (url.protocol !== "https:" || !isAmazonHost(url.hostname)) throw new Error("Only secure Amazon listing links are supported.");
  return url;
}

export async function fetchAmazonReviewSnapshot(value: string) {
  let url = validateAmazonListingUrl(value);
  for (let redirects = 0; redirects < 4; redirects += 1) {
    const response = await fetch(url.toString(), {
      redirect: "manual",
      headers: {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/132.0 Safari/537.36",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Amazon returned an incomplete redirect.");
      url = validateAmazonListingUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Amazon returned status ${response.status}.`);
    const html = await response.text();
    if (/robot check|enter the characters you see below|automated access/i.test(html)) throw new Error("Amazon temporarily blocked the automatic rating check.");
    return parseAmazonReviewSnapshot(html, url.toString());
  }
  throw new Error("The Amazon listing redirected too many times.");
}
