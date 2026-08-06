# Search-term dashboard playbook

Implementation status: **Scaffolded only.** The available source provides a title, a one-line description, and a Notion link; the actual `/search-term-dashboard` source package is not present. The rules below are safe interface constraints derived from the supplied top-level PPC doctrine, not a faithful implementation of the Search Term Dashboard skill.

Required source: the exported `/search-term-dashboard` skill package, including all prompt, reference, intent-clustering, calculation, and dashboard files.

## Purpose

Surface search-term evidence without presenting supporting datasets as proof. Group results by persisted account, period, SKU/ASIN when reported, campaign, and exact source row.

## Rules

- Use STR spend, sales, orders, and clicks exactly as parsed.
- Show zero separately from missing.
- Waste is a review trigger, not an automatic negative.
- A term with sales but unknown inventory may be promising, but scaling remains blocked.
- Do not infer shopper intent, brand terms, match type, or target from a term string.
- SQP may explain funnel share; it may not override contradictory STR performance.

Every future displayed conclusion must link to evidence with raw import ID, sheet/row, parser version, and period. No skill-specific clustering, scoring, threshold, or dashboard behavior is active.
