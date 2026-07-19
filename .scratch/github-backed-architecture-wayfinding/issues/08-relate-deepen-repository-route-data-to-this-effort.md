# Relate Deepen repository route data to this effort

Type: grilling
Status: resolved
Blocked by: 04, 06

## Question

How should `.scratch/codebase-health/issues/02-deepen-repository-route-data.md` relate to the GitHub-backed speed and local/GitHub unification effort?

## Evidence that counts as done

- Compare the route-data findings from [Trace route-data assembly and legacy fallbacks](04-trace-route-data-assembly-and-legacy-fallbacks.md) to the affected files and proposed direction in the codebase-health issue.
- State whether deepening repository route data is:
  - a prerequisite to the shared-core architecture
  - the main architecture move for this effort
  - a smaller follow-up after cache/performance work
  - already partially completed and needing only cleanup
  - not relevant to the current bottlenecks
- Identify any changes to the codebase-health issue wording, scope, or priority that would become justified by the investigation.

## Resolution should decide

Whether the existing route-data health candidate should be promoted, revised, split, or left in its current backlog position.

## Answer

Decision: [Deepen repository route data](../../codebase-health/issues/02-deepen-repository-route-data.md) should be revised and promoted into this GitHub-backed speed/unification effort if the effort proceeds. It should not be superseded or left as a generic second-tier health backlog item. It should also not be treated as the whole architecture: it is the route-data tranche of the selected app-level route/workflow capability layer.

Relationship to this effort:

- It is a prerequisite to the shared-core architecture because the selected boundary from [Decide the shared core boundary](06-decide-shared-core-boundary.md) depends on page/editor callers asking for page view, item view, collection navigation, config states, block support, and freshness-shaped capabilities instead of knowing the GitHub endpoint matrix and fallback sequence.
- It is the main architecture move for route-read and cache-miss assembly, but not for the whole effort. Cache lifecycle, API budgets, browser cache inventory, GitHub draft/freshness mechanics, and local File System Access mechanics remain adapter-specific responsibilities.
- It is not merely a smaller follow-up after performance work. The cache lifecycle and speed/API-budget decisions should constrain it first, but route-data deepening must happen before a pages-workspace state collapse can safely consume one shared workflow vocabulary.
- It is partially completed only at the primitive level. Repository-data already has deep enough primitives for snapshots, collection indexes/projections, singleton documents/states, and common collection item document resolution. The incomplete part is route-view assembly and browser-cache orchestration.
- It is directly relevant to the current bottlenecks, but the bottleneck is not primarily raw `getCachedContent` fallback removal. The larger leak is that page/item endpoints, config-state and collection endpoints, Svelte page loads, and `githubRepositoryCache` still coordinate bootstrap, block support, route payloads, endpoint choice, IndexedDB records, and legacy fallback awareness outside one route/workflow boundary.

Comparison to the existing health issue:

- The affected files in the health issue are directionally correct: `apps/web/src/lib/server/repository-data/route-data.ts` is the server-side fallback boundary, `apps/web/src/lib/stores/content-cache.ts` is the legacy compatibility cache that should stay hidden behind that boundary, and `apps/web/src/lib/stores/github-repository-cache.ts` is currently acting as a second route-data assembler on the client.
- The affected-file list is too narrow for the speed/unification effort. The revised scope should also name the GitHub route endpoints for `page-view`, `item-view`, `collection-items`, `collection-index`, `collection-projections`, `config-states`, `configs`, and `form-config`; `apps/web/src/lib/server/repo-config-bootstrap.ts`; the page/item route loaders; and the pages workspace consumer in `apps/web/src/routes/pages/+layout.svelte`.
- The proposed direction is right but too low-resolution. "Put page, item, and collection view assembly behind one deeper repository route data module" should become "define an app-level route/workflow capability layer whose GitHub adapter composes server repository-data route assemblers, browser cache records, freshness identity, and narrow cache-miss endpoints." Local and GitHub adapters stay at that capability seam, not at a shared low-level repository/snapshot seam.
- The issue should explicitly preserve existing repository-data primitives instead of implying a rewrite. The work is to deepen upward into route-sized assemblers: page view, item view, collection navigation, config states, block support needs, route-data identity, and cache-miss protocol.
- The issue should explicitly defer broad legacy fallback deletion. Legacy `content-cache` fallbacks should remain compatibility behavior inside the route-data boundary until normal GitHub paths are instrumented and budgeted to prove they no longer fire.

Recommended backlog change:

- Revise [Deepen repository route data](../../codebase-health/issues/02-deepen-repository-route-data.md) rather than split it now. Splitting before [Relate Collapse the pages workspace state to this effort](09-relate-collapse-pages-workspace-state-to-this-effort.md) and [Decide priority against the codebase-health backlog](10-decide-priority-against-codebase-health-backlog.md) would prematurely separate producer and consumer responsibilities.
- If the final priority decision promotes this GitHub effort, absorb the revised route-data candidate as the first implementation/spec section after instrumentation and cache/freshness guardrails are stated. Sequence it before any broad pages-workspace state collapse.
- If the GitHub effort does not outrank the general health backlog, keep the candidate in codebase-health, but update its wording and priority with this evidence. It should no longer read as a generic second-tier cleanup; it is a high-leverage route/workflow boundary candidate with known performance relevance.

No new wayfinding ticket is needed from this answer. The remaining open tickets already cover the pages-workspace relationship and the final backlog-priority call.
