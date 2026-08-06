# Bulk bid optimizer playbook

Implementation status: **Scaffolded only.** The available source provides only the `/bulk-bid-optimizer` title, description, and download link. No deterministic bid recompute or approval-dashboard source was available.

Required source: the original `/bulk-bid-optimizer` `.skill` or `.zip` package, including bid formulas, caps, gates, bulk-file schema, approval workflow, and tests.

This release creates bid-change recommendations, not Amazon bulk-file execution.

## Gates

- STR is required as primary performance proof.
- Targeting is required to identify the current target and bid.
- Account goals must come from a sourced Account State Block; no default ACoS is invented.
- Inventory must be known before any scale recommendation.
- Listing/offer conversion constraints must be diagnosed separately.
- SQP/Cerebro alone cannot justify hard bid changes.

A future eligible action must record current bid when reported, proposed payload, evidence rows, calculation, expected impact only when calculable, risk, required manager role, and `not_executable` until an approved ads boundary exists. No skill-specific formula or percentage change is active.
