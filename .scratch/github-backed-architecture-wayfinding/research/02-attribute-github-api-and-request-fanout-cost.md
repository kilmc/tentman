# Attribute GitHub API and request fanout cost

Research for [Attribute GitHub API and request fanout cost](../issues/02-attribute-github-api-and-request-fanout-cost.md), based on the baseline in [Baseline current GitHub workflow performance](../issues/01-baseline-current-github-workflow-performance.md) and static tracing of the current GitHub-backed routes.

## Decision

GitHub API latency is a real floor, especially for recursive tree loads and batched blob reads, but the dominant bottleneck to prioritize is Tentman's request fanout and route/cache coordination rather than a single inherently slow GitHub endpoint.

Preserve the current Git Data API direction:

- use branch/commit/tree identity as the source-of-truth for freshness;
- use one recursive tree per ref as the inventory for config discovery and directory collection indexes;
- use blob SHA keyed reads for projections and documents;
- keep Contents API writes and simple path operations adapter-specific.

Eliminate or contain these patterns:

- repeated bootstrap/freshness checks that reload snapshots for the same ref/tree;
- repeated visible projection batches when IndexedDB already has matching `blobSha + schemaIdentity`;
- collection landing paths that require a second foreground collection-navigation assembly after a page load already ensured the collection index;
- config-state polling or re-entry that asks the server to rebuild bootstrap context;
- publish/review fallbacks that rediscover configs or fetch whole content documents when changed-file scope is already known.

Do not optimize by moving the GitHub mode back toward Contents API per-path reads for collection listings. That would make the fanout worse.

## Instrumentation Coverage

Existing evidence sources:

- Route timing logs cover `/api/repo/configs`, `/api/repo/pages-summary`, `/api/repo/collection-index`, `/api/repo/collection-projections`, `/api/repo/config-states`, `/api/repo/page-view`, `/api/repo/item-view`, `/api/repo/form-config`, and several review helpers.
- `apps/web/src/lib/repository/github.ts` records `github.repository.request` stats for operations that go through the generic `RepositoryBackend` methods: `readTextFile`, `listDirectory`, `writeTextFile`, `commitChanges`, and legacy `discoverConfigs` / `discoverBlockConfigs`.
- `apps/web/src/lib/server/repository-data/source.ts` logs `repository-data.github-blob.load` for Git Data blob reads.
- `apps/web/src/lib/server/repository-data/snapshot.ts` logs `repository-data.snapshot.load` and cache hits.
- Collection route-data logs cover `repository-data.collection-index.load`, `repository-data.collection-navigation.load`, and endpoint-level projection batch timings.

Attribution gaps:

- The new GitHub source layer calls Octokit directly for `repos.getBranch`, `git.getCommit`, `git.getTree`, and `git.getBlob`, so those calls do not show up in `github.repository.request` stats.
- `git.getTree` is not individually timed. Snapshot timing includes tree load, config/blob discovery, and navigation manifest load as one combined duration.
- Projection batch timing says how many blob SHAs were requested, but not how many were blob-cache hits versus network `git.getBlob` calls unless the `repository-data.github-blob.load` lines are collected alongside it.
- Browser-side duplicate fetch attribution depends on a browser network trace or fetch wrapper. The existing server logs explain server work, but they do not prove why the browser retried `/api/repo/config-states` in the desktop baseline.

## Workflow Attribution

### First repository open / pages overview

Browser/API routes:

- `/api/repo/configs`
- `/api/repo/instructions`
- `/api/repo/pages-summary`
- layout-side freshness scheduling starts after bootstrap and immediately checks `/api/repo/configs?previousRef=...&previousHeadSha=...&previousTreeSha=...`

GitHub operations underneath:

- Resolve active content ref with `repos.getBranch` and `git.getCommit`.
- Load active snapshot with `git.getTree?recursive=true`.
- Read `tentman.json`, content config blobs, block config blobs, and `tentman/navigation-manifest.json`.
- If a managed draft exists, load both active draft snapshot and main snapshot. The baseline saw this directly: `api.repo.configs` loaded `main` and `tentman-preview` snapshots, each around 1.3-1.4s.
- `/api/repo/pages-summary` calls `getTentmanDraftBranchName`, then `getDraftChangeIndex`, which uses `repos.compareCommits` and two `repos.getBranch` calls for draft/base metadata.

Cost attribution:

