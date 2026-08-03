import assert from "node:assert/strict";
import test from "node:test";
import { parseAmazonReviewSnapshot, validateAmazonListingUrl } from "../lib/amazon-listing.ts";

test("parses Amazon aggregate rating and distribution", () => {
  const html = `
    <script type="application/ld+json">
      {"aggregateRating":{"ratingValue":"4.6","ratingCount":"1,234"}}
    </script>
    <div aria-label="5 star 82 percent"></div>
    <div aria-label="4 star 11 percent"></div>
  `;
  const result = parseAmazonReviewSnapshot(html, "https://www.amazon.com/dp/B000000000");
  assert.equal(result.rating, 4.6);
  assert.equal(result.reviewCount, 1234);
  assert.equal(result.breakdown["5"], 82);
  assert.equal(result.breakdown["4"], 11);
});

test("accepts Amazon listing hosts and rejects unrelated hosts", () => {
  assert.equal(validateAmazonListingUrl("https://www.amazon.com/dp/B000000000").hostname, "www.amazon.com");
  assert.throws(() => validateAmazonListingUrl("https://example.com/dp/B000000000"));
});
