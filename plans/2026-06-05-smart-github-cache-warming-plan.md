# Smart GitHub Cache Warming Plan

## Summary

Replace the current linear GitHub warmer with a priority cache queue. The queue should warm top-level navigation targets early, progressively cache full documents in the background, promote hovered/focused/clicked routes ahead of passive work, and show only a quiet header progress bar for large or slow cache jobs.

Add a GitHub-mode `Clear cache` menu action so fresh warming can be tested without Private Browsing or repeated sign-in.

## Key Changes

- Add a queue-backed cache API near `githubRepositoryCache`.
  - Task kinds: `blockRegistry`, `singletonDocument`, `collectionIndex`, `collectionProjectionBatch`, `itemDocument`.
  - Priority tiers: foreground route, user intent hover/focus/pointerdown, top-level navigation warm, passive item warm.
  - Deduplicate by stable task key and allow priority promotion of queued/in-flight work.
  - Use low background concurrency, default `1`, and pause/yield between passive tasks with idle scheduling.

- Extend cached records.
  - Add singleton document caching keyed by repo/ref/tree identity plus blob SHA/config slug.
  - Keep item documents keyed by blob SHA/config slug.
  - Add cache records for GitHub content component/block support data so page/item rendering support can be considered warmed.
  - Make `clearRepoRef` clear snapshots, indexes, projections, documents, singleton docs, and block/support data for the active repo/ref.

- Change warm order.
  - First warm block/support data needed by page/item rendering.
  - Then warm all top-level singleton documents and all collection indexes.
  - Then warm collection projections for sidebar/collection navigation.
  - Then slowly warm all full collection item documents in the background.
  - Hover/focus/pointerdown on sidebar and collection links promotes that exact singleton/item route to the front.

- Update route loads.
  - Singleton page view/edit loads should read cached singleton content before calling `/api/repo/page-view`.
  - Item view/edit loads should reuse cached full item documents and promote/follow queued item-document work instead of starting duplicate fetches where possible.
  - Successful `/api/repo/page-view` and `/api/repo/item-view` responses should seed the relevant document caches.

- Update UI.
  - Replace detailed status text with a thin header progress bar.
  - Show only when estimated queue work is large, default threshold `25` tasks, or when warming lasts longer than `800ms`.
  - Progress represents the full queue, including singleton docs, item docs, and block/support data.
  - Do not show per-kind details in normal UI.
  - Add `Clear cache` to the GitHub site menu; on click, clear current repo/ref cache, reset progress, restart warming, and show a toast.

## Test Plan

- Cache unit/browser tests:
  - Queue orders top-level singleton/index/projection work before passive item docs.
  - Hover/focus promotion moves a route task ahead of passive work.
  - Duplicate foreground and queued work share the same task/result.
  - Full progress does not complete until singleton docs, item docs, projections, indexes, and block/support data are cached.
  - `clearRepoRef` clears all active repo/ref cache stores, not just snapshots/indexes.

- Route tests:
  - Warm singleton route avoids `/api/repo/page-view`.
  - Warm item route avoids `/api/repo/item-view`.
  - First server responses seed browser cache.
  - Existing local-mode behavior is unchanged.

- UI/browser tests:
  - Progress bar is hidden for small/fast queues.
  - Progress bar appears for a large GitHub site and disappears after completion.
  - `Clear cache` menu action resets cache state and restarts warming.
  - Existing collection route cache behavior still passes.

## Assumptions

- Clear cache is scoped to the current GitHub repo/ref, including draft refs, and is not shown in local mode.
- Background full-item warming uses low concurrency by default; user intent always promotes work ahead of passive warming.
- Header progress bar is the only normal user-facing cache UI.
- "Site cached" means full content documents and rendering support data are warmed, not only collection navigation metadata.
