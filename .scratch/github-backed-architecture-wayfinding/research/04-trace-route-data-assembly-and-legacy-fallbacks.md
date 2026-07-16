# Trace Route-Data Assembly and Legacy Fallbacks

## Scope

This traces the GitHub route-data paths named by [Trace route-data assembly and legacy fallbacks](../issues/04-trace-route-data-assembly-and-legacy-fallbacks.md): `/api/repo/page-view`, `/api/repo/item-view`, `/api/repo/collection-items`, `/api/repo/config-states`, `/api/repo/configs`, and the page loads for `pages/[page]` and `pages/[page]/[itemId]`.

The main question is whether [Deepen repository route data](../../codebase-health/issues/02-deepen-repository-route-data.md) is on the critical path for GitHub speed/unification, and which responsibilities are already deep enough.

## Current Route-Data Boundary

`apps/web/src/lib/server/repository-data/route-data.ts` is already a real boundary, but it is a fallback-oriented helper boundary rather than a complete route-view boundary.

It owns these GitHub-first decisions:

- Collection navigation: `getCollectionNavigation`, then legacy `getCachedContent` plus `getOrderedCollectionNavigation` if the repository-data path returns null.
- Page view content: collection pages use `getCollectionNavigation`; singleton pages use `getSingletonDocument`; both fall back to `getCachedContent`.
- Singleton state summaries: `getSingletonConfigStates`, then per-config `getCachedContent` plus `resolveContentDocumentState`.
- Collection item documents: `resolveCollectionItemDocument`, then whole-collection `getCachedContent` plus route/index lookup.

Observed legacy fallbacks to `getCachedContent`:

- `resolveCollectionNavigationForRoute` falls back when `getCollectionNavigation` returns null.
- `resolvePageViewContentForRoute` falls back when a collection navigation or singleton document cannot be resolved from repository-data.
- `resolveSingletonConfigStatesForRoute` falls back when `getSingletonConfigStates` returns null.
- `resolveCollectionItemForRoute` falls back when `resolveCollectionItemDocument` returns null.
- Adjacent draft/preview mutation support also falls back from `resolveCollectionItemDocument` to `getCachedContent` when resolving an existing directory item filename.

For normal GitHub-backed configs that can use repository-data source helpers, these fallbacks should not be the dominant route cost. They exist mostly for local/non-GitHub source shapes or not-yet-indexable shapes. The dominant leak is that callers still assemble route views, block support, bootstrap data, and browser-cache side effects outside the route-data boundary.

## Endpoint Needs vs Current Assembly

### `/api/repo/page-view`

Needs:

- Authenticated GitHub backend and draft branch.
- Config by slug.
- For collection pages: collection navigation.
- For singleton pages: singleton content document.
- Block support for the page form/editor payload.
- Content error reporting, page slug, and GitHub mode metadata.

Currently:

- Calls `requireGitHubContentRepository`.
- Loads a full repository snapshot to find the config.
- Calls `resolvePageViewContentForRoute`.
- Loads block registry data from snapshot block configs/root config.
- Returns a broad page-view payload.

This endpoint is still a route-view assembler. It correctly delegates the content fallback decision to `route-data.ts`, but it still knows snapshot lookup and block-support composition. For collection landing pages it can also produce collection navigation, but the no-query collection page load usually bypasses it in favor of browser cache plus `/api/repo/collection-index`.

### `/api/repo/item-view`

Needs:

- Authenticated GitHub backend and draft branch.
- Collection config by slug.
- One item document.
- Navigation manifest for edit/navigation context.
- Block support for the form/editor payload.
- Content error reporting, item id, page slug, and GitHub mode metadata.

Currently:

- Calls `requireGitHubContentRepository`.
- Loads a full repository snapshot to find config and navigation manifest.
- Calls `resolveCollectionItemForRoute`.
- Loads block registry data.
- Returns a broad item-view payload.

The item document path is fairly deep: `resolveCollectionItemDocument` can resolve by direct directory filename, collection index, route/id maps, and only then hydrate broader directory entries. The endpoint still assembles route payload details outside repository-data.

### `/api/repo/collection-items`

Needs:

- Ordered collection navigation for one collection.

Currently:

- Calls `loadSelectedGitHubRepoBootstrapContext`, which loads full bootstrap state.
- Finds the config from the full config list.
- Calls `resolveCollectionNavigationForRoute`.
- Returns only navigation.

This is too broad for what the endpoint returns. It needs one collection navigation, but pays for the bootstrap context and snapshot normalization path first. It is also partly superseded by the browser cache path that uses `/api/repo/collection-index` and `/api/repo/collection-projections`.

### `/api/repo/config-states`

Needs:

- State summaries for singleton configs with top-level state.

Currently:

- Calls `loadSelectedGitHubRepoBootstrapContext`.
- Calls `resolveSingletonConfigStatesForRoute`.
- Returns `statesBySlug`.

The repository-data state helper is deep enough: it uses singleton file configs and singleton documents from repository-data. The endpoint wrapper is too broad because it loads full bootstrap context before asking for state summaries.

### `/api/repo/configs`

Needs:

- Bootstrap data for the browser cache and app shell: configs, block configs, root config, singleton content identities, active draft branch, navigation manifest, repository identities, and freshness changed paths when checking from a previous identity.

Currently:

- Calls `loadSelectedGitHubRepoConfigs`.
- `loadSelectedGitHubRepoBootstrapContext` loads the selected repo backend, draft branch, full snapshot for the active ref, and a main snapshot when a draft branch exists.
- Freshness checks can also load a previous tree to compute changed paths.

This endpoint is intentionally broad, and it may dominate perceived route performance because route loads hydrate the browser cache from parent bootstrap first. It should not be folded blindly into page/item route data, but route-data deepening should define which routes genuinely require full bootstrap and which only need narrow identities.