- The API choice is mostly good: the snapshot path uses one tree plus targeted blobs rather than Contents API directory recursion.
- The fanout cost comes from loading main and draft snapshots together, then following immediately with pages-summary draft comparison and freshness bootstrap. In a draft-present repo, this makes first open at least two tree loads, config/blob reads for both refs, a navigation-manifest read per ref, compare commits, and branch metadata.
- Theoretical minimum for first open with draft present is one active snapshot, one main identity/snapshot if the UI needs main/draft comparison immediately, and one compare call for changed-file scope. Current behavior is close on API choice but too eager on coordination: overview/draft summary and freshness compete with bootstrap.

### Desktop collection landing / sidebar-present `news`

Browser/API routes:

- `/api/repo/configs` from parent layout bootstrap.
- `/api/repo/collection-index?slug=news` from the collection route loader and/or layout collection loading.
- `/api/repo/collection-projections` for the first visible batch of 30 blob SHAs.
- Background projection batches when the UI asks to hydrate remaining items.
- `/api/repo/config-states` from the pages layout effect.
- Freshness `/api/repo/configs?previous...` from the scheduler.

GitHub operations underneath:

- Bootstrap snapshot as above.
- Collection index uses the snapshot tree already loaded in memory, filters tree entries under the collection directory, and returns fallback rows with path and blob SHA. This should not require per-item GitHub requests for directory-backed collections.
- Projection hydration reads each requested blob SHA via the Git Data Blob API, with server memory dedupe by `backend.cacheKey + sha`.
- Config states reload bootstrap context, then resolve singleton state from snapshot plus singleton document blobs.

Cost attribution:

- `api.repo.collection-index` was 508-756ms for `news`, which is not the dominant cost by itself. It is mostly tree/index assembly, and for warm snapshot cases should be cheaper.
- `api.repo.collection-projections` was about 1.5s for 30 blobs. That is GitHub blob latency multiplied by the visible batch size. The endpoint is doing the right Git Data API operation, but the batch still creates 30 blob reads when server memory has no blob cache.
- Repeated projection reads on warm reload indicate browser/server cache coordination is not tight enough. The theoretical requirement is zero network blobs when IndexedDB has matching `blobSha + schemaIdentity`, and only missing blob SHAs otherwise.
- The baseline `2/450` cache status should be read as inventory scale, not necessarily 450 active network requests. For one large directory collection, inventory naturally contains projection targets and item-document targets for many items. The risk is when warming turns those inventory targets into foreground or competing background fetches.
- The desktop stuck state is more likely coordination failure than unavoidable GitHub API slowness: the collection index and first projections completed, but `/api/repo/config-states` and freshness/config bootstrap continued, and a GitHub tree 404 caused a 500.

### Freshness and config states

Browser/API routes:

- `/api/repo/config-states`
- `/api/repo/configs?previousRef=...&previousHeadSha=...&previousTreeSha=...`

GitHub operations underneath:

- `/api/repo/config-states` calls `loadSelectedGitHubRepoBootstrapContext`, which can load active and main snapshots just like `/api/repo/configs`, then resolves singleton config states.
- Freshness `/api/repo/configs?previous...` loads the current snapshot and, when tree SHA differs, loads the previous tree to derive changed paths.

Cost attribution:

- This is the most suspicious fanout. A "state" endpoint is not cheap: it can perform snapshot/bootstrap work before it returns singleton states.
- The 404 observed in the baseline lines up with `loadChangedPaths`: when the previous tree SHA is gone or from a deleted draft branch, the code catches a 404 only in the changed-path previous-tree load, but other snapshot tree loads can still surface a GitHub tree 404 through the route.
- Theoretical minimum for unchanged freshness is branch identity plus maybe current tree identity, not full config discovery plus manifest/state assembly on every check.
- Preserve adapter-specific freshness mechanics. Local mode does not need GitHub tree/ref semantics, while GitHub mode does.

### Item open / edit for a directory-backed item

Browser/API routes:

- Parent `/api/repo/configs`.
- Cache path may call `/api/repo/collection-index?slug=projects`, `/api/repo/item-view?slug=projects&itemId=...`, and `/api/repo/form-config?slug=...`.
- The edit loader may call `/api/repo/collection-projections` for tag suggestions via `loadCollectionExistingItems` when the config has tags blocks.
- Layout may also load the collection panel and `/api/repo/config-states`.

GitHub operations underneath:

- Snapshot/bootstrap as above.
- Collection index should come from tree identity.
- Item document read should be one blob read when the item blob SHA is known, though today the public route is `/api/repo/item-view` and returns document plus block support/navigation context.
- Block support can call `/api/repo/form-config`, which reuses snapshot block configs and may load package blocks.

Cost attribution:

