# GitHub Cache Inventory Rearchitecture Plan

## Summary

Rebuild the GitHub cache system around a durable cache inventory instead of a queue-first warmer. The user-facing promise is simple: after a site finishes caching, pages and items open immediately from local cache, the progress affordance disappears, and the cache page becomes the place to inspect and manually refresh cached content.

The current smart-warming milestone is committed as:

- `4090ec0 feat(cache): checkpoint smart warming milestone`

This plan assumes we are allowed to replace or substantially reshape the milestone implementation rather than layering hotfixes onto it.

## Product Goals

- First load can be slower if the user immediately opens a page.
- The longer the user stays in Tentman, the more of the active site becomes locally cached.
- Once a page or item is cached, opening it should render from IndexedDB without waiting on GitHub.
- Once the active site is fully cached, the normal workspace progress bar should disappear.
- The cache page should show what is actually cached, not just the current queue state.
- The cache page should allow refreshing all cache entries, stale entries, collections, singletons, and individual items.
- Freshness should be checked automatically, but gently: on a new session, then after an interval such as 5 minutes, then with backoff.
- Draft branch content should be treated as the active site state, not as a separate full cache alongside main.

## Definition Of Fully Cached

For a normal-sized site, "fully cached" means every cacheable target required to open the active workspace instantly is fresh in IndexedDB:

- repository snapshot and navigation metadata
- block/rendering support data
- every singleton document
- every collection index
- every collection item projection
- every collection item full document

Tentman should not cache large binary site assets as part of this feature unless a later design explicitly opts into asset caching. This cache is for content, schema, navigation, projections, and render-support metadata.

## Storage Limit

Use a per active workspace cache budget instead of an unbounded promise:

- Default full-document budget: `50 MB` serialized content per repository workspace.
- Default record count budget: `2,500` full content documents.
- Keep snapshot, indexes, projections, and inventory outside the document count, because they are required for management and are usually small.
- If a site exceeds either budget, the cache is considered `budget-limited`, not fully cached.
- In `budget-limited` mode, cache all singletons, all collection indexes, all projections, and as many full item documents as fit using the warm priority policy.
- The cache page should clearly show the limit, what was cached, and which items are not cached because of the limit.
- Add manual "Cache all anyway" later only if we decide users should be allowed to override the budget per site.

This keeps the default useful for very large sites without making "fully cached" silently dishonest.

## Architecture

### 1. Durable Inventory Is The Source Of Truth

Add a cache inventory store in IndexedDB. The inventory owns the site plan and cache state. The queue only executes inventory targets.

Inventory records should include:

- `targetId`
- `targetType`: `snapshot`, `blockSupport`, `singletonDocument`, `collectionIndex`, `collectionProjection`, `itemDocument`
- `repoFullName`
- `workspaceKey`
- `activeRef`
- `mainHeadSha`
- `mainTreeSha`
- `draftHeadSha`
- `draftTreeSha`
- `path`
- `configSlug`
- `itemId`
- `blobSha`
- `schemaIdentity`
- `dependencyIdentity`
- `status`: `fresh`, `missing`, `stale`, `refreshing`, `error`, `skipped-budget`
- `lastCachedAt`
- `lastCheckedAt`
- `estimatedBytes`
- `error`

The cache page, header progress, and queue should all derive from inventory.

### 2. Queue Becomes An Executor

The queue should:

- enqueue only inventory targets
- dedupe by `targetId`
- promote target priority on hover, focus, pointerdown, and foreground navigation
- treat repeated hover as a priority bump or no-op
- never redefine total cache progress
- update inventory status as tasks complete or fail

Priority tiers:

- `foreground`: current route cannot render without this target
- `intent`: hovered/focused/pointerdown target
- `visible`: visible collection panel rows
- `topLevel`: singletons and collection indexes
- `background`: remaining full documents

### 3. Plan Before Progress

On app start, Tentman should build or load the inventory before showing any "complete" state.

Flow:

1. Load current bootstrap identity.
2. Hydrate the active workspace snapshot into the cache layer.
3. Load existing inventory for this workspace.
4. If missing or identity changed, rebuild the inventory plan.
5. Mark existing records fresh when their identity still matches.
6. Mark missing/stale records for queued refresh.
7. Start background queue.

Header progress should be based on inventory targets, not queued tasks. It should show only when work is meaningful and hide once no targets are missing/stale/refreshing.

### 4. Drafts Are Active Workspace State

Do not build a completely separate "main cache" and "draft cache" that the user has to reason about.

Expected behavior:

- If no draft branch exists, the active workspace is main.
- If a draft branch exists, the active workspace is the draft branch.
- Tentman should not expose main as a parallel view while a draft exists.
- Cached content records should be reusable across main and draft when the blob SHA and schema identity match.
- The active inventory should represent "main plus draft changes" by comparing the active draft branch against main and marking only changed targets stale or missing.

