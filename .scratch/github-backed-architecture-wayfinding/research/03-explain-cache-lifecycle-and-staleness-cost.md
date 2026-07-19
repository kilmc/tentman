# Explain cache lifecycle and staleness cost

Research for [Explain cache lifecycle and staleness cost](../issues/03-explain-cache-lifecycle-and-staleness-cost.md), based on the baseline in [Baseline current GitHub workflow performance](../issues/01-baseline-current-github-workflow-performance.md), the request attribution in [Attribute GitHub API and request fanout cost](../issues/02-attribute-github-api-and-request-fanout-cost.md), and static tracing of the current browser and server cache paths.

## Decision

The next architecture should focus first on cache lifecycle and route/cache coherency, with fallback removal as the next supporting move. The current slow GitHub workflows are not caused by a lack of caching; they are caused by cache ownership being split across browser IndexedDB, server `repository-data`, and legacy `content-cache`, plus routes that re-enter bootstrap or broad page-view endpoints when a narrower identity-keyed cache entry is missing.

The cache identities are mostly the right ones:

- repository snapshot identity: `repoKey + ref + headSha + treeSha`;
- collection index identity: `repoKey + ref + treeSha + configSlug + contentIdentity + schemaIdentity`;
- projection identity: `repoFullName + blobSha + schemaIdentity`;
- full collection item document identity: `repoFullName + blobSha + configSlug`;
- singleton document identity: preferably singleton `blobSha + slug`, with a legacy `ref + treeSha + slug` fallback;
- block support identity: `repoFullName + ref + treeSha`;
- server snapshot/document/collection caches: similarly keyed by ref/tree/blob/schema identities.

The expensive part is not the identity model itself. The expensive part is that lifecycle transitions are not yet a single, narrow path:

- bootstrap writes the browser snapshot and inventory, then the layout immediately starts a freshness check through `/api/repo/configs`;
- visible collection loading can be cache-first, but any missing projection causes `/api/repo/collection-projections`, and broader route loaders can fall back to `/api/repo/page-view` or `/api/repo/item-view`;
- idle warming attempts to cache the whole site, including full item documents, and can compete with visible work on large repositories;
- `/api/repo/config-states`, `/api/repo/form-config`, and older `/api/repo/collection-items` still load selected repo bootstrap context, so "small" route data can become snapshot/bootstrap work;
- repository-data route helpers preserve legacy `content-cache` fallback when indexed route data cannot answer, which keeps correctness but makes cost and staleness harder to reason about.

## Browser cache lifecycle

`githubRepositoryCache` owns a browser IndexedDB database named `tentman-github-repository-cache`, version 3, with stores for snapshots, collection indexes, projections, full item documents, singleton documents, block support, and inventory records. The store list and target types live in `apps/web/src/lib/stores/github-repository-cache.ts`.

### Bootstrap and snapshot storage

The pages layout hydrates the browser cache from parent route bootstrap data and starts the freshness scheduler when GitHub mode is active. Each page loader also hydrates from parent data before it asks for route-specific cache entries.

Hydration builds an active snapshot with repo/ref/head/tree identity, configs, block configs, root config, navigation manifest, singleton content identities, and main/draft identities. It writes this snapshot to IndexedDB and rebuilds inventory from that active snapshot.

The snapshot is identity-keyed strongly enough for GitHub mode. A changed active identity cancels the active site warm. The cost is that this is a browser-only snapshot of server route bootstrap data; it does not prevent server routes from loading server snapshots again.

### Inventory records

Inventory is rebuilt from the active snapshot. It always includes a fresh snapshot target, a block-support target, one singleton document target per singleton config, one collection index target per collection config, and, once a collection index exists, both a projection target and a full item-document target for every indexed collection item.

This explains the baseline `2/450` style status on the desktop `news` workflow. For a repository with a large `news` collection plus `projects`, inventory is expected to include hundreds of projection/document targets after indexes are known. That status is inventory scale, not proof that 450 network requests are in flight. The risk is that idle warming and full-document warming can progressively turn many of those records into queued work.

Full item documents have a budget policy: 50 MB or 2,500 records by default. Records beyond the budget can become `skipped-budget`. That protects storage growth, but it does not prevent initial task creation for many items when warming decides to traverse the collection.

### Collection indexes and projections

Collection landing is the healthiest cache-first path:

- the loader/layout hydrates the snapshot;
- collection pages call `ensureCollectionIndex`;
- if the index is already in IndexedDB for the active repo/ref/tree/config identity, it serves from cache and notifies listeners;
- otherwise it fetches `/api/repo/collection-index` and writes the index;
- `warmCollection` then computes missing projection blob SHAs and fetches only missing blobs through `/api/repo/collection-projections`;
- visible projection hydration defaults to 30 items, while remaining projections are optional/background depending on the caller.

The pages layout deliberately calls `warmCollection` with `hydrateRemaining: false` and `warmDocuments: false`, which is good for the visible collection sidebar path. The generic `warmCollection` default still warms full item documents unless callers override `warmDocuments: false`, so future/new callers can accidentally broaden a visible navigation load into full-document caching.