- GitHub API usage is not the only readiness bottleneck for edit: the baseline separated route/form shell from rich editor startup.
- API fanout still matters because item open can require collection index, item document, block support, layout collection navigation, tag suggestions, and config states.
- The theoretical minimum for an item route after bootstrap is: known snapshot, collection index if not cached, one item blob by SHA, block support if not cached. Existing route shape is close but returns a broad page-view model through `/api/repo/item-view`, which makes client cache and route-data boundaries harder to reason about.

### Publish / draft summary

Browser/API routes:

- `/api/repo/publish-view`
- Asset URLs may be requested later while rendering review fields.

GitHub operations underneath:

- `getTentmanDraftBranchName`.
- Base snapshot and draft snapshot.
- `getDraftChangeIndex`: `repos.compareCommits` plus draft/base branch metadata.
- Review model uses changed-file classification; for scoped directory changes, it reads before/after changed documents through `backend.readTextFile`, which is Contents API (`repos.getContent`) today.
- If scoped review cannot be used, fallback fetches full content documents for both branches.

Cost attribution:

- For the measured draft with one changed project item, the focused changed-directory document load was about 255ms, so publish slowness is not primarily the changed document pair.
- The expensive part is the route envelope: base snapshot, draft snapshot, compare, metadata, config/manifest/root comparison, and possible review asset rendering.
- Preserve the compare-commits approach; it is the right primitive to avoid full collection fetches. Avoid falling back to full document loads except for unsupported change shapes.

## Contents API vs Git Data API

Use Git Data API for read-heavy GitHub mode:

- `repos.getBranch` + `git.getCommit` for ref identity.
- `git.getTree` recursive for repository inventory and directory-backed collection indexes.
- `git.getBlob` for config files, manifests, projections, singleton documents, and item documents by SHA.

Keep Contents API where path semantics are useful or currently unavoidable:

- `readTextFile`/`writeTextFile`/`deleteFile` in the generic repository backend.
- Navigation manifest writes and single-file writes.
- Review scoped document reads currently go through `backend.readTextFile`; this is acceptable for small changed-file sets but should not become the collection listing path.

Avoid:

- `repos.getContent` for every item in a directory collection.
- Re-discovering config files with legacy `discoverGitHubConfigs` when a snapshot tree is already available.

## Repeated Reads Identified

Repeated or potentially repeated in the baseline workflows:

- Root/config/block/navigation data across active and main refs during bootstrap, then again during config-states/freshness.
- `tentman/navigation-manifest.json` during snapshot load for both active and main/draft refs.
- `/api/repo/collection-index?slug=news` can be asked by the route loader and layout/cache path, though in-memory/browser cache usually collapses this after the first response.
- First visible projection batch of 30 blobs repeated on warm reload, despite IndexedDB being expected to hold projection records.
- `/api/repo/config-states` repeated in the desktop baseline. Static tracing shows it is guarded by `githubConfigStatesLoaded`, so the exact browser re-entry trigger still needs a browser-level trace.
- Publish/review can reread before/after changed item documents through Contents API even when the snapshots already know blob identities.

## Theoretical Request Counts

For a directory-backed collection landing after bootstrap:

- Required: 0 GitHub calls for collection index if active snapshot tree is already in server memory.
- Required: up to `ceil(visibleMissing / batchSize)` browser endpoint calls for projection batches.
- Required GitHub blob calls: exactly the number of projection blobs missing from server memory; zero when server memory already has those blob SHAs.
- Required browser calls on warm IndexedDB: ideally zero projection calls for cached blob/schema identities, plus no collection-index call if collection index is cached for the active tree identity.

For first open with draft:

- Required: active ref identity and active tree; main ref identity/tree only if the initial screen needs main/draft comparison.
- Required blob reads: root config, config files, block configs, navigation manifest for each snapshot actually needed.
- Required draft summary: one compare call and branch metadata, cached for a short TTL.

For freshness unchanged:

- Required: active ref identity comparison.
- Not required on every check: parsing every config, re-reading every config blob, or recomputing singleton states.

## Architecture Implication

The shared core should model stable content identities and route data needs: repo ref identity, tree identity, config identity, collection index identity, blob SHA, projection schema identity, document identity, and navigation manifest identity.

GitHub-specific code should own how those identities are obtained and refreshed: branch/commit/tree/blob APIs, compare commits, draft branch semantics, and Contents API writes.

The next architecture decision should focus on reducing cross-route duplication and cache coordination, not replacing GitHub API primitives. The GitHub API usage is acceptable when requests are identity-driven and deduped; it becomes the bottleneck when routes repeatedly re-bootstrap, rehydrate already-known blobs, or broaden small workflow needs into whole-site cache work.