Implementation direction:

- Extend repository bootstrap identity so the client can know both main and active draft identity when a draft exists.
- Prefer content-addressed cache records for documents and projections:
  - item documents: `repoFullName + blobSha + configSlug + schemaIdentity`
  - singleton documents: move from tree-keyed to blob-keyed once the singleton content path/blob can be resolved
  - projections: already blob/schema oriented
- Keep snapshot/inventory records workspace-specific because navigation, config, and tree membership are workspace state.

### 5. Freshness Checks

Freshness should be automatic but quiet.

Policy:

- Always check on a new browser session.
- Check after 5 minutes of active workspace time.
- If unchanged, back off to 15 minutes, then 30 minutes, then 60 minutes while the session stays open.
- Reset the interval to 5 minutes after any detected change, save, publish, discard, or manual refresh.
- Do not block navigation during checks; use stale-but-known data while checking.

Freshness check result:

- tree/head unchanged: mark inventory checked, no queue work
- tree/head changed: compute changed paths, update active inventory, enqueue affected stale/missing targets
- check failed: keep existing cache usable and surface a quiet error on the cache page/header

### 6. Scoped Invalidation

Map changed paths to inventory targets:

- singleton content path changed: singleton document stale
- collection item path changed: item projection and item document stale
- new/deleted file inside collection directory: collection index stale
- collection config/schema changed: collection index, projections, item documents stale for that collection
- singleton config/schema changed: singleton document stale
- block config/package support changed: block support stale and rendering-dependent pages need revalidation
- navigation manifest/root config changed: snapshot/navigation targets stale
- publish/discard: active workspace identity changes, rebuild inventory against the resulting active branch state

### 7. Cache Page

Replace the current queue-progress page with a real cache management page.

Layout:

- compact header with repo, active branch, head/tree, last checked
- summary strip:
  - cached targets
  - stale targets
  - errors
  - storage used against budget
- actions:
  - Refresh stale
  - Refresh all
  - Clear cache
- table with grouped rows:
  - Site support
  - Singleton pages
  - Collections
  - Collection items

Row columns:

- label
- type
- status
- path
- cache identity, usually abbreviated blob/tree SHA
- size
- last cached
- action button

Normal UI should not explain how caching works. The cache page can be technical because it is a management/debug surface.

## Implementation Phases

### Phase 1: Inventory Foundation

- Add IndexedDB inventory store and typed inventory APIs.
- Add functions to read durable cache records and calculate target freshness.
- Build an inventory from current bootstrap + discovered configs + collection indexes.
- Add unit/browser tests for inventory creation and status projection.

### Phase 2: Queue Refactor

- Replace ad hoc queue task keys with inventory target IDs.
- Make promotion update existing targets.
- Remove queue counters as the source of progress.
- Ensure collection hover promotes collection index/projection visibility only, not every full document.
- Ensure item hover promotes only that item document.

### Phase 3: Route Fast Paths

- Keep route loads cache-first.
- Make singleton document cache identity blob-based rather than tree-based.
- Ensure block support is represented as an explicit inventory dependency.
- On foreground miss, fetch target, write durable cache, update inventory, render.

### Phase 4: Cache Page Redesign

- Replace `githubCacheWarmDebugStatus` usage with inventory-derived store data.
- Add refresh all/stale/item actions.
- Show budget-limited state and skipped rows.
- Keep design dense, utilitarian, and table-first.

### Phase 5: Freshness And Draft Overlay

- Extend bootstrap identity for main + active draft.
- Add session freshness scheduler with 5-minute first interval and backoff.
- Add changed-path diffing from snapshot/tree entries.
- Apply scoped inventory invalidation.
- Treat active draft branch as the workspace state while still reusing blob-addressed records from main.

### Phase 6: Cleanup

- Remove obsolete warm-run debug fields once the new cache page is inventory-backed.
- Remove old queue-progress assumptions from tests.
- Keep focused regression coverage around:
  - stable progress totals
  - refresh does not show false `0/N` restart when durable records exist
  - repeated singleton hover does not enqueue duplicate work
  - cached singleton route opens without page-view fetch
  - cached item route opens without item-view fetch
  - cache page rows reflect IndexedDB state after reload

## Open Decisions

- Whether the storage budget should be configurable per site in settings or only visible on the cache page.
- Whether manual "Cache all anyway" should ship in V1 or wait until a user actually needs it.
- Whether cache inventory should track approximate serialized bytes only, or use `navigator.storage.estimate()` as a secondary display value.

## Initial Recommendation

Start with Phase 1 and Phase 2 in one branch. Do not redesign the cache page until inventory exists, because the page needs to be a consumer of durable state, not another status model.
