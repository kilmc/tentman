# GitHub-backed speed unification QA plan

Status: ready for release-candidate QA
Branch: `performance-improvement`
Spec: [GitHub-backed speed and local/GitHub workflow unification spec](../github-backed-speed-unification-spec.md)
Source map: [GitHub-backed architecture and performance wayfinding](../github-backed-architecture-wayfinding/map.md)

## Purpose

This is the QA pass after all generated implementation tickets for GitHub-backed speed and local/GitHub workflow unification have been completed.

The goal is not to re-triage the ticket set. The tickets are already implementation-ready and marked complete. This pass should prove that the integrated branch satisfies the original workflow targets, API budgets, and local/GitHub boundary decisions, then turn any failures into focused follow-up fixes.

## Recommended Flow

1. Start a fresh `/code-review` session against the complete `performance-improvement` branch.
2. Use this QA plan, the spec, and the source map as review inputs.
3. Run the automated baseline and focused tests.
4. Do manual exploratory QA on the high-risk workflows.
5. For each issue found, create a small follow-up with a failing regression first.

Use `/diagnosing-bugs` for intermittent, unclear, or performance-sensitive failures where the first task is finding a tight repro loop. Use `/tdd` or `/implement` directly for crisp failures with an obvious expected behavior.

## Code Review Brief

Review the branch against two axes:

- **Spec fit:** Does the implementation satisfy the workflow targets, API budgets, shared boundary, GitHub-specific responsibilities, local-specific responsibilities, and acceptance criteria from the spec?
- **Standards fit:** Does the code keep the route/workflow capability boundary deep and understandable, without leaking GitHub tree/blob/cache/draft mechanics back into page/editor callers or forcing local mode through GitHub-shaped behavior?

Important review sources:

- `../github-backed-speed-unification-spec.md`
- `../github-backed-architecture-wayfinding/map.md`
- `issues/01-add-github-workflow-readiness-and-request-budget-instrumentation.md`
- `issues/02-lock-the-desktop-news-collection-failure-as-a-regression-test.md`
- `issues/03-make-github-freshness-identity-only-when-unchanged.md`
- `issues/04-make-github-cache-work-prioritized-deduped-cancelable-and-rate-limit-aware.md`
- `issues/05-convert-changed-freshness-into-stale-or-error-route-records.md`
- `issues/06-introduce-the-app-level-workflow-data-contract-for-read-routes.md`
- `issues/07-move-github-workspace-bootstrap-and-config-states-behind-workflow-capabilities.md`
- `issues/08-move-github-collection-navigation-and-projection-hydration-behind-workflow-capabilities.md`
- `issues/09-move-github-page-item-and-block-support-views-behind-workflow-capabilities.md`
- `issues/10-move-publish-and-draft-summary-onto-scoped-compare-workflow-data.md`
- `issues/11-rework-the-pages-workspace-consumer-around-workflow-capabilities.md`
- `issues/12-preserve-local-mode-behind-the-same-workflow-vocabulary.md`
- `issues/13-add-shared-mutation-intent-and-result-vocabulary.md`
- `issues/14-retire-or-quarantine-legacy-route-data-fallbacks-and-tighten-budgets.md`

## Automated Baseline

Run from `/Users/kilmc/code/tentman/tentman`.

```sh
pnpm run check
pnpm run verify:baseline
```

If the broad baseline fails, capture the first failing command and classify the failure before starting manual QA. Do not bury a baseline failure under exploratory findings.

Focused tests to consider during review:

- workflow instrumentation and request-budget helpers
- desktop/manual navigation sidebar GitHub collection readiness
- GitHub route cache and collection navigation budgets
- GitHub freshness unchanged and changed-path behavior
- GitHub cache queue priority, dedupe, cancellation, and rate-limit handling
- GitHub page/item/block-support route views
- publish and draft summary scoped compare behavior
- local mode preservation behind the shared workflow vocabulary
- cache page/status UI for full-document warming budget limits

## Manual QA Matrix

Use a Theresa-sized GitHub-backed repository when possible, especially `kilmc/theresagrieben`, because the original failure was measured there. Prefer desktop viewport with the sidebar visible for collection tests; compact viewport can hide the failing path.

### First Repository Open

Expected:

- Repository shell, root configs, page list, navigation manifest, and sidebar-ready state are usable within the target window.
- Draft/page overview reaches a first useful summary without blocking on freshness or idle warming.
- Freshness does not immediately repeat broad config/bootstrap work after bootstrap.

Watch for:

- repeated `/api/repo/configs` or `/api/repo/config-states`
- visible readiness blocked by background warming
- GitHub request fanout before the first useful UI
- route-data fallback logs on normal paths

### Desktop Collection Landing

Primary regression path: GitHub-backed `/pages/news` with desktop/sidebar UI visible.

Expected:

- Collection header, ordered sidebar/list, and first visible projection batch become usable.
- The UI never remains indefinitely on `Loading items...` once collection index and visible projections have returned.
- Foreground work is limited to one collection-index call and one visible projection batch.
- No page-view, item-view, or full-document calls are needed for collection readiness.

Watch for:

- config-state polling loops while the collection loads
- full-document warming competing with collection landing
- projection batches over the visible-slice cap
- duplicate foreground endpoint calls for the same identity
- stuck degraded/error states without manual recovery

