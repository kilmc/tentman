# Collapse the pages workspace state

Status: needs-triage
Type: architecture-improvement
Strength: Strong
Suggested order: Second tier
Source report: `/var/folders/l3/0q53d3812t3gvm4ytx3fp2680000gn/T/architecture-review-20260710-222036.html#pages-workspace`

## Affected files

- `apps/web/src/routes/pages/+layout.svelte`
- `apps/web/src/lib/stores/github-repository-cache.ts`
- `apps/web/src/lib/test/browser/manual-navigation-sidebar.svelte.spec.ts`

## Problem

The pages layout module mixes route state, repo mode, cache orchestration, navigation edits, collection loading, and UI panel state.

The report lists these responsibilities currently living together:

- route state
- local/GitHub mode
- cache hydration
- collection loading
- manual navigation editing
- mobile panels and toasts

The Svelte module has become the behavioral seam, so tests learn too much implementation detail.

## Proposed direction

Deepen a pages workspace module so the Svelte layout becomes a rendering adapter around one behavioral implementation.

The deeper module should own workspace mode, navigation edits, collection state, cache intent, panel state, and route outcomes.

## Expected benefits

- Locality: workspace bugs concentrate in one behavioral module.
- Leverage: browser tests can shrink toward user intent and adapter behavior.
- Interface clarity: the layout forwards user intent instead of coordinating all state directly.

## Grill-with-docs prompt

Use this candidate as the focus for a `grill-with-docs` session. Do not re-run the architecture survey. Grill the workspace state model, Svelte adapter boundary, route outcomes, browser test strategy, and the safest migration path.

## Comments
