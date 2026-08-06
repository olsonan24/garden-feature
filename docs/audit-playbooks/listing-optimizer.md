# Listing and offer diagnostic playbook

Implementation status: **Scaffolded only.** The available source provides the `/amazon-listing-optimizer` title, output description, and download link, but not the skill logic. The application therefore does not run a listing threshold or generate listing recommendations.

Required source: the original `/amazon-listing-optimizer` `.skill` or `.zip` package, including audit inputs, thresholds, rewrite rules, structured-attribute rules, gates, output contract, and tests.

The listing module is separate from PPC. Traffic with persistently weak conversion can reveal a constraint in price, offer, content, reviews, availability, or product-market fit; PPC is not presented as the cure.

The prior `40 sessions / below 2% conversion` rule was not present in the provided source and is disabled. Exact listing content, price history, coupon state, buy box, review causes, creative quality, thresholds, and rewrite behavior remain unavailable until sourced.