`promoteRoute` is also narrow for collection hovers/intent: it uses `hydrateRemaining: false` and `warmDocuments: false`.

### Full documents and item routes

Full item documents are stored by `repoFullName + blobSha + configSlug`. Item routes are cache-first only after the collection index exists, because `getItemDocumentForRoute` has to resolve `itemId` to an index item and blob SHA. If the item document is missing, `warmItemDocumentForRoute` ensures the collection index, then enqueues an item-document task that fetches `/api/repo/item-view`.

`/api/repo/item-view` returns more than the document: it also loads block support and navigation manifest. This makes the fallback useful for route completeness, but too broad as the primitive for a missing single document.

### Singleton documents and block support

Singleton documents are keyed by singleton blob identity where possible, falling back to a legacy tree identity key. A singleton page route can serve from cache only when the singleton content and block support are available. If the content is cached but block support is not, it warms block support through `/api/repo/form-config`.

Block support is keyed by repo/ref/tree. The fallback path through `/api/repo/form-config` loads selected repo bootstrap context before loading package block data, so missing block support can re-enter snapshot/bootstrap work.

### Idle site warming

`startIdleSiteWarm` starts a new run, clears queued tasks, warms block support, singleton documents, and all collection indexes as top-level tasks, then hydrates missing projections for every collection, then warms full documents for every collection.

The queue runs one task at a time and passive tasks wait for idle. That keeps browser concurrency low, but it makes large repository warming a long-lived background process that can share the same status/inventory surface as foreground loading. The baseline desktop status likely reflected this whole-site inventory/warm lifecycle, while the visible page only needed the current collection index plus first projection batch.

## Freshness and invalidation

Freshness is intended to be identity-based. The browser scheduler sends active `previousRef`, `previousHeadSha`, and `previousTreeSha` to `/api/repo/configs`. The server loads current bootstrap data and, if needed, compares changed paths against the previous tree. The browser then compares active/main/draft identities; unchanged checks update `lastCheckedAt` and increase backoff across 5, 15, 30, and 60 minute intervals.

The problem is the cost of the check. `/api/repo/configs` calls `loadSelectedGitHubRepoConfigs`, which calls `loadSelectedGitHubRepoBootstrapContext`. That can load active and main snapshots, discover configs and block configs, read navigation manifest, compute singleton content identities, and optionally load the previous tree for changed paths. This is much more than "compare current branch identity".

The repeated `/api/repo/config-states` calls in the desktop baseline are similar. The endpoint calls `loadSelectedGitHubRepoBootstrapContext` before resolving singleton config states, so a state read can do bootstrap-level work. Static tracing shows the layout has a `githubConfigStatesLoaded` guard, so repeated browser calls probably need a browser-level trace to explain the exact re-entry. Regardless, each call is currently expensive enough to damage the workflow.

Manual/browser invalidation after known changed paths is more targeted:

- browser `invalidatePaths` deletes matching collection indexes, projections, documents, singleton documents, and block support records;
- it rebuilds inventory, cancels site warming on navigation-manifest changes, marks affected inventory records stale, and notifies collection listeners;
- server `invalidateRepositoryData` can clear all caches or scope clearing by repo/ref/changed paths, invalidating snapshots only for repository-structure paths or broader publish/discard/instruction reasons.

The important asymmetry: browser invalidation can be path-targeted after a write, while freshness checking still re-enters broad bootstrap before it can decide what changed.

## Route behavior by endpoint

`/api/repo/configs`

- Not cache-first from the browser's perspective; it is the bootstrap/freshness endpoint.
- Server uses `repository-data` snapshot caches keyed by repo/ref/head/tree, but every request still resolves current identity and may load active plus main snapshots.
- Freshness uses identity parameters, but not a narrow identity-only endpoint.

`/api/repo/config-states`

- Not browser cache-first; layout fetches it once per page lifecycle unless the local `githubConfigStatesLoaded` flag is already set.
- Server loads selected repo bootstrap context, then tries `repository-data` singleton config states, falling back to legacy `content-cache` for singleton state documents.
- This route should be treated as a cache lifecycle/coherency problem, not a raw GitHub API problem.

`/api/repo/collection-index`

- Browser cache-first via `ensureCollectionIndex`.
- Server uses `repository-data` collection index caches, which build directory-backed indexes from the Git tree without reading every item document.
- This is the right route shape for directory-backed collection navigation.

`/api/repo/collection-projections`

- Browser only calls it for missing projection blob SHAs.
- Server reads projection blobs by Git blob SHA and has a process memory text-blob cache/in-flight dedupe.
- The route is correct as a missing-projection hydrator, but warm reloads should avoid it when IndexedDB already has `blobSha + schemaIdentity` records.

`/api/repo/page-view`

- Page loaders are browser cache-first for singleton routes when singleton document and block support are cached.
- Server resolves via `repository-data` first, then legacy `content-cache`, and always includes block registry data.
- It is too broad as a primitive for "missing singleton content" because it also carries block support and page route envelope.

`/api/repo/item-view`

- Item routes are browser cache-first only when collection index, item document, and usually block support are already cached.
- Server resolves via `repository-data` first, then legacy `content-cache`, and returns item, block support, navigation manifest, and route envelope.
- It is too broad as a primitive for "missing item document" and can also hydrate block support as a side effect.

