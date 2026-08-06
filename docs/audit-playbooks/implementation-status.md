# Amazon playbook source and implementation status

Audit date: 2026-08-06

## Source actually available

The only supplied source file was `Claude Skill for Amazon angora.txt` (SHA-256 `ABB5246E68EBEF68194D630796FF082A8010A6BBCAA88CCFE5033CB30EA4BBEA`). It contains:

- titles, one-line descriptions, and external links for eleven downloadable Claude skills;
- the top-level `amazon-ppc-growth-operator-audit` skill text;
- references to five required PPC files that were not supplied.

The source file remains outside this repository and was not copied or published. No linked Google Drive, Notion, Loom, or YouTube title was treated as hidden implementation logic.

## Truth table

| Skill/playbook | Classification | Repository implementation | What is real now | Inferred rules | Source still required |
|---|---|---|---|---|---|
| Amazon PPC Growth Operator Audit | Partially implemented | `lib/audit/amazon/ppc-growth-operator/index.ts`; `docs/audit-playbooks/amazon-ppc-growth-operator.md` | Sourced doctrine, report priority, missing-data gates, and explicit blocked state | Prior fixed `$15 + 8 clicks`, two-order harvest, and two-week inventory gates were not source-faithful and are disabled | `references/asb-memory.md`, `references/playbooks.md`, `references/intent.md`, `references/str-process.md`, `references/output-template.md` |
| Search Term Dashboard | Scaffolded only | `docs/audit-playbooks/search-term-dashboard.md`; generic normalized-row/evidence infrastructure | Safe evidence-interface constraints only | No skill clustering, scoring, or dashboard rules active | Complete `/search-term-dashboard` package and references |
| Keyword Harvester / Negator | Scaffolded only | `docs/audit-playbooks/keyword-harvester-negator.md`; PPC boundary | STR-first safety boundary only | Prior fixed waste/harvest thresholds are disabled | Complete `/kw-harvester-negator` package plus PPC `references/str-process.md` |
| Bulk Bid Optimizer | Scaffolded only | `docs/audit-playbooks/bulk-bid-optimizer.md` | Non-executable interface constraints only | No bid formula active | Complete `/bulk-bid-optimizer` package |
| Brand Defense Audit | Scaffolded only | `lib/audit/amazon/brand-defense/index.ts`; `docs/audit-playbooks/brand-defense-audit.md` | Blocked readiness boundary; verified terms are never inferred | No scoring or campaign-gap formula active | Complete `/brand-defense-audit` package |
| Rufus/COSMO Lite | Scaffolded only | `docs/audit-playbooks/rufus-cosmo-lite.md` | Unavailable boundary only | None active | Complete `/rufus-cosmo-lite` package |
| Amazon Listing Optimizer | Scaffolded only | `lib/audit/amazon/listing-diagnostics/index.ts`; `docs/audit-playbooks/listing-optimizer.md` | Blocked readiness boundary only | Prior `40 sessions / 2% conversion` gate is disabled | Complete `/amazon-listing-optimizer` package |
| Amazon A/B Testing All-in-One | Not implemented | None | Nothing | None | Complete `/amazon-ab-testing-all-in-one` package and prerequisites |
| Market Research | Not implemented | None | Nothing | None | Complete `/market-research-html` package |
| Sophie Creative Pipeline | Not implemented | None | Nothing | None | Complete `/sophie-creative-pipeline` package |
| Sponsored Products Bulk Builder | Not implemented | None | Nothing | None | Complete `/sp-bulk-builder` package, XLSX schema, and validation rules |
| Dayparting Handout | Not implemented | None | Nothing | None | Complete `/dayparting-handout` package, including target-ACoS and cap logic |

## Separate application heuristics

`account-triage` and `sku-performance` are Garden application heuristics created from the product brief, not implementations of any listed Claude skill. Their thresholds must not be attributed to the downloaded playbooks. They remain evidence-linked, versioned, approval-required, and non-executable, but require a separate operator-validation review before production use.
