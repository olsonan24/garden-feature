# Amazon PPC growth-operator playbook

Implementation version: `0.1.0-partial`

Implementation status: **Partially implemented from provided source material.** The supplied `Claude Skill for Amazon angora.txt` contains the top-level skill and doctrine, but not the referenced deterministic rule files. Until the original `references/` folder is provided, the application exposes the doctrine and data-readiness requirements but does not emit PPC operator findings or recommendations.

Missing source files: `references/asb-memory.md`, `references/playbooks.md`, `references/intent.md`, `references/str-process.md`, and `references/output-template.md`.

## Doctrine

STR leads. SQP explains. Cerebro validates and expands. Shopper intent sharpens the action. Only the Search Term Report proves spend, clicks, orders, attributed sales, waste, or harvest performance for an execution recommendation. SQP/Cerebro must never create a hard negative, bid cut, or scaling decision by themselves.

## Required gates

- Block execution recommendations when STR is absent.
- Lower confidence when Targeting is absent.
- Block aggressive scale when inventory is absent or under two weeks at the observed weekly pace.
- Do not infer an ACoS target. Compare to an Account State Block target only when its source is recorded.
- Do not claim TACoS without total sales.

## Sourced metric guidance

The supplied top-level source defines test spend as approximately `AOV × target ACoS` with phase modifiers, and the zero-order min-click gate as `max(8, ceil(1.5 / account average CVR))`. It delegates harvest gates, bid math, branded rules, placement logic, phase behavior, intent scoring, and output structure to the missing reference files. No fixed `$15` waste gate or fixed two-order harvest gate is treated as sourced behavior.

When the reference package is available, every finding must retain raw import, row, campaign/term, direct metrics, time window, confidence, proposed action, approval, and execution-capability evidence. The current module does not call Amazon Ads.

Listing/offer constraints are handed to the listing diagnostic module. Inventory constraints are safeguards, not PPC opportunities.
