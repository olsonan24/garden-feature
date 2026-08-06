# Bulk bid optimizer playbook

Playbook version: `1.0.0`

This release creates bid-change recommendations, not Amazon bulk-file execution.

## Gates

- STR is required as primary performance proof.
- Targeting is required to identify the current target and bid.
- Account goals must come from a sourced Account State Block; no default ACoS is invented.
- Inventory must be known before any scale recommendation.
- Listing/offer conversion constraints must be diagnosed separately.
- SQP/Cerebro alone cannot justify hard bid changes.

An eligible action records current bid when reported, proposed payload, evidence rows, calculation, expected impact only when calculable, risk, required manager role, and `not_executable` until an approved ads boundary exists. No percentage change should be generated when its baseline or account goal is missing.
