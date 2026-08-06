# Search-term dashboard playbook

Playbook version: `1.0.0`

## Purpose

Surface search-term evidence without presenting supporting datasets as proof. Group results by persisted account, period, SKU/ASIN when reported, campaign, and exact source row.

## Rules

- Use STR spend, sales, orders, and clicks exactly as parsed.
- Show zero separately from missing.
- Waste is a review trigger, not an automatic negative.
- A term with sales but unknown inventory may be promising, but scaling remains blocked.
- Do not infer shopper intent, brand terms, match type, or target from a term string.
- SQP may explain funnel share; it may not override contradictory STR performance.

Every displayed conclusion must link to evidence with raw import ID, sheet/row, parser version, and period. Filters or sorting never change the historical audit output.
