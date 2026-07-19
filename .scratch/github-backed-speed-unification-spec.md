# GitHub-backed speed and local/GitHub workflow unification spec

Status: implementation-ready planning artifact
Generated: 2026-07-16
Source map: [GitHub-backed architecture and performance wayfinding](github-backed-architecture-wayfinding/map.md)

## Purpose

Prioritize and implement a GitHub-backed speed and local/GitHub workflow unification effort for Tentman.

The effort is justified by user-facing GitHub mode failures and slowness, not by general code cleanliness alone. The implementation should create an app-level route/workflow capability boundary that lets page and editor callers use one workflow vocabulary while GitHub and local mode keep their necessary source, cache, freshness, persistence, and mutation mechanics separate.

This spec does not authorize product implementation by itself. It is the handoff artifact for implementation tickets or agent sessions.

## Decision Sources

- [Baseline current GitHub workflow performance](github-backed-architecture-wayfinding/issues/01-baseline-current-github-workflow-performance.md)
- [Attribute GitHub API and request fanout cost](github-backed-architecture-wayfinding/issues/02-attribute-github-api-and-request-fanout-cost.md)
- [Explain cache lifecycle and staleness cost](github-backed-architecture-wayfinding/issues/03-explain-cache-lifecycle-and-staleness-cost.md)
- [Trace route-data assembly and legacy fallbacks](github-backed-architecture-wayfinding/issues/04-trace-route-data-assembly-and-legacy-fallbacks.md)
- [Inventory local and GitHub workflow duplication](github-backed-architecture-wayfinding/issues/05-inventory-local-and-github-workflow-duplication.md)
- [Decide the shared core boundary](github-backed-architecture-wayfinding/issues/06-decide-shared-core-boundary.md)
- [Decide adapter-specific responsibilities](github-backed-architecture-wayfinding/issues/07-decide-adapter-specific-responsibilities.md)
- [Relate Deepen repository route data to this effort](github-backed-architecture-wayfinding/issues/08-relate-deepen-repository-route-data-to-this-effort.md)
- [Relate Collapse the pages workspace state to this effort](github-backed-architecture-wayfinding/issues/09-relate-collapse-pages-workspace-state-to-this-effort.md)
- [Decide priority against the codebase-health backlog](github-backed-architecture-wayfinding/issues/10-decide-priority-against-codebase-health-backlog.md)
- [Set GitHub speed targets and API safety budgets](github-backed-architecture-wayfinding/issues/11-set-github-speed-targets-and-api-safety-budgets.md)

## User-facing Severity

The primary severity is the desktop/sidebar-present GitHub collection workflow. In the baseline against `kilmc/theresagrieben` on 2026-07-13, `/pages/news` did not reach loaded item UI within a 90 second wait, remained on `Loading items...`, showed cache status around `2/450`, repeated `/api/repo/config-states` around once per second, and eventually surfaced a GitHub tree 404 as a 500. Compact viewport testing understated this because the sidebar path was hidden.

Other affected workflows are also meaningful:

- First repository open/config bootstrap is bounded but slow, because it loads snapshot/config/navigation context and can immediately re-enter similar work for freshness.
- Collection landing and warm reload repeat projection hydration even when `treeSha`, schema identity, and blob SHA records should make cached projections reusable.
- Item open/edit has two readiness points: route/form shell and rich-editor interactivity. The shell is GitHub route/cache sensitive; editor interactivity is partly outside this effort.
- Publish/draft summary was slow in the baseline and must avoid broad full-site comparison on normal small-draft paths.
- Freshness/config-state behavior can create stuck UI and hidden repeated work, making it a correctness and reliability problem as much as a performance problem.

## Workflow Targets

Targets are initial p75 local-development and preview-like guardrails for a Theresa-sized repository: draft branch present, about 55 project items, about 222 news items, hundreds of static assets, visible desktop sidebars, and a normal authenticated GitHub session. Instrumentation should refine them; implementation should not ignore them.

| Workflow | Initial target |
| --- | --- |
| First repository open | Repository shell, root configs, page list, navigation manifest, and sidebar-ready state within 3s. Draft/page overview first useful summary within 5s. Freshness and idle warming must not block the ready point. |
| Desktop collection landing | Collection header, ordered sidebar/list, and first visible projection batch usable within 3s cold after bootstrap. No indefinite `Loading items...` once collection index and visible projections have returned. |
| Warm collection reload | Cached collection navigation renders within 750ms. Matching IndexedDB identities produce zero foreground GitHub calls for collection index and first visible projections. |
| Item open/edit | Route/form shell and item document ready within 2.5s cold and 1s warm when collection index is available. Rich editor interactive within 4s cold and 2s warm as a separate mark. |
| Freshness unchanged | Completes within 750ms, identity-only, with no config parsing, config blob reads, singleton state rebuild, or full bootstrap load. |
| Freshness changed | Changed-path derivation completes in background within 2s, marks affected cache records stale, and does not block the active page. |
| Publish/draft summary | Small drafts show scoped changed-page/item summary within 4s. Larger drafts show progress/status by 2s and avoid full-site document comparison unless the scoped path is impossible. |