### Warm Collection Reload

Expected:

- Matching IndexedDB identities render cached collection navigation within the warm target.
- Foreground GitHub calls for collection index, projection, and blob reads are zero.
- Any cache miss logs the exact miss reason.

Watch for:

- silent cache misses
- identity mismatch churn
- foreground work caused by background tasks
- fallback to legacy `content-cache` without explicit compatibility reason

### Item Open and Edit

Expected:

- Route/form shell and item document readiness are measured separately from rich editor interactivity.
- Cold and warm item open stay within their request budgets.
- Tag suggestions and existing-item hydration do not read every collection item in the foreground.
- Block-support misses are bounded and visible.

Watch for:

- editor readiness hiding route-data readiness failures
- whole-collection document reads on item open
- missing or misleading route-record error states
- GitHub details leaking into caller state or UI orchestration

### Freshness

Unchanged expected:

- Uses identity-only GitHub calls.
- Does not parse configs, read config blobs, rebuild singleton state, or call broad bootstrap/config endpoints.
- Duplicate foreground freshness work is deduped or reported as a budget failure.

Changed expected:

- Changed-path derivation runs in the background.
- Affected cache records become stale or error.
- Missing/deleted previous tree or blob identities do not produce a foreground 500 or stuck collection state.

Watch for:

- freshness blocking active route readiness
- deleted-ref/tree 404s escaping as normal route errors
- broad reloads caused by cheap identity checks
- background freshness continuing after identity changes or visible errors

### Publish and Draft Summary

Expected:

- Small drafts use compare scope and changed documents.
- Larger drafts show progress/status early.
- Normal small-draft paths avoid full-site document comparison.
- Degraded states are visible instead of silently falling back to broad review.

Watch for:

- broad full-site review on small drafts
- unbounded before/after document reads
- publish summary losing changed-page/item specificity
- GitHub draft mechanics leaking into shared mutation results

### Local Mode Preservation

Expected:

- Local folder mode satisfies the same workflow vocabulary without inheriting GitHub cache, polling, queueing, draft branch, PR, or publish/discard mechanics.
- Local File System Access handles, discovery signatures, direct writes, preview URL resolution, rescan/remount, and local recovery remain local-specific.

Watch for:

- local callers needing GitHub-shaped cache identity
- local rescan or direct-write behavior regressing
- GitHub endpoint or IndexedDB assumptions in local-only flows
- shared mutation vocabulary collapsing distinct local/GitHub outcomes

### Cache Page and Background Warming

Expected:

- Foreground work outranks background warming.
- Background warming starts only after active route readiness and idle conditions.
- Warming pauses on navigation, identity changes, foreground misses, rate-limit pressure, and visible errors.
- Full-document warming is disabled or bounded on first open and collection landing.
- Idle full-document warming is capped to 50 item documents or 10 MB per run if retained.

Watch for:

- passive warming changing visible route readiness
- cache inventory progress treating skipped-budget records as failures
- rate-limit thresholds ignored by background tasks
- concurrency above the intended server blob cap

## Acceptance Checklist

- [ ] Desktop/sidebar-present GitHub `news` collection reaches usable UI and does not get stuck on `Loading items...`.
- [ ] Warm collection reload has zero foreground GitHub index/projection/blob calls when identities match.
- [ ] Unchanged freshness is identity-only and avoids broad config/bootstrap work.
- [ ] Changed freshness marks affected records stale/error without foreground 500s or stuck active pages.
- [ ] Collection landing foreground work is limited to collection index plus one visible projection batch.
- [ ] Item open foreground work is limited to the specified collection-index, item-document, and block-support misses.
- [ ] Publish/draft summary uses compare scope and changed documents on the normal path.
- [ ] Normal GitHub route-data fallbacks are zero or explicitly logged compatibility behavior.
- [ ] Foreground/background GitHub work is prioritized, deduped, cancelable, and rate-limit-aware.
- [ ] Local folder mode still works through local-specific mechanics behind the shared vocabulary.
- [ ] Page/editor callers do not depend on GitHub tree/blob/ref/IndexedDB/draft mechanics.
- [ ] The shared workflow-data layer is app-level, capability-shaped, and view-model-shaped rather than a new low-level repository abstraction.

## Finding Classification

Use these labels when recording issues:

- **P0 release blocker:** data loss, publish/discard corruption, auth/session breakage, or a primary workflow unusable.
- **P1 spec miss:** violates a workflow target, request budget, cache/freshness guarantee, fallback guarantee, or local/GitHub boundary promise.
- **P2 regression risk:** behavior works but with brittle state, unclear errors, weak tests, or hidden coupling likely to break future tickets.
- **P3 polish or follow-up:** improves clarity, UI copy, logs, docs, or non-critical cleanup without changing the release decision.

For every P0/P1, capture:

- exact route and mode
- viewport size if UI-dependent
- cold or warm cache state
- draft branch state
- observed workflow marks or request traces
- expected budget/target from the spec
- smallest failing test or repro command

## Follow-up Rule

Every real finding should leave one of these behind:

- a failing regression test and a small fix
- a diagnosing-bugs note with the tightest known reproduction loop
- an explicit decision that the behavior is acceptable compatibility behavior, with logs/tests proving it is intentional
