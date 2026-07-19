# Trace route-data assembly and legacy fallbacks

Type: research
Status: resolved
Blocked by: 01

## Question

Where do route loads and API endpoints still assemble page, item, collection, state, block, and draft data through duplicated or legacy paths instead of one repository-data route boundary?

## Evidence that counts as done

- Trace how `apps/web/src/lib/server/repository-data/route-data.ts` is used by `/api/repo/page-view`, `/api/repo/item-view`, `/api/repo/collection-items`, and `/api/repo/config-states`.
- Identify every observed fallback from `repository-data` to `getCachedContent`/legacy content-cache for the baseline workflows.
- Include page load behavior in `apps/web/src/routes/pages/[page]/+page.ts` and `apps/web/src/routes/pages/[page]/[itemId]/+page.ts`, including cache-first branches and server fallback branches.
- Include `apps/web/src/lib/server/repo-config-bootstrap.ts` and `/api/repo/configs` because bootstrap freshness may dominate perceived route performance.
- Document what data each route actually needs versus what it currently fetches or assembles.

## Resolution should decide

Whether `.scratch/codebase-health/issues/02-deepen-repository-route-data.md` is directly on the critical path for GitHub speed/unification, and which route-data responsibilities are already deep enough versus still leaking.

## Answer

Research artifact: [Trace Route-Data Assembly and Legacy Fallbacks](../research/04-trace-route-data-assembly-and-legacy-fallbacks.md).

[Deepen repository route data](../../codebase-health/issues/02-deepen-repository-route-data.md) is directly on the critical path for GitHub speed/unification, but the scope should be sharpened: the urgent work is not a wholesale rewrite of repository-data primitives or immediate removal of every legacy `getCachedContent` fallback. The common GitHub paths already prefer deep primitives for collection indexes/projections, singleton documents, singleton states, and item document resolution.

The leak is higher up: page/item endpoints, collection/config-state endpoints, page loads, and `githubRepositoryCache` still assemble route views across snapshots, bootstrap freshness, block support, navigation manifests, endpoint names, browser-cache persistence, and legacy fallback awareness. Route-data should deepen upward into route-sized page-view, item-view, collection-navigation, and config-states assemblers while keeping the existing repository-data primitives underneath.

Observed legacy fallbacks are concentrated in `apps/web/src/lib/server/repository-data/route-data.ts`: collection navigation, page view content, singleton config states, and collection item resolution all try repository-data first and then fall back to `getCachedContent`. A related draft/preview path in `apps/web/src/lib/server/preview.ts` also falls back to `getCachedContent` for directory item filename resolution. These fallbacks are not the main measured GitHub bottleneck; duplicated route assembly and full bootstrap use for narrow endpoints are the critical path.

Responsibilities already deep enough:

- Repository snapshot identity and GitHub tree/blob source helpers.
- Collection indexes and collection projection hydration.
- Singleton document loading and singleton state summaries.
- Collection item document resolution for direct filename/index/route cases.

Responsibilities still leaking:

- Page-view and item-view payload assembly, including block support and navigation manifest.
- Collection navigation split across `/api/repo/collection-items`, `/api/repo/collection-index`, `/api/repo/collection-projections`, route-data, and browser cache.
- Config-state endpoint loading full bootstrap before a narrow state summary.
- Bootstrap freshness through `/api/repo/configs` dominating parent data hydration and cache checks.
- Browser cache hard-coding endpoint sequences and route-level fallback decisions.

Decision: [Deepen repository route data](../../codebase-health/issues/02-deepen-repository-route-data.md) should stay on the critical path, but as a route-boundary unification task that follows the cache lifecycle/coherency decision from [Explain cache lifecycle and staleness cost](03-explain-cache-lifecycle-and-staleness-cost.md), not as a low-level rewrite of the repository-data primitives.