## Selected Boundary

Create a shared app-level route/workflow data assembly core inside `apps/web`, for example under `apps/web/src/lib/features/content-management/workflow-data/` or an equivalent feature-level module.

The boundary is capability-shaped and view-model-shaped, not repository-shaped. Page/editor callers should ask for workflow capabilities such as:

- workspace bootstrap data
- collection navigation
- page view data
- item view data
- config states
- block support readiness/status
- freshness status
- cache-miss or route-record hydration
- post-mutation refresh effects, later

Callers should not ask for Git trees, blob SHA batches, Octokit clients, IndexedDB records, File System Access handles, draft branches, route endpoint names, or legacy `content-cache` fallbacks.

This core belongs in the app, not `@tentman/core`, because it coordinates SvelteKit route workflows, browser cache behavior, local browser-backed mode, and GitHub server-backed mode. Existing low-level repository primitives should be preserved and composed under the boundary rather than replaced by a new shared repository source abstraction.

## Shared Responsibilities

The shared runtime layer should define stable content-management contracts and view models:

- normalized workspace bootstrap output
- normalized collection navigation and ordered/grouped collection state
- config-state maps
- page and item route-view payloads
- block-support status
- navigation manifest state
- instruction discovery summaries where needed by workspace views
- preview URL shape
- adapter status and user-facing error/status categories
- opaque route-data identity and freshness vocabulary
- cache-miss request/result shapes

The shared layer may later define mutation intent/result shapes, but writes are not part of the first read-route boundary. When added, shared mutation vocabulary should describe intents and outcomes such as save content, create item, delete item, save navigation manifest/order/groups, changed paths, redirect target, recovery cleanup signal, and refresh instruction.

## GitHub-specific Responsibilities

GitHub mode keeps the mechanics that create the measured speed and API-safety risks:

- auth/session state and server-only GitHub access
- Git Data branch/commit/tree/blob identity reads
- Contents API writes and simple path operations where useful
- managed draft branches, PR lifecycle, publish/discard, compare-commit draft scope, and branch-specific repository backend creation
- `headSha`, `treeSha`, blob SHA, schema identity, base/draft identities, and compare metadata as adapter-private mechanics
- IndexedDB stores, cache inventory, schema versioning, cache clear, status counts, foreground warming, idle warming, and full-document cache policy
- freshness polling, backoff, changed-path derivation, deleted-ref/tree 404 handling, path invalidation, and stale/error status
- request batching, concurrency, queue priority, retry/backoff, inflight dedupe, rate-limit handling, and foreground/background separation
- GitHub cache-miss endpoints and server `repository-data` composition
- SvelteKit route transport details such as auth redirects, endpoint HTTP statuses, `depends`, invalidation, and load timing wrappers

GitHub-specific code may expose opaque workflow outputs to the shared layer. It should not leak its tree/blob/ref/IndexedDB/draft mechanics into pages/editor callers.

## Local-specific Responsibilities

Local mode keeps browser and filesystem mechanics:

- File System Access handles, permission prompts, `.git` validation, handle persistence, and browser-only direct reads/writes
- local discovery signatures and discovery-cache invalidation
- local config-cache persistence
- content-component registry clearing
- local rescan/remount behavior
- local block-registry loading and local block package limitations
- local preview URL resolution
- local direct-write save behavior and recovery cleanup

Local mode should not inherit GitHub polling, GitHub cache inventory, GitHub request queueing, GitHub route fallback APIs, draft branches, PRs, publish/discard mechanics, or compare caches. It should satisfy the same workflow contracts from local stores and direct browser repository reads.

## API Safety Budgets

These budgets constrain the GitHub adapter and route/workflow capability layer.

Foreground budgets:

- First repository open may perform one active-ref identity read, one recursive tree read for the active ref, and one read per required config/root/block/navigation blob. A main-ref identity/tree read is allowed only when first-screen draft comparison genuinely needs it. Do not immediately repeat `/api/repo/configs` for freshness after bootstrap.
- Collection landing may perform at most one collection-index endpoint call and one foreground projection endpoint call for the visible slice. The visible projection batch remains capped at 30 blob SHAs. It must perform zero item-view, page-view, or full-document calls for collection landing readiness.
- Warm collection reload has a hard foreground budget of zero index/projection/blob calls when cached identities match. Misses must log the exact miss reason.
- Item open may perform at most one collection-index call if missing, one item-document route miss, and one block-support miss if block support is missing. Tag suggestions or existing-item hydration must not read every collection item in the foreground.
- Freshness unchanged may perform only active-ref identity calls. It must not read tree/blob/config/state data.
- Freshness changed may load at most one current tree and, if needed, one previous tree to compute changed paths. Missing previous identity becomes stale/error freshness status, not a blocking foreground 500.
- Publish/draft summary may perform one compare-commits call plus necessary branch metadata, then read only changed before/after documents. The normal scoped path budget is two document reads per changed content file that needs field-level review.
- Legacy `content-cache` fallbacks should be zero on normal GitHub collection, singleton, item, config-state, and publish summary paths. If a fallback fires, log route, slug, source, and reason.

Background and batching budgets:

- Foreground work always outranks background work.
- Keep a conservative browser cache queue with priority lanes for foreground, intent/hover, top-level warm, and passive warm.
- Keep visible foreground projection batches capped at 30 blobs and background projection batches capped at 20 blobs.
- Add server-side GitHub blob concurrency control, initially no more than 5 to 10 concurrent `git.getBlob` calls per repository/ref, plus inflight dedupe by blob SHA.
- Run background warming only after the active route is ready and the browser is idle. Pause it on navigation, identity changes, foreground misses, rate-limit pressure, and visible errors.
- Do not run full-site full-document warming by default during first open or collection landing. If retained, cap each idle run to 50 item documents or 10 MB, whichever comes first.
- Treat duplicate foreground endpoint calls for the same identity as a budget failure.

Rate-limit and failure budgets:

- Record rate-limit headers, remaining quota, reset time, retry-after, status codes, operation names, and abuse/secondary-limit signals for Octokit calls, including direct source-layer calls.
- Stop background warming when remaining core quota drops below 500, when secondary rate-limit signals appear, or when foreground requests receive 403, 429, or rate-limit style errors.
- Respect `Retry-After` when present. Otherwise use capped exponential backoff for GitHub 403, 429, and 5xx responses.
- Foreground route retries must be limited and visible. Failed route records should become error states with manual retry available.
- Tree/blob 404s during freshness must not leave collection readiness stuck. Convert missing/deleted previous identity into freshness stale/error status with recovery instructions.

## Instrumentation Requirements

Implementation cannot be judged without closing these gaps:

- Add workflow readiness marks for first repository open, desktop collection landing, warm collection reload, item route shell, rich editor interactive, freshness start/end, publish summary first status, and publish summary complete.
- Add browser fetch/request tracing with workflow id, route id, foreground/background priority, cache task key, duplicate/deduped flag, endpoint duration, and result status.
- Extend GitHub request instrumentation to direct Octokit source-layer calls: branch, commit, tree, blob, compare, Contents reads/writes, response status, rate-limit headers, retry-after, and cache/inflight-dedupe result.
- Log IndexedDB cache hit/miss reasons for snapshots, collection indexes, projections, item documents, singleton documents, and block support.
- Log projection batch composition: requested blob count, network blob count, server blob-cache hits, server inflight-dedupe hits, and schema identity.
- Log route-data fallback source and reason for page view, item view, collection navigation, config states, publish review, and preview/draft filename resolution.
- Add budget assertions to browser or integration tests for critical workflows.

## Tranche Order

### Tranche 0: Instrumentation and Baseline Locks

Add the readiness marks, request traces, cache hit/miss reasons, GitHub request stats, route-data fallback logs, and budget-test scaffolding needed to prove later tranches work. Reproduce the desktop/sidebar collection path that exposed the stuck `news` workflow.

This tranche may include instrumentation-only code changes. It should not change product behavior beyond observability.

### Tranche 1: GitHub Freshness and Cache Guardrails

Separate cheap freshness identity from full config/bootstrap loading. Ensure unchanged freshness does not call broad `/api/repo/configs`, rebuild config states, parse configs, or load full bootstrap context. Make foreground/background cache work prioritized, deduped, cancelable on identity change, and rate-limit-aware.

This tranche should stop the most dangerous feedback loops before deeper route-data refactoring begins.

### Tranche 2: Route-data Producer Capabilities

Revise and absorb [Deepen repository route data](codebase-health/issues/02-deepen-repository-route-data.md) here.