## Page Load Behavior

### `pages/[page]/+page.ts`

Local mode returns an empty local placeholder and lets the Svelte page component use local stores/direct fetches.

GitHub mode:

- Hydrates `githubRepositoryCache` from parent bootstrap for all GitHub paths.
- For collection landing pages with no query params, it calls `ensureCollectionIndex`, then returns `getCollectionNavigation` from the browser cache. This skips `/api/repo/page-view`.
- For singleton pages, it calls `warmSingletonDocumentRoute`. If cached singleton content and block support are present, it returns without fetching `/api/repo/page-view`.
- Otherwise it fetches `/api/repo/page-view` and writes the singleton payload into the browser cache.

So page-load route data is split three ways: parent bootstrap, browser IndexedDB/cache assembly, and `/api/repo/page-view` fallback. That split is good for warm-cache speed, but the route module still knows collection vs singleton cache strategy, endpoint names, and block support requirements.

### `pages/[page]/[itemId]/+page.ts`

Local mode returns an empty local placeholder and lets the Svelte page component use local stores/direct fetches.

GitHub mode:

- Hydrates `githubRepositoryCache` from parent bootstrap.
- Checks `getItemDocumentForRoute`.
- If the item is cached, warms block support and returns without fetching `/api/repo/item-view`.
- Otherwise calls `warmItemDocumentForRoute`, which ensures the collection index and then enqueues an item-document task backed by `/api/repo/item-view`.
- If warming still cannot produce an item plus block support, the route load fetches `/api/repo/item-view` directly and writes the item document to the browser cache.

The item page has a sensible warm-cache branch, but it leaks route-data responsibilities into the browser cache: collection index dependency, item endpoint selection, block-support warming, and item document persistence are all coordinated outside a single route-view boundary.

## Browser Cache and Site Warm

`githubRepositoryCache` is effectively another route-data assembler on the client:

- `getCollectionNavigation` merges cached indexes/projections and orders navigation with the navigation manifest.
- `ensureCollectionIndex` calls `/api/repo/collection-index`.
- `warmSingletonDocumentRoute` calls `/api/repo/page-view`.
- `warmItemDocumentForRoute` ensures `/api/repo/collection-index`, then calls `/api/repo/item-view` if the item document is missing.
- `startIdleSiteWarm` fans out block support, singleton page-view requests, collection indexes, projection batches, and passive item-view document warming.
- `checkFreshness` calls `/api/repo/configs` with previous identity params.

This is a core source of request fanout. The deep repository-data server helpers are not the only boundary that matters; the browser cache has grown into a second orchestration boundary for route data.

## Already Deep Enough

These responsibilities look deep enough for the current architecture decision:

- Repository snapshot identity and tree/blob source helpers.
- Collection indexes for directory-backed and file-backed collections.
- Collection projection hydration by blob sha.
- Singleton document loading by blob identity.
- Singleton state summaries built from singleton document loading.
- Collection item document resolution for common direct filename/index/route cases.

These should be treated as primitives to reuse, not rewritten as part of the speed/unification work.

## Still Leaking

These responsibilities still leak across routes, endpoints, and browser cache:

- Page-view and item-view payload assembly combines config lookup, content resolution, block support, navigation manifest, branch metadata, error formatting, and cache seeding.
- Collection navigation has three public shapes: legacy `/api/repo/collection-items`, route-data collection navigation, and browser-cache collection index/projection navigation.
- Config states are deep internally, but the endpoint reaches them through full bootstrap.
- Bootstrap freshness and route data are entangled through parent data hydration and `githubRepositoryCache.checkFreshness`.
- Browser cache code knows the API route matrix and performs route-level decisions that overlap with server route-data helpers.
- Legacy content-cache fallback is concentrated in `route-data.ts`, but route modules and tests still need to understand when repository-data vs fallback is expected.
- Draft/preview mutation support still has a separate repository-data-to-content-cache fallback for directory item filename resolution.

## Decision

[Deepen repository route data](../../codebase-health/issues/02-deepen-repository-route-data.md) is directly on the critical path for GitHub speed/unification, but its scope should be sharpened.

The critical path is not primarily "remove every `getCachedContent` fallback." The common GitHub route paths already prefer repository-data primitives. The critical path is to make a single narrow route-view boundary own the decisions that are currently spread across route modules and `githubRepositoryCache`: which snapshot/bootstrap identity is needed, which content primitive is enough, when block support is required, how to return page/item/collection/config-state payloads, and how the browser cache asks for those payloads without duplicating the route matrix.

Recommended architecture direction:

- Keep `collection-index`, `collection-projections`, singleton documents, singleton states, and item document resolution as underlying deep primitives.
- Deepen `route-data.ts` upward into explicit page-view, item-view, collection-navigation, and config-states assemblers with route-sized inputs/outputs.
- Split "bootstrap for app shell/freshness" from "route data for this page" so `/api/repo/collection-items` and `/api/repo/config-states` do not have to load full bootstrap context to return narrow data.
- Preserve legacy `getCachedContent` fallback inside the route-data boundary until local/non-indexable behavior has a replacement, but keep it invisible to route modules and browser cache callers.
- Treat browser cache orchestration as part of the route-data design, not as a separate consumer detail. Its public methods should ask for route-view capabilities, not hard-code endpoint names and fallback sequences.

This means [Deepen repository route data](../../codebase-health/issues/02-deepen-repository-route-data.md) should precede or be bundled with any GitHub speed work that changes route loading, but it should follow the cache lifecycle/coherency decisions from [Explain cache lifecycle and staleness cost](../issues/03-explain-cache-lifecycle-and-staleness-cost.md). It is a route-boundary unification task, not a low-level repository-data rewrite.
