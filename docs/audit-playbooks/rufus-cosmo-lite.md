# Rufus/COSMO-lite diagnostic playbook

Implementation status: **Scaffolded only.** The available source provides the `/rufus-cosmo-lite` title, output description, and download link, but not the skill logic.

Required source: the original `/rufus-cosmo-lite` `.skill` or `.zip` package, including dimension definitions, question-gap logic, attribute rules, inputs, gates, outputs, and tests.

This module boundary is reserved for shopper-intent and catalog-language diagnostics. It must remain separate from PPC proof and listing execution.

Permitted inputs are source-referenced catalog/listing fields, verified customer questions, review themes, SQP query/funnel observations, and operator-saved account context. The module may classify or summarize retrieved language, but it may not invent product attributes, claims, compliance facts, targets, sales, or conversion impact.

No live Rufus/COSMO or model provider is connected in this release. Therefore the module is doctrine/documentation only and must report unavailable until an approved provider and sourced catalog inputs exist. Any future output must cite retrieved evidence and route edits through approval.
