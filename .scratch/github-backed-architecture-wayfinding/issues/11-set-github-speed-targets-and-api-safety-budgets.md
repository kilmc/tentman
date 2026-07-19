# Set GitHub speed targets and API safety budgets

Type: research
Status: resolved
Blocked by: 07

## Question

What concrete user-facing speed targets and GitHub API safety budgets should constrain the GitHub-backed speed/unification architecture?

## Evidence that counts as done

- Use the baseline performance ticket and request fanout/cache lifecycle decisions to set initial target timings for first repository open, collection landing/sidebar readiness, warm collection reload, item open/edit readiness, freshness checks, and publish/draft summary.
- Define API safety budgets for foreground GitHub requests, projection/blob batching, background warming, freshness polling, draft comparison, and server route fallbacks.
- State how the GitHub adapter should handle rate-limit risk: concurrency caps, inflight dedupe, backoff, foreground/background priority, idle warming limits, and failure/status surfacing.
- Identify which budgets are hard constraints for the first implementation spec versus measurement targets to refine after instrumentation.
- Identify any instrumentation gaps that must be closed before implementation can be judged against the budgets.

## Resolution should decide

The performance and API-safety guardrails that the eventual implementation spec must satisfy.

## Answer

Decision: the GitHub-backed speed/unification architecture should be constrained by explicit user-facing readiness targets and GitHub API safety budgets. These budgets belong to the GitHub adapter and the route/workflow capability layer contract, not to a shared low-level local/GitHub repository core.

The first implementation spec should treat the targets below as guardrails for a Theresa-sized repository: draft branch present, around 55 project items, around 222 news items, hundreds of static assets, visible desktop sidebars, and a normal authenticated GitHub session. The numbers are initial p75 targets for local development and preview-like environments, not permanent product SLOs; instrumentation must refine them once the workflow marks are reliable.

User-facing speed targets:

- First repository open: repository shell, root configs, page list, navigation manifest, and sidebar-ready state within 3s. Draft/page overview status may continue in the background but should produce its first useful summary within 5s. Initial freshness polling and idle warming must not block this ready point.
- Desktop/sidebar-present collection landing: collection header, ordered sidebar/list, and the first visible projection batch should be usable within 3s cold after bootstrap, with no indefinite `Loading items...` state once collection index and visible projections have returned. Full-site cache status may continue updating separately.
- Warm collection reload: cached collection navigation should render within 750ms, and matching IndexedDB `treeSha + config/schema identity + blobSha` projection records should cause zero foreground GitHub calls for the collection index or first visible projections. A due freshness check may run, but it must not gate visible readiness.
- Item open/edit readiness: route/form shell and item document should be ready within 2.5s cold and 1s warm when the collection index is available. Rich editor interactivity is a second readiness mark: target 4s cold and 2s warm, because editor startup is partly outside the GitHub API/cache architecture.
- Freshness polling: unchanged checks should complete in 750ms and should be identity-only. They must not parse configs, read config blobs, rebuild singleton states, or load full bootstrap context. Changed-path derivation may take up to 2s in the background, after which affected cache records should be marked stale without blocking the active page.
- Publish/draft summary: draft summary should show the scoped changed-page/item summary within 4s for small drafts such as the baseline one-item draft. Larger drafts should show progress/status by 2s and avoid broad full-site document comparison unless the compare result proves a scoped review is impossible.

Foreground API budgets:

- First repository open may perform one active-ref identity read, one recursive tree read for the active ref, and one read per required config/root/block/navigation blob for that ref. If a managed draft is active, the spec may allow one main-ref identity/tree read only when first-screen draft comparison genuinely needs it. It should not immediately repeat `/api/repo/configs` for freshness after bootstrap.
- Collection landing may perform at most one collection-index endpoint call and one foreground projection endpoint call for the visible slice. The visible projection batch remains capped at 30 blob SHAs. It must perform zero item-view/page-view/full-document calls for mere collection landing readiness.
- Warm collection reload has a hard foreground GitHub budget of zero index/projection/blob calls when cached identities match. Any miss must log the exact miss reason: missing record, stale tree identity, schema identity mismatch, blob SHA mismatch, or cache read failure.
- Item open may perform at most one collection-index call if missing, one item-document route miss, and one block-support miss if block support is not already cached. Tag suggestion or existing-item hydration must not read every collection item in the foreground; it should be deferred, bounded, or satisfied from existing projections.
- Freshness unchanged may perform only active-ref identity calls. With the current Git Data shape, that means branch/commit identity only; no tree/blob/config/state work. Changed freshness may load at most one current tree and, if needed, one previous tree to compute changed paths, with deleted/missing previous trees handled as stale/error status rather than a foreground 500.
- Publish/draft summary may perform one compare-commits call plus necessary branch metadata, then read only changed before/after documents. The normal scoped path budget is two document reads per changed content file that needs field-level review. Full collection/site fallback is not allowed on the normal path and must be surfaced as a degraded/unsupported review path when unavoidable.
- Server route fallbacks to legacy `content-cache` should be zero on normal GitHub collection, singleton, item, config-state, and publish summary paths. If a fallback fires, it must be logged with route, slug, source, and reason so it can be judged as compatibility behavior rather than hidden performance cost.

Background and batching budgets:

- Foreground work always outranks background work. Cache tasks should keep the current single-running-task browser queue shape or an equally conservative equivalent, with priority lanes for foreground, intent/hover, top-level warm, and passive warm.
- Projection/blob batching should keep a visible foreground cap of 30 blobs and a background batch cap of 20 blobs. Server-side blob hydration should add an explicit GitHub concurrency cap, ideally no more than 5-10 concurrent `git.getBlob` calls per repository/ref, plus in-flight dedupe by blob SHA.
- Background warming may ensure block support, singleton documents, collection indexes, and projection batches only after the active route is ready and the browser is idle. It must pause on navigation, identity changes, foreground misses, rate-limit pressure, and visible errors.
- Full-site full-document warming should not run by default during first open or collection landing. If retained as an idle feature, the first spec should cap each idle run to 50 item documents or 10 MB, whichever comes first, even though the storage budget may remain 50 MB / 2,500 records. Opened, hovered, or explicitly refreshed items can bypass that idle-run cap as foreground/intent work.
- Inventory size is not itself a request budget. A `2/450` cache status may be accurate inventory accounting, but it must not imply hundreds of queued GitHub calls competing with visible readiness.
- In-flight dedupe is a hard constraint at three levels: browser cache task key, browser endpoint request for the same route record, and server GitHub blob/ref/tree reads. Duplicate foreground endpoint calls for the same identity should be treated as a budget failure.

Rate-limit and failure safety:

- The GitHub adapter should record rate-limit headers, remaining quota, reset time, retry-after, abuse/secondary-limit responses, status codes, and request operation names for Octokit calls, including direct source-layer calls (`repos.getBranch`, `git.getCommit`, `git.getTree`, `git.getBlob`) that are not currently covered by `github.repository.request`.
- Background warming should stop when remaining core quota drops below 500, when secondary rate-limit signals appear, or when a foreground request receives 403/429/rate-limit style errors. Foreground work may continue cautiously, but it should surface a clear status instead of allowing repeated hidden retries.
- Retry/backoff should respect `Retry-After` when present. Otherwise use capped exponential backoff for GitHub 403/429/5xx responses, with background retries starting around 1s and capping around 60s. Foreground route retries should be limited and visible; a failed route record should mark that record `error` and allow manual retry.
- Tree/blob 404s during freshness should not produce the desktop baseline's stuck collection behavior. Missing/deleted previous identity should become stale/error freshness status with recovery instructions, not a blocking 500 that leaves visible collection readiness unresolved.
- Failure/status surfacing is part of the budget: foreground route records need ready/error/degraded states, background cache status needs counts by target kind, and publish/draft summary needs scoped/fallback/degraded review status.

Hard constraints for the first implementation spec:

- Separate initial repository open, collection landing readiness, item edit readiness, freshness, publish summary, and idle warming as distinct workflows with distinct budgets.
- Do not use broad `/api/repo/configs` bootstrap as the unchanged freshness check.
- Do not let `/api/repo/config-states`, `/api/repo/form-config`, page-view, item-view, or legacy collection-items re-enter full bootstrap for narrow route-data needs when identity is unchanged.
- Keep collection landing foreground work to collection index plus one visible projection batch.
- Keep warm reload zero-call when identities match.
- Keep foreground and background queues prioritized, deduped, cancelable on identity change, and rate-limit-aware.
- Prevent full-site document warming from competing with visible collection or item readiness.
- Log and budget every legacy fallback on normal GitHub paths.

Measurement targets to refine after instrumentation:

- The exact first-open split between app shell, page overview summary, and draft summary.
- The rich-editor readiness target, because editor initialization is not purely a GitHub adapter problem.
- Publish summary timing for medium and large drafts, because the baseline only had one changed item and noisy route logs.
- The best server-side blob concurrency cap, which should be tuned against real latency and rate-limit behavior after Octokit source-layer instrumentation exists.
- Full-site idle warming caps, which should be revisited after measuring how often users benefit from prewarmed full documents versus projection-only warming.

Instrumentation gaps that must close before implementation can be judged:

- Add workflow readiness marks for first repository open, desktop collection landing, warm reload, item route shell, rich editor interactive, freshness start/end, publish summary first status, and publish summary complete.
- Add a browser fetch/request trace with workflow id, route id, foreground/background priority, cache task key, duplicate/deduped flag, and endpoint duration.
- Extend GitHub request instrumentation to direct Octokit source-layer calls: branch, commit, tree, blob, compare, Contents reads/writes, response status, rate-limit headers, retry-after, and cache/inflight-dedupe result.
- Log IndexedDB cache hit/miss reason for snapshots, collection indexes, projections, item documents, singleton documents, and block support.
- Log projection batch composition: requested blob count, network blob count, server blob-cache hits, server in-flight dedupe hits, and schema identity.
- Log route-data fallback source and reason for page view, item view, collection navigation, config states, publish review, and preview/draft filename resolution.
- Add budget assertions to browser or integration tests for the critical workflows: no duplicate config-states loop, no warm-reload projection call when projections are cached, no full-document warming during collection landing, and no foreground freshness bootstrap on unchanged identity.

No new wayfinding ticket is needed from this answer. The instrumentation gaps are now concrete acceptance criteria for the eventual implementation/spec, not a separate unresolved architecture decision.
