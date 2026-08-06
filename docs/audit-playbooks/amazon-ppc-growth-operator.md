# Amazon PPC growth-operator playbook

Playbook version: `1.0.0`

## Doctrine

STR leads. SQP explains. Cerebro validates and expands. Shopper intent sharpens the action. Only the Search Term Report proves spend, clicks, orders, attributed sales, waste, or harvest performance for an execution recommendation. SQP/Cerebro must never create a hard negative, bid cut, or scaling decision by themselves.

## Required gates

- Block execution recommendations when STR is absent.
- Lower confidence when Targeting is absent.
- Block aggressive scale when inventory is absent or under two weeks at the observed weekly pace.
- Do not infer an ACoS target. Compare to an Account State Block target only when its source is recorded.
- Do not claim TACoS without total sales.

## Outputs

Waste candidates require at least 8 clicks, no orders, and at least $15 of reported spend. Harvest candidates require at least two STR orders and reported sales. Each finding includes the raw import, row number, campaign/term, direct metrics, time window, confidence, proposed action, manager approval, and an execution capability. The current module proposes review only; it does not call Amazon Ads.

Listing/offer constraints are handed to the listing diagnostic module. Inventory constraints are safeguards, not PPC opportunities.