`/api/repo/form-config`

- Used by new/edit/form paths and block-support warming.
- Loads selected repo bootstrap context, then block registry data.
- Missing block support therefore has bootstrap-level cost unless already cached.

`/api/repo/collection-items`

- Still exists as a legacy-ish route that loads selected repo bootstrap context and then route-data navigation.
- Current collection page/sidebar paths use `collection-index` plus browser cache instead, so this route is less central to the baseline, but it is another fallback-style route shape to retire or constrain.

## Slow workflow cache states

First repository open / pages overview:

- Browser has no active IndexedDB snapshot for the current identity yet.
- `/api/repo/configs` loads active bootstrap, and when a draft branch exists it also loads main snapshot identity/context.
- Browser hydration writes snapshot/inventory, then immediately starts the freshness scheduler, whose first run calls `/api/repo/configs?previous...`.
- `/api/repo/pages-summary` is outside `githubRepositoryCache` and uses draft comparison/server caches.
- Cost driver: bootstrap plus immediate freshness/draft route coordination.

Desktop/sidebar-present `news` collection:

- Collection index may be missing or fresh depending on previous navigation.
- Once index exists, inventory expands to projection and item-document targets for every collection item.
- Visible navigation only needs index plus up to 30 missing projection blobs, and the layout path correctly disables full-document warming.
- The stuck baseline likely came from competing lifecycle work: config states/freshness continued while collection index/projection completed, and an expensive route failed with a tree 404.
- Cost driver: route/cache coordination and broad freshness/state routes, not collection index construction itself.

Warm compact `news` reload:

- Browser IndexedDB should have snapshot, index, and at least first projection records.
- If `/api/repo/collection-projections` still fires for the first 30 blobs, either the projection records were never written under the current `blobSha + schemaIdentity`, the active identity/schema changed, or the loader rehydrated from a different workspace/ref identity.
- Cost driver: cache coherency/miss diagnosis rather than unavoidable GitHub work.

`projects` item open/edit:

- Cache-first requires active snapshot, collection index, full item document, and block support.
- If the full document is missing, the browser uses `/api/repo/item-view`, which returns a broad route model.
- Edit pages with tags load existing items through direct `/api/repo/collection-index` and `/api/repo/collection-projections` calls outside `githubRepositoryCache`, and they request every blob SHA for suggestions.
- Cost driver: route-data breadth and duplicate helper path for tag suggestions, plus editor startup which is outside cache architecture.

Publish/draft summary:

- Mostly server-side and not governed by `githubRepositoryCache`.
- Uses base/draft snapshots, compare-commits, and scoped document reads, with `repository-data` and legacy content invalidation after publish/discard.
- Cost driver: server route envelope and draft comparison/review assembly, not browser IndexedDB lifecycle.

## Duplication with server caches and legacy cache

There are three active cache systems:

- Browser IndexedDB `githubRepositoryCache`: durable per browser, route-facing, inventory/status aware.
- Server `repository-data`: process-memory snapshots, Git blob text, collection indexes/navigation, singleton documents/states, draft change indexes.
- Legacy `content-cache`: process-memory TTL cache for full content documents, still used as fallback from route-data helpers.

The duplication is understandable but currently leaks into workflow cost:

- browser snapshot does not satisfy server snapshot routes;
- server snapshot does not satisfy browser route loaders after page reload unless the browser IndexedDB entries match;
- legacy `content-cache` fallback can fetch whole content documents when repository-data cannot answer;
- invalidation is split: server writes call `invalidateRepositoryData` and sometimes `invalidateContent`, while browser mutation flows call `githubRepositoryCache.invalidatePaths` after the response.

The architecture should not collapse these into one physical cache. It should make the boundary explicit: server owns GitHub identity and blob/snapshot reads; browser owns durable user-session route data. What is missing is a narrow route-data protocol between them so browser misses ask for exactly the record needed, and freshness asks for exactly identity/path changes.

## Recommendation

Prioritize cache lifecycle/coherency and route-data boundary changes.

Concretely, the next architecture should:

- separate cheap identity freshness from full `/api/repo/configs` bootstrap;
- make `/api/repo/config-states` avoid selected-repo bootstrap when the active snapshot identity is unchanged or when state can be derived from already-known singleton identities;
- keep collection index/projection as the model for narrow route data, and extend that pattern to singleton document, item document, and block support misses;
- keep full-document site warming optional, idle, and isolated from visible collection readiness;
- preserve legacy `content-cache` fallback only at well-marked edges, then retire it as route-data coverage becomes complete;
- maintain identity-based invalidation with `headSha`, `treeSha`, blob SHA, schema identity, and changed paths; avoid TTL as a primary freshness primitive for GitHub route data.

No new tickets are needed from this ticket. The follow-up decisions are already represented by [Trace route data assembly and legacy fallbacks](../issues/04-trace-route-data-assembly-and-legacy-fallbacks.md) and [Inventory local and GitHub workflow duplication](../issues/05-inventory-local-and-github-workflow-duplication.md).
