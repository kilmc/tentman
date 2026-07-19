# Explain cache lifecycle and staleness cost

Type: research
Status: resolved
Blocked by: 01

## Question

Is GitHub-backed slowness caused by cache design, cache misses, cache invalidation, freshness checking, background warming, or fallback paths that bypass the cache?

## Evidence that counts as done

- Map the lifecycle of `githubRepositoryCache` from bootstrap through IndexedDB snapshot storage, collection index storage, projection hydration, full document caching, block support, inventory records, idle warming, freshness checks, and invalidation.
- For the slow workflows from [Baseline current GitHub workflow performance](01-baseline-current-github-workflow-performance.md), identify which cache state they were in and which cache records were present or missing.
- Document when route loads use cache-first behavior versus server API fallback, especially `/api/repo/page-view`, `/api/repo/item-view`, `/api/repo/collection-index`, `/api/repo/collection-projections`, `/api/repo/configs`, and `/api/repo/config-states`.
- Check whether cache freshness uses identity (`headSha`, `treeSha`, blob SHA, schema identity) consistently or falls back to TTL/route invalidation in ways that force slow work.
- Identify whether the current cache work is duplicated with server-side `repository-data` caches or legacy `content-cache`.

## Resolution should decide

Whether the next architecture should focus on cache lifecycle/coherency, fallback removal, server/client cache boundary changes, or something outside caching.

## Answer

Full research note: [Explain cache lifecycle and staleness cost](../research/03-explain-cache-lifecycle-and-staleness-cost.md).

Decision: the next architecture should focus first on cache lifecycle/coherency and the server/client route-data boundary, with fallback removal as the next supporting move. The GitHub mode already has the right identity ingredients (`headSha`, `treeSha`, blob SHA, schema identity, and changed paths), but those identities are spread across browser IndexedDB, server `repository-data`, and legacy `content-cache` instead of forming one narrow lifecycle.

The slow desktop/sidebar workflows are best explained by broad route re-entry and cache-miss behavior: bootstrap hydrates the browser cache, then freshness immediately reuses `/api/repo/configs`; `/api/repo/config-states` also loads selected repo bootstrap context; item/singleton misses fall back to broad `/api/repo/item-view`, `/api/repo/page-view`, or `/api/repo/form-config`; and idle warming can expand inventory from the visible collection slice into whole-site projection and document targets.

Focus:

- Split cheap GitHub identity freshness from full config/bootstrap loading.
- Keep collection index/projection as the model for narrow cache-miss endpoints, then apply the same shape to singleton documents, item documents, and block support.
- Keep full-document site warming idle and visibly separate from foreground collection readiness.
- Constrain and eventually retire legacy `content-cache` fallbacks after route-data coverage is explicit.

No new tickets were added. The follow-up decisions are already covered by [Trace route data assembly and legacy fallbacks](04-trace-route-data-assembly-and-legacy-fallbacks.md) and [Inventory local and GitHub workflow duplication](05-inventory-local-and-github-workflow-duplication.md).
