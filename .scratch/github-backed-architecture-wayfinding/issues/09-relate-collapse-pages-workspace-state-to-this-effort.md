# Relate Collapse the pages workspace state to this effort

Type: grilling
Status: resolved
Blocked by: 05, 06

## Question

How should `.scratch/codebase-health/issues/03-collapse-pages-workspace-state.md` relate to the GitHub-backed speed and local/GitHub unification effort?

## Evidence that counts as done

- Compare the duplication findings from [Inventory local and GitHub workflow duplication](05-inventory-local-and-github-workflow-duplication.md) to the affected files and proposed direction in the codebase-health issue.
- State whether the pages workspace state module should own shared workflow behavior, merely consume a deeper route/cache boundary, or wait until performance bottlenecks are fixed elsewhere.
- Identify which parts of `apps/web/src/routes/pages/+layout.svelte` are performance-sensitive orchestration versus maintainability-only complexity.
- Identify tests that would become more stable or less mode-specific if the pages workspace were deepened.

## Resolution should decide

Whether the pages workspace state health candidate is critical to this effort, a later cleanup after route/cache decisions, or a separate maintainability project.

## Answer

Decision: [Collapse the pages workspace state](../../codebase-health/issues/03-collapse-pages-workspace-state.md) should be revised and included in this GitHub-backed speed/unification effort if the effort proceeds, but it should be sequenced after the route-data/cache boundary work. It is the consumer/state-machine tranche of the selected app-level route/workflow capability layer, not the first shared core and not a separate maintainability-only project.

Relationship to this effort:

- The pages workspace state module should consume a deeper route/workflow capability boundary before it owns broad shared workflow behavior. [Decide the shared core boundary](06-decide-shared-core-boundary.md) already rejected a pages workspace state machine as the first boundary because it would simplify `apps/web/src/routes/pages/+layout.svelte` without fixing `/api/repo/configs`, `/api/repo/config-states`, `page-view`, `item-view`, or browser cache endpoint fanout.
- Once [Deepen repository route data](../../codebase-health/issues/02-deepen-repository-route-data.md) is revised as decided by [Relate Deepen repository route data to this effort](08-relate-deepen-repository-route-data-to-this-effort.md), the pages workspace module becomes the right place to centralize normalized workspace state, user intents, and route outcomes: workspace bootstrap state, collection navigation status, config states, navigation editing, collection ordering, group management, local rescan command state, GitHub cache-clear command state, and post-mutation refresh outcomes.
- The health candidate is more than a later cosmetic cleanup. The current layout is where GitHub collection readiness, projection hydration, config-state loading, cache clear/reload, cache progress display, local rescan/remount, navigation editing, and mutation invalidation meet. Leaving that as the behavioral seam would let local/GitHub workflow drift continue even after the lower route/cache boundary is improved.
- It should not own GitHub cache mechanics, route endpoint selection, freshness polling, IndexedDB inventory, local File System Access handles, local discovery signatures, or draft branch lifecycle. Those remain adapter-specific responsibilities behind the capability layer.

Comparison to the existing health issue:

- The affected files are directionally correct. `apps/web/src/routes/pages/+layout.svelte` currently holds paired local/GitHub workspace maps and workflow branching; `apps/web/src/lib/stores/github-repository-cache.ts` is the GitHub adapter/cache source it should stop coordinating directly; `apps/web/src/lib/test/browser/manual-navigation-sidebar.svelte.spec.ts` demonstrates how browser tests learn route/cache details through the layout.
- The affected-file list is too narrow for the revised scope. The eventual spec should also mention page and item route tests, edit-flow tests, local rescan tests, the local content/repo stores, the GitHub cache tests that should stay adapter-specific, and the route/workflow capability module selected by the route-data work.
- The proposed direction should be narrowed. "Own workspace mode, navigation edits, collection state, cache intent, panel state, and route outcomes" should become "own mode-neutral workspace view state and user-intent orchestration, while delegating source/cache/freshness/persistence mechanics to local and GitHub adapters." Cache intent is shared only as an adapter command/result shape, not as shared GitHub cache runtime.
- UI presentation state should be split by usefulness, not swept into the architecture. Mobile sidebar/collection toggles, side panel placement, grid classes, document title text, and header/sidebar rendering are maintainability concerns and can remain at the Svelte adapter edge or move later into presentational helpers. They are not part of the performance-critical GitHub unification path.

Performance-sensitive orchestration currently in `apps/web/src/routes/pages/+layout.svelte`:

- GitHub bootstrap hydration and freshness scheduler startup through `githubRepositoryCache.hydrateFromBootstrap` and `startFreshnessScheduler`.
- GitHub collection loading through `getCollectionNavigation`, `warmCollection`, status/error maps, projection hydration, and `onCollectionChange`.
- GitHub config-state loading through `/api/repo/config-states`.
- GitHub cache clear, rehydrate, freshness reset, and current collection reload.
- Navigation save and collection-order save branching between local direct writes and GitHub `/api/repo/navigation-manifest`, followed by invalidation/reload work.
- Local collection/config-state loading from the browser backend and local rescan/remount after `localContent.refresh({ force: true })`.

Maintainability-heavy or UI-edge complexity:

- Sidebar/header/collection/mobile panel toggles, side-panel context, viewport detection, layout grid classes, title derivation, preview URL display, route-title copy, and duplicated desktop/mobile component wiring.
- Toast copy and button disabled/loading flags are useful workflow outputs, but their exact presentation should stay near the UI.

Tests that would become more stable or less mode-specific:

- `apps/web/src/lib/test/browser/manual-navigation-sidebar.svelte.spec.ts` could assert workspace user intents and rendered states with a workflow-provider test double instead of stubbing GitHub collection index/projection/page-view/item-view/config-state endpoints in layout tests.
- `apps/web/src/routes/pages/layout.spec.ts` could assert bootstrap/provider selection instead of preserving the current split where GitHub route data loads through `/api/repo/configs` and local mode returns empty bootstrap while browser stores do the real work.
- `apps/web/src/routes/pages/[page]/page.spec.ts` and `apps/web/src/routes/pages/[page]/[itemId]/page.spec.ts` could move toward route-view capability assertions while GitHub endpoint fallback/auth behavior stays in adapter tests.
- `apps/web/src/lib/test/browser/item-edit-page.svelte.spec.ts` could keep local direct-write and GitHub server-action specifics in adapter/edit-flow tests, while shared post-save refresh/group/navigation outcomes are tested against workflow intents.
- `apps/web/src/lib/test/browser/local-rescan-boundary.svelte.spec.ts` would remain valuable for local remount behavior, but the workspace module could expose a clearer rescan outcome for the layout to render.

Recommended backlog change:

- Revise [Collapse the pages workspace state](../../codebase-health/issues/03-collapse-pages-workspace-state.md) rather than split or supersede it now.
- If the final priority decision promotes this GitHub effort, absorb the revised candidate after the revised [Deepen repository route data](../../codebase-health/issues/02-deepen-repository-route-data.md) work. The sequence should be: define/budget route-workflow capabilities, revise GitHub route/cache producer boundaries, then collapse the pages workspace consumer around those capabilities.
- If the GitHub effort does not outrank the general health backlog, keep this as a strong codebase-health candidate, but update its wording so it no longer implies that a Svelte state module should own GitHub cache mechanics or be the first performance fix.

No new wayfinding ticket is needed from this answer. The remaining open decision is [Decide priority against the codebase-health backlog](10-decide-priority-against-codebase-health-backlog.md), which can now compare the revised route-data and pages-workspace relationships together.