Define the app-level route/workflow capability contracts and implement the GitHub producer side first. Preserve the existing deep repository-data primitives for snapshots, collection indexes/projections, singleton documents/states, and common collection item document resolution. Deepen upward into route-sized assemblers:

- workspace bootstrap output
- page view
- item view
- collection navigation
- config states
- block support needs
- route-data identity
- cache-miss request/result protocol
- fallback logging and compatibility behavior

The affected scope should include `apps/web/src/lib/server/repository-data/route-data.ts`, `apps/web/src/lib/server/repo-config-bootstrap.ts`, GitHub route endpoints for `page-view`, `item-view`, `collection-items`, `collection-index`, `collection-projections`, `config-states`, `configs`, and `form-config`, `apps/web/src/lib/stores/github-repository-cache.ts`, page/item route loaders, and the route/workflow capability module.

Do not begin with broad deletion of legacy `content-cache` fallbacks. Keep them behind the route-data boundary, log every normal-path fallback, and retire them only when instrumentation proves the normal path no longer uses them.

### Tranche 3: Pages Workspace Consumer

Revise and absorb [Collapse the pages workspace state](codebase-health/issues/03-collapse-pages-workspace-state.md) here.

After the route-data producer boundary exists, deepen the pages workspace consumer around the shared workflow capabilities. `apps/web/src/routes/pages/+layout.svelte`, page/item routes, and editor surfaces should consume normalized workspace state, user intents, and route outcomes rather than coordinating local and GitHub mechanics directly.

The workspace module should own mode-neutral orchestration for:

- workspace bootstrap state
- collection navigation status
- config states
- navigation editing
- collection ordering
- group management
- local rescan command state as an adapter result
- GitHub cache-clear command state as an adapter result
- post-mutation refresh outcomes
- user-facing ready/error/degraded states

It should not own GitHub cache mechanics, endpoint selection, freshness polling, IndexedDB inventory, local File System Access handles, local discovery signatures, direct writes, or draft branch lifecycle.

UI-edge concerns such as mobile panel toggles, layout classes, document title copy, viewport detection, sidebar/header wiring, and exact toast presentation can move only when it clearly simplifies the consumer. They are not the performance-critical core of this tranche.

### Tranche 4: Mutation Intent Unification

Only after read-route capabilities and workspace state are stable, introduce shared mutation intent/result vocabulary where it reduces drift:

- save content
- create item
- delete item
- save navigation manifest
- save collection order/groups
- publish/discard outcomes, GitHub-specific underneath
- direct local write outcomes, local-specific underneath
- redirect targets
- recovery cleanup signals
- refresh instructions

Do not force local direct writes and GitHub draft/publish mechanics into one runtime implementation. Share only the intent/result contract and tests.

### Tranche 5: Fallback Retirement and Budget Tightening

Use instrumentation from earlier tranches to remove or quarantine legacy fallback paths that no longer fire on normal GitHub workflows. Tighten budgets based on measured p75 behavior, server blob concurrency evidence, publish summary behavior for larger drafts, and actual full-document warming usefulness.

## Acceptance Criteria

The effort is acceptable when all of the following are true:

- The desktop/sidebar-present `news` collection path reaches usable collection UI within the collection target and never remains indefinitely on `Loading items...` after collection index and visible projections have returned.
- Warm collection reload with matching identities performs zero foreground GitHub index/projection/blob calls and logs clear miss reasons when that budget is not met.
- Unchanged freshness uses identity-only GitHub calls and does not call broad `/api/repo/configs`, rebuild config states, or block active route readiness.
- Changed freshness marks affected cache records stale or error without producing a foreground 500 or stuck collection state for missing/deleted previous trees.
- Collection landing foreground work is limited to collection index plus one visible projection batch.
- Item open foreground work is limited to one missing collection index, one item-document miss, and one block-support miss where needed.
- Publish/draft summary uses compare scope and changed documents on the normal path and surfaces degraded status instead of silently falling back to broad full-site review.
- All normal GitHub route-data fallbacks to legacy `content-cache` are either zero or logged with route, slug, source, and reason.
- Foreground/background GitHub work is prioritized, deduped, cancelable on identity change, and rate-limit-aware.
- Pages/editor callers consume workflow capabilities and view models rather than endpoint matrices, tree/blob internals, IndexedDB records, local handles, or draft branch mechanics.
- Local mode still performs direct browser-backed reads/writes, rescan/remount, preview URL handling, and local discovery without inheriting GitHub polling/cache/draft behavior.
- Existing local and GitHub workflows for navigation editing, collection ordering, item edit, item create/delete, preview, and publish/draft status retain behavior while becoming easier to test through shared workflow contracts.

