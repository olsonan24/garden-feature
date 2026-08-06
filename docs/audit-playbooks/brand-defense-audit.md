# Brand-defense audit playbook

Implementation status: **Scaffolded only.** The available source provides the `/brand-defense-audit` title, output description, and download link, but not its scoring or campaign-gap logic. The application exposes only a blocked readiness boundary and never infers brand terms.

Required source: the original `/brand-defense-audit` `.skill` or `.zip` package, including PDP scoring, campaign-gap formulas, inputs, thresholds, gates, outputs, and tests.

Brand terms must be explicitly verified and stored in an immutable Account State Block revision. The account name, SKU, ASIN, or campaign name is not sufficient proof of a brand term.

Without verified terms, brand-defense readiness is blocked and no finding/action is manufactured. With terms, future checks may compare STR performance, targeting coverage, placement, CPC, conversion, and competitor leakage, but STR remains the proof source for search-term performance.

No negative, bid, budget, or campaign action executes in this release. Each proposal must include the verified term source, report row evidence, time window, risk, impact only when calculable, and manager approval.
