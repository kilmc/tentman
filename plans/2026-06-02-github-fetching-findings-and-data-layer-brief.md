# GitHub Fetching Findings And Data Layer Brief

## Purpose

This brief records what the production timing logs showed after enabling Tentman timing instrumentation on the deployed GitHub-backed app. It is not a patch plan. The evidence points to a foundational data-layer problem: the CMS currently treats GitHub like a local filesystem and repeatedly brute-forces whole content surfaces. The next architecture plan should design a cohesive fetching, caching, indexing, and invalidation layer that future features use by default.

## High-Level Finding

The biggest performance issue is not config discovery. Config discovery is noticeable on cold loads, but the dominant cost is full directory-backed collection loading. Large collections are loaded by listing a directory and then reading every markdown file individually. Multiple routes can load the same collection independently, causing repeated fanout.

The current shape is safe but inefficient:

- Page views load full collection content.
- Collection navigation panels load full collection content.
- Item views load full collection content to find one item.
- Summary/sidebar/background routes can compete with primary route content.
- Cache entries are short-lived and fragmented by concern rather than coordinated by repository/ref/tree identity.

This means each new feature that asks for content risks becoming another full GitHub traversal unless all future reads go through a smarter shared layer.

## Evidence From Logs

The sampled logs contained 905 timing events.

### Slowest User-Facing Endpoints

- `api.repo.collection-items` for `news`: `4904.1ms`
- `api.repo.page-view` for `news`: `4093.7ms`
- `api.repo.collection-items` for `projects`: `2375.1ms`
- `api.repo.item-view` for `projects`: `1691.8ms`
- `api.repo.page-view` for `projects`: `1531.3ms`

### GitHub Operation Shape

- `github.repository.request` events: `834`
- `readTextFile` calls: `789`
- `readTextFile` average duration: `1382.6ms`
- Slowest `readTextFile`: `3821.2ms`
- `listDirectory` calls: `9`
- `discoverConfigs` calls: `7`, average `810.7ms`
- `discoverBlockConfigs` calls: `5`, average `752.3ms`

The total measured time for `readTextFile` operations was far larger than every other operation. Because many reads run in parallel, that total is not wall-clock time, but the endpoint wall-clock timings still show the same issue: big collections take seconds.

### Directory Hotspots

- `src/content/news`: `444` `readTextFile` calls, average `1952.7ms`, max `3821.2ms`
- `src/content/projects`: `330` `readTextFile` calls, average `668.6ms`, max `1486.1ms`

The `news` collection reported `222` items, and the logs showed `444` reads under `src/content/news`, which means the full collection was loaded at least twice in the captured session.

### Config Discovery Context

Config discovery is not free, but it is not the main culprit:

- Recursive tree entry count: `1795`
- Content config path count: `5`
- Block config path count: `1`
- Config discovery cold duration: roughly `650-900ms`
- Block config discovery cold duration: roughly `700-870ms`

This still deserves improvement, especially because content and block discovery both traverse the same tree, but it should not distract from the larger collection read problem.

## Architectural Diagnosis

Tentman currently lacks a shared remote data layer with these responsibilities:

- differentiating lightweight indexes from full content
- resolving a single item without loading a whole collection
- caching by repository/ref/tree identity
- coordinating concurrent requests across routes
- deduping repeated reads across page view, collection panel, item view, and background state
- scoping invalidations to changed files/configs
- making background reads lower priority than primary route data

Instead, route handlers and helpers ask repository backends for full documents. That was reasonable for local mode and early GitHub support, but it is the wrong abstraction for a remote Git provider.

## Design Mandate For Next Plan

Do not approach this as a set of quick endpoint patches. The next plan should define a durable GitHub-backed data access layer that becomes the required path for future features.

The desired system should be:

- **Fast by default**: primary route data should load before background surfaces.
- **Index-first**: collection lists, item labels, item paths, navigation, and draft status should use lightweight indexes where possible.
- **Content-lazy**: full markdown/frontmatter parsing should happen only for the current item/page or explicit preview/review needs.
- **Change-aware**: draft/base changed files should decide which configs/items need refresh.
- **Cache-coherent**: cache keys should use repository, ref, commit/tree identity, and content path rather than only short TTLs.
- **Feature-safe**: future features should consume this layer instead of reaching directly into `RepositoryBackend` for brute-force reads.
- **Progressive**: the UI should render useful cached/stale data while background refreshes reconcile.

## Likely Layer Responsibilities

### Repository Snapshot Layer

Owns branch/ref metadata, tree identity, root config, config indexes, block config indexes, and navigation manifest. It should avoid repeated recursive tree traversal and provide a stable cache identity.

### Collection Index Layer

Owns lightweight collection summaries:

- item id
- route/slug
- filename/path
- label fields needed by navigation
- grouping/order metadata
- source config id/path

It should support loading collection navigation without reading every full markdown body.

### Item Resolver Layer

Resolves an item route/id to a file path or file-backed array location. Directory-backed item view should read one file, not the whole directory.

### Content Document Layer

Loads full content only when necessary. For directory-backed collections, it should support paginated or scoped reads rather than assuming every caller needs the entire collection.

### Draft Change Index Layer

Compares base to draft once, then maps changed files to affected configs/items. Pages summaries and sidebar badges should use this before falling back to full content reads.

### Request Coordinator

Dedupes in-flight work across simultaneous endpoint calls and assigns priority:

- primary route content
- current collection index
- sidebar state/background summaries
- non-current collection prefetch

## Immediate Questions For The Next Plan

- What is the public API for this layer, and which existing modules should no longer call `RepositoryBackend` directly?
- How should local mode fit: same interface with local implementations, or GitHub-only first with an adapter boundary?
- What minimum collection index fields are needed for sidebar navigation, item labels, groups, and review summaries?
- How should file-backed collections be indexed when a single JSON file contains many items?
- Can GitHub tree/blob APIs replace most `contents/{path}` calls?
- What should be cached in memory only, and what might need durable/shared storage later?
- How should writes update indexes optimistically and invalidate precise cache entries?
- Which route should be refactored first to prove the architecture without patching around it?

## Constraints

- Preserve correctness and current editing behavior.
- Keep route handlers thin.
- Avoid feature-specific shortcuts that future work will bypass.
- Avoid broad invalidation after writes when the changed file paths are known.
- Keep instrumentation available while redesigning so each phase can be measured.
