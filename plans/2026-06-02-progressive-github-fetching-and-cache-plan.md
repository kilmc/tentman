# Progressive GitHub Fetching And Cache Plan

## Context

Local mode feels responsive because Tentman can read the workspace like a filesystem. GitHub-backed live mode currently treats GitHub as the same kind of filesystem, but every read has network latency and many operations fan out into multiple API calls. The deployed CMS should instead treat GitHub as a remote sync source: render useful cached data quickly, then reconcile progressively in the background.

## Goals

- Make the first usable screen load with the minimum required GitHub data.
- Keep stale-but-useful repository data available while background refreshes run.
- Avoid repeated tree traversal and full-content reads when a branch/tree identity has not changed.
- Use changed-file indexes to scope draft summaries, sidebar states, and content refreshes.
- Add enough production timing data to prove which changes matter before deeper refactors.

## Current Suspected Bottlenecks

- Config discovery reads `tentman.json`, fetches a recursive tree, then fetches every content config. Block config discovery repeats much of the same work.
- Several `/api/repo/*` endpoints reload the same bootstrap bundle: draft branch, configs, block configs, root config, and navigation manifest.
- The overview summary compares every config against the draft branch, falling back to full main/draft content reads when cheap changed-file matching cannot answer.
- Directory-backed content lists a directory, then reads every matching item file individually.
- Production logs currently do not expose enough endpoint and GitHub request timing to rank these costs confidently.

## Target Model

### 1. Progressive UI Data Loading

Load first:

- session and selected repository
- root config or latest cached root config
- cached config index
- current route config and content
- lightweight draft branch status

Load in the background:

- sidebar state badges
- collection item lists for non-current collections
- overview draft summaries
- content component registry and package blocks
- instruction discovery
- preview/deploy metadata

The UI should prefer cached data with explicit refresh state over blank screens while GitHub work is pending.

### 2. Repository Snapshot Cache

Introduce a coherent snapshot cache keyed by repository, ref, and tree/commit identity instead of independent TTL-only caches.

```ts
type RepositorySnapshot = {
	repoKey: string;
	ref: string;
	headSha: string;
	treeSha: string;
	loadedAt: number;
	rootConfig: RootConfig | null;
	configIndex: ConfigIndex;
	blockConfigIndex: BlockConfigIndex;
	navigationManifest: NavigationManifestState;
};
```

If the branch head/tree identity has not changed, most discovery results can be reused safely. TTL can remain as a fallback, but branch identity should become the primary freshness check.

### 3. Shared Config Discovery

Replace separate content config and block config discovery tree walks with one repository tree read:

- read root config
- read recursive tree once
- classify content config paths and block config paths
- fetch config files concurrently with bounded concurrency
- cache the resulting indexes by tree identity

Longer term, config files could be read through Git blob APIs from tree SHAs rather than `repos.getContent` per path.

### 4. Changed-File Index

For draft branches, compare base to draft once and build an index:

```ts
type ChangedFileIndex = {
	baseRef: string;
	headRef: string;
	mergeBaseSha?: string;
	files: ChangedFile[];
	byConfigId: Map<string, ConfigChangeScope>;
};
```

Use this index to answer:

- which configs have any draft changes
- which collection items changed for directory-backed collections
- whether navigation manifest changed
- whether root/config files changed and therefore discovery must refresh

This lets `/api/repo/pages-summary` avoid comparing every config and avoid full content reads except for ambiguous file-backed collections or rename cases.

### 5. Route-Level Cache Strategy

- `/api/repo/configs`: return cached snapshot data immediately when branch identity matches; refresh discovery only when needed.
- `/api/repo/page-view`: prioritize current config/content and defer block registry when possible.
- `/api/repo/item-view`: avoid reading whole directory collections when changed-file or item-path data can locate a single item.
- `/api/repo/config-states`: run as background/sidebar data, scoped to changed configs where possible.
- `/api/repo/pages-summary`: derive from `ChangedFileIndex`; only fetch content for ambiguous cases.
- `/api/repo/collection-items`: cache collection lists per config/ref/tree identity; refresh only affected collections after writes.

## Implementation Phases

### Phase 0: Production Timing Logs

Ship low-noise logs behind `TENTMAN_TIMING_LOGS` or `VITE_TENTMAN_TIMING_LOGS`.

Capture:

- endpoint duration and route parameters
- GitHub repository operation duration
- config discovery tree/config counts
- block config discovery tree/config counts
- pages summary config/change counts
- collection item result counts
- page/item/form config result counts

### Phase 1: Request-Scoped Bootstrap Context

Ensure a single incoming request does not recompute bootstrap pieces. Centralize bootstrap loading and expose the same promise to nested route helpers.

### Phase 2: Snapshot Cache

Add branch identity reads and cache snapshot data by `owner/repo/ref/headSha/treeSha`. Keep the current TTL caches as compatibility wrappers while migrating callers.

### Phase 3: Single-Pass Discovery

Replace separate content/block tree traversal with one discovery pipeline and one parsed index.

### Phase 4: Changed-File Draft Summary

Build `ChangedFileIndex` once per draft/base pair. Rework pages summary and sidebar state refreshes to use it before falling back to full content reads.

### Phase 5: Progressive UI Loading

Adjust Svelte load functions and layout effects so primary route content is not blocked by overview summaries, config states, non-current collections, or block registry work unless the current screen truly needs them.

### Phase 6: Targeted Invalidations

After writes, invalidate only affected configs/content/navigation state using the changed file paths and write payloads, instead of broad `/api/repo/*` invalidation.

## Open Questions

- Should production timing logs be temporary deploy flags only, or remain available as an admin/debug mode?
- How much stale data should the UI show before labeling it as refreshing?
- Should snapshot caches live only in memory at first, or should Netlify/serverless use an external cache later?
- Can directory content reads use Git tree/blob APIs enough to avoid `repos.getContent` per item?
- Should block registry loading be split from page content loading for view routes?
