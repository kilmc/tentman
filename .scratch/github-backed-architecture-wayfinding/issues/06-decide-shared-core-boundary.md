# Decide the shared core boundary

Type: grilling
Status: resolved
Blocked by: 02, 03, 04, 05

## Question

What shared core, if any, should exist between local folder mode and GitHub-backed mode?

## Evidence that counts as done

- Use the decisions from the performance, cache, route-data, and duplication tickets to propose candidate boundaries.
- Evaluate at least these boundary candidates:
  - shared repository source/snapshot/index core with local and GitHub adapters
  - shared route/workflow data assembly core with adapter-specific source and cache layers
  - shared pages workspace state machine with local/GitHub data providers
  - no broad shared core, only targeted route-data/cache fixes
- For each candidate, state what code would move behind the boundary, what callers would stop knowing, what tests would become simpler, and what performance problem it would or would not solve.
- Include risks around browser-only File System Access APIs, GitHub draft branches, IndexedDB persistence, server-only GitHub access, and Svelte route state.

## Resolution should decide

The preferred shared-core boundary, or a decision that a shared core is not justified yet.

## Answer

Decision: Tentman should create a shared app-level route/workflow data assembly core with adapter-specific source, cache, and persistence layers.

This shared core should live inside `apps/web`, not `@tentman/core`. It should expose capability-shaped methods and shared view models for read-route and cache-miss assembly first: workspace bootstrap shape, collection navigation, page view, item view, config states, block support, freshness identity/changed-path protocol, and cache-miss request shapes. Mutation/write workflows should remain out of the first boundary, but the vocabulary should leave room for later mutation intents such as saving navigation or content.

The public contract should be capability/view-model shaped rather than repository-shaped. Callers should ask for capabilities such as `loadCollectionNavigation`, `loadPageView`, `loadItemView`, `loadConfigStates`, `loadBlockSupport`, and `checkFreshness`, not for snapshots, trees, blobs, IndexedDB records, or low-level repository indexes.

Adapter-specific carveout:

- Local mode keeps File System Access handles, permission checks, local discovery signatures, local config/cache persistence, local block-registry loading, and direct browser writes.
- GitHub mode keeps auth/session handling, server-only GitHub access, refs/head/tree/blob identity, managed draft branches, PR/publish lifecycle, IndexedDB stores, cache inventory, foreground/background warming, freshness scheduling, and changed-path invalidation.
- SvelteKit route mechanics such as redirects, `depends`, invalidation, and page-load timing stay at the route/app edge rather than inside the shared capability contract.

Candidate evaluation:

- Shared repository source/snapshot/index core with local and GitHub adapters: rejected as the primary boundary. It would move snapshot/index/source concepts behind a lower-level abstraction and make callers stop knowing some repository identity details. Tests around low-level indexes might become more uniform, but it would not solve the measured GitHub bottleneck: route/cache coordination, broad bootstrap re-entry, config-state freshness fanout, and browser cache miss sequencing. It also risks forcing browser-only local handles and server-only GitHub refs/tree/blob mechanics into a leaky lowest-common-denominator source model.
- Shared route/workflow data assembly core with adapter-specific source and cache layers: accepted. It would move route-sized assembly for workspace bootstrap outputs, collection navigation, page/item views, config states, block support, freshness identity results, and cache-miss protocols behind app-level capabilities. Route loaders, `+layout.svelte`, and eventually `githubRepositoryCache` would stop knowing the endpoint matrix and fallback sequence. Tests become simpler because page/layout tests can assert capability results and adapter tests can separately cover File System Access, GitHub draft/cache behavior, and repository-data fallbacks. This directly addresses the baseline performance problems by narrowing cache misses, avoiding broad bootstrap for small route data, and making freshness cheaper.
- Shared pages workspace state machine with local/GitHub data providers: useful but too high-level as the first boundary. It would simplify `apps/web/src/routes/pages/+layout.svelte` by centralizing loading/error/ready state, collection maps, config states, editor navigation state, and refresh flows. However, by itself it would not fix `/api/repo/configs`, `/api/repo/config-states`, `page-view`, `item-view`, or browser cache endpoint fanout. Treat it as a follow-up consumer of the route/workflow capability layer, not as the primary shared core.
- No broad shared core, only targeted route-data/cache fixes: rejected. Small fixes could improve specific symptoms, but they would leave the duplicated route/workflow assembly pattern intact. The prior evidence showed the problem is not just a few bad endpoints; it is an unclear boundary between server repository-data primitives, browser cache orchestration, route loaders, and local/GitHub workspace composition.

Risks and constraints:

- Browser-only File System Access APIs make local source/cache/persistence mechanics unsuitable for a shared low-level repository core.
- GitHub draft branches, PR/publish lifecycle, compare-commit state, and server-only GitHub API access must stay GitHub-specific.
- IndexedDB persistence, cache inventory, background warming, and freshness scheduling are GitHub adapter mechanics, even if their outputs are shaped by the shared route/workflow contract.
- Svelte route state should consume the shared capabilities, but SvelteKit-specific redirects, invalidation, `depends`, and loader timing should remain outside the core so the capability contract stays testable.
- Keeping writes out of the first boundary avoids conflating read-route speed work with the much harder local/GitHub mutation differences.