## Test Strategy

Add or revise tests in the same tranche order as implementation.

Instrumentation and budget tests:

- Browser or integration tests assert workflow readiness marks for first open, desktop collection landing, warm reload, item route shell, rich editor interactive, freshness, and publish summary.
- Tests assert no duplicate config-states loop during desktop collection loading.
- Tests assert no warm-reload projection call when projections are cached and identities match.
- Tests assert no full-document warming during collection landing.
- Tests assert unchanged freshness does not foreground bootstrap.
- Tests assert fallback logs include route/source/reason when compatibility fallbacks fire.

Route-data producer tests:

- Server route-data tests cover page view, item view, collection navigation, config states, block support, and cache-miss result shapes.
- GitHub adapter tests cover identity handling, changed-path invalidation, route record stale/error states, source-layer Octokit instrumentation, server blob concurrency, and fallback logging.
- Existing route tests for `apps/web/src/routes/pages/[page]/+page.ts` and `apps/web/src/routes/pages/[page]/[itemId]/+page.ts` move toward capability assertions while GitHub auth/fallback behavior remains in adapter tests.

Pages workspace consumer tests:

- `apps/web/src/lib/test/browser/manual-navigation-sidebar.svelte.spec.ts` should assert user intents and rendered workspace states with a workflow-provider test double instead of stubbing the GitHub endpoint matrix in layout tests.
- `apps/web/src/routes/pages/layout.spec.ts` should assert provider selection and bootstrap handoff rather than preserving local/GitHub bootstrap drift.
- `apps/web/src/lib/test/browser/item-edit-page.svelte.spec.ts` should keep local direct-write and GitHub server-action specifics in adapter/edit-flow tests, while shared post-save refresh/group/navigation outcomes are tested through workflow intents.
- `apps/web/src/lib/test/browser/local-rescan-boundary.svelte.spec.ts` should remain local-specific, but the workspace module should expose a clearer rescan outcome for layout rendering.

Fixture strategy:

- Create shared mode-neutral fixtures for root config, page configs, navigation manifest, collection navigation, singleton/item page views, config-state maps, block-support status, changed-path examples, cache-miss results, and mutation result shapes.
- Keep adapter-specific fixtures for GitHub cache/freshness/draft behavior and local handle/discovery/direct-write behavior.

## Codebase-health Backlog Changes

This effort outranks the remaining codebase-health backlog because it addresses a current user-facing GitHub workflow failure.

Revise and absorb:

- [Deepen repository route data](codebase-health/issues/02-deepen-repository-route-data.md): promote into Tranche 2. Revise from generic repository-data cleanup into the route-data producer portion of the app-level route/workflow capability layer. Expand affected files to include GitHub endpoints, `repo-config-bootstrap`, page/item loaders, `githubRepositoryCache`, and the new workflow-data module. Preserve low-level primitives and defer broad fallback deletion until instrumented.
- [Collapse the pages workspace state](codebase-health/issues/03-collapse-pages-workspace-state.md): promote into Tranche 3. Revise from "Svelte layout cleanup owns everything" into the pages-workspace consumer/state-machine tranche. It should own mode-neutral workspace view state and user-intent orchestration while delegating GitHub and local mechanics to adapters.

Already lower priority or not part of this effort:

- [Unify the navigation manifest module](codebase-health/issues/01-unify-navigation-manifest-module.md): residual polish should not block this effort.
- [Hide content component reference state](codebase-health/issues/04-hide-content-component-reference-state.md): later health work.
- [Deepen the mdsvex directive adapter](codebase-health/issues/05-deepen-mdsvex-directive-adapter.md): later health work.
- [Give the CLI a command runner module](codebase-health/issues/06-give-cli-command-runner-module.md): later health work.

## Non-goals

- Do not build a shared low-level local/GitHub repository source/snapshot/index core as the primary architecture move.
- Do not move this boundary into `@tentman/core`.
- Do not make local mode use GitHub cache inventory, polling, request queues, draft branches, or server route fallback APIs.
- Do not make GitHub mode expose tree/blob/ref/IndexedDB/draft mechanics to page/editor callers.
- Do not start by deleting all legacy `content-cache` fallbacks. First put them behind the route-data boundary and log them.
- Do not collapse `apps/web/src/routes/pages/+layout.svelte` before route-data producer capabilities exist.
- Do not treat rich-editor startup as entirely solved by GitHub route/cache work; it needs separate readiness marks.
- Do not work in `/Users/kilmc/code/tentman/test-app` for this effort unless a later implementation ticket explicitly requires it.
