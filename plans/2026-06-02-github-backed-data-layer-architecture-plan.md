# GitHub-Backed Data Layer Architecture Plan

## Purpose

Tentman needs a foundational data access layer that treats GitHub as a remote content source, not as a low-latency filesystem. Production timing showed the dominant bottleneck is full directory-backed collection loading: in one sampled session, `news` had 222 items and was read at least twice, contributing to 789 `readTextFile` calls. Page view, item view, collection-items, draft status, pages summary, and sidebar state can all cause or amplify this fanout.

This plan defines the durable architecture future features should use. It is not an endpoint quick-fix plan. The target is a shared, index-first, content-lazy, cache-coherent, change-aware data layer for both local and GitHub-backed modes.

## Current Architecture Findings

### Repository Backends

`RepositoryBackend` is the current low-level abstraction in `apps/web/src/lib/repository/types.ts`. It exposes filesystem-shaped primitives:

- `discoverConfigs()`
- `discoverBlockConfigs()`
- `readRootConfig()`
- `readTextFile(path, options)`
- `listDirectory(path, options)`
- write/delete/batch primitives
- `fileExists(path, options)`

The GitHub implementation in `apps/web/src/lib/repository/github.ts` maps these to GitHub Contents and Git APIs. It has short TTL caches for root config and block configs, but not a coherent repository snapshot. `discoverConfigs()` still performs its own root config read, recursive tree read, and per-config content reads. `discoverBlockConfigs()` repeats much of the same discovery work, though it is TTL-cached at the backend level.

The local implementation in `apps/web/src/lib/repository/local.ts` has a discovery cache and a `LocalDiscoverySignature` for persisted browser cache validity. Local mode is fast enough because reads are from the File System Access API, but it still uses the same whole-document shape and should adopt the same higher-level model for correctness and feature parity.

### Content Adapters

`apps/web/src/lib/content/service.ts` dispatches to file and directory adapters.

For file-backed content, `apps/web/src/lib/content/adapters/file.ts` reads one file. Singleton pages return one record. File-backed collections read one JSON/Markdown file, extract the configured array, and normalize item ids.

For directory-backed collections, `apps/web/src/lib/content/adapters/directory.ts` currently does this in `fetchDirectoryContent()`:

1. Resolve content directory and template.
2. `listDirectory()`.
3. Filter matching content files.
4. `Promise.all()` every matching file through `readTextFile()`.
5. Parse every full body/frontmatter record.
6. Normalize runtime ids.

This is correct but too expensive for GitHub. It is the root cause behind page view, item view, collection navigation, and draft comparison loading hundreds of files.

### API Routes

The thin routes are mostly good as HTTP wrappers, but they call helpers that still force whole content reads.

- `/api/repo/configs` loads configs, block configs, root config, navigation manifest, and active draft branch through `loadSelectedGitHubRepoConfigs()`.
- `/api/repo/page-view` loads the selected config, then `getCachedContent()` for the whole content document, then block registry data.
- `/api/repo/item-view` loads `getCachedContent()` for the whole collection, then finds one item in memory. It also loads navigation manifest and block registry data.
- `/api/repo/collection-items` loads bootstrap context, then `getCachedContent()` for the whole collection, then derives navigation items.
- `/api/repo/config-states` loads every config with top-level state through `getCachedContent()`.
- `/api/repo/pages-summary` loops over ordered configs and calls `compareDraftToBranch()` for each.
- `/api/repo/draft-status` calls `compareDraftToBranch()` for the current config.
- `/api/repo/publish-view` builds a review model using changed files, but still fetches full base/draft content for candidate configs.
- `/api/repo/navigation-manifest` write paths still read config files and content in several places to maintain ids and group membership.

### Content Management Navigation And State

`apps/web/src/lib/features/content-management/navigation.ts` derives collection navigation from full `ContentDocument` arrays. It needs item id, route, title, date sort value, collection state, and manual navigation grouping.

`apps/web/src/lib/features/content-management/state.ts` resolves singleton page state and collection item state from content records. Top-level singleton state only needs a small field subset, but currently receives full content. Collection item state can be part of item index metadata when configured.

`apps/web/src/lib/features/content-management/navigation-manifest.ts` maintains manual ordering and stable ids. It caches the manifest for one minute by `backend.cacheKey`, and it has write helpers that call `fetchContentDocument()` in several setup/sync flows. Those write/setup flows can remain deeper operations, but read-side navigation should not need every body.

### Draft Comparison And Review

`apps/web/src/lib/utils/draft-comparison.ts` already has a cheap path: compare base/draft once, inspect changed files, and for directory-backed collections derive created/modified/deleted by changed filenames. It falls back to full base/draft `fetchContentDocument()` for file-backed collections, renames, ambiguous changes, and richer comparisons.

`apps/web/src/lib/features/review-draft/build-review-model.ts` and `candidate-changes.ts` similarly classify changed files by config before building review sections. That idea should become a shared `DraftChangeIndex`, so pages summary, draft status, publish review, sidebar badges, and cache invalidation all reuse one mapping.

### Current Caches

Current caches are helpful but fragmented:

- `config-cache.ts`: TTL and in-flight dedupe by `backend.cacheKey`.
- `content-cache.ts`: TTL and in-flight dedupe by `backend.cacheKey/configSlug/branch`, but the cached value is the full content document.
- `github.ts`: TTL caches for root config and block configs.
- `navigation-manifest.ts`: TTL cache by `backend.cacheKey` and optional ref.
- `draft-comparison.ts`: TTL cache for branch metadata and changed files by owner/repo/base/draft.
- `local-content.ts`: persisted browser cache using `LocalDiscoverySignature`.

The new layer should keep in-flight dedupe, but freshness should primarily come from repository/ref/tree/blob identity, with TTL only as a fallback or branch-head polling policy.

## Target Architecture

Introduce a server-side data layer under a feature-owned boundary, for example:

```text
apps/web/src/lib/server/repository-data/
  source.ts
  snapshots.ts
  discovery.ts
  indexes.ts
  documents.ts
  drafts.ts
  mutations.ts
  request-coordinator.ts
  types.ts
```

Client-side local mode can use equivalent services under the same conceptual API, or a shared package with environment-specific source adapters. The important boundary is that routes and feature helpers ask for data capabilities, not raw backend reads.

## Layer Boundaries

### 1. Repository Source Layer

This is the only layer allowed to call GitHub APIs or `RepositoryBackend` read primitives directly.

Responsibilities:

- Resolve repo identity: backend kind, owner/name or local path label, selected ref, default branch.
- Resolve ref identity: branch name, head commit SHA, root tree SHA.
- Read tree entries and blobs by path/SHA.
- Normalize local and GitHub paths.
- Provide bounded concurrency and in-flight dedupe for identical reads.
- Expose write primitives and mutation results with changed paths.

Public API sketch:

```ts
type RepositoryMode = 'github' | 'local';

type RepositoryRefIdentity = {
  repoKey: string;
  mode: RepositoryMode;
  ref: string;
  headSha: string;
  treeSha: string;
  resolvedAt: number;
};

type RepositorySource = {
  getRefIdentity(ref: string): Promise<RepositoryRefIdentity>;
  getTree(ref: string): Promise<RepositoryTree>;
  readText(path: string, ref: string): Promise<TextBlob>;
  readTextBySha(path: string, sha: string): Promise<TextBlob>;
  fileExists(path: string, ref: string): Promise<boolean>;
  commitChanges(changes: RepositoryFileChange[], options: MutationOptions): Promise<MutationResult>;
};
```

GitHub implementation should prefer Git data APIs where they reduce Contents API fanout:

- `git.getRef` / branch data for commit identity.
- `git.getCommit` for tree SHA.
- `git.getTree({ recursive: true })` for path/SHA/type/size metadata.
- `git.getBlob` or raw blob fetch by SHA for known files.
- Contents API remains acceptable for writes that need SHA or for compatibility until the source layer centralizes blob reads.

Local implementation should compute a synthetic identity:

- `repoKey`: local path label/cache key.
- `ref`: `local`.
- `headSha` / `treeSha`: a stable hash of `LocalDiscoverySignature` plus relevant content paths, or a monotonic local revision counter for in-memory use.
- Tree entries from directory walking.

### 2. Repository Snapshot Layer

Owns branch/ref-scoped bootstrap data:

```ts
type RepositorySnapshot = {
  identity: RepositoryRefIdentity;
  rootConfig: RootConfig | null;
  configIndex: ConfigIndex;
  blockConfigIndex: BlockConfigIndex;
  navigationManifest: NavigationManifestState;
  contentComponentIndex?: ContentComponentIndex;
};
```

Responsibilities:

- Read root config once.
- Read recursive tree once.
- Classify content config paths and block config paths from the same tree.
- Read and parse config blobs through the source layer.
- Normalize stable runtime config identities.
- Read navigation manifest.
- Optionally index content component directories using tree entries before reading component blobs.

Cache key:

```text
snapshot:{repoKey}:{ref}:{headSha}:{treeSha}
```

When branch identity is unchanged, snapshot data is reusable without relying on a one-minute TTL.

### 3. Config Index Layer

`ConfigIndex` should replace ad hoc arrays for route lookup and change mapping:

```ts
type ConfigIndex = {
  configs: DiscoveredConfig[];
  bySlug: Map<string, DiscoveredConfig>;
  byConfigId: Map<string, DiscoveredConfig>;
  byConfigPath: Map<string, DiscoveredConfig>;
  contentTargets: Map<string, ContentTarget>;
};

type ContentTarget =
  | {
      mode: 'file';
      configSlug: string;
      configPath: string;
      contentPath: string;
      itemsPath?: string;
      isCollection: boolean;
    }
  | {
      mode: 'directory';
      configSlug: string;
      configPath: string;
      directoryPath: string;
      templatePath: string;
      templateFilename: string;
      extension: string;
      isMarkdown: boolean;
      isCollection: true;
    };
```

This index should be the source of truth for mapping route slugs, changed paths, and content files to configs.

### 4. Collection Index Layer

Collection lists should use lightweight indexes, not full content documents.

Public API sketch:

```ts
type CollectionIndex = {
  identity: {
    repoKey: string;
    ref: string;
    treeSha: string;
    configSlug: string;
    configPath: string;
    contentIdentity: string;
  };
  configSlug: string;
  mode: 'file' | 'directory';
  items: CollectionIndexItem[];
  byRoute: Map<string, CollectionIndexItem>;
  byId: Map<string, CollectionIndexItem>;
  byPath: Map<string, CollectionIndexItem>;
};

type CollectionIndexItem = {
  itemId: string;
  route: string;
  path: string;
  filename?: string;
  index?: number;
  title: string;
  sortDate?: number | null;
  state?: ResolvedContentState | null;
  labelFields: Record<string, unknown>;
  contentSha?: string;
  size?: number;
};
```

Directory-backed collection index behavior:

- Use the repository tree to list candidate files by directory, extension, template exclusion, `_` prefix exclusion, and `.tentman.json` exclusion.
- Build path/filename/sha/size metadata without reading bodies.
- For item route:
  - If route can safely derive from filename, use filename stem immediately.
  - If config `idField` or explicit label fields require frontmatter/body fields, read only the minimal item header/frontmatter or full file as a bounded, cacheable index read.
  - For Markdown, parse frontmatter and avoid body parsing for index fields unless an index-needed field is body-derived.
  - For JSON/YAML item files, parse the file once, but cache a compact projection separate from full content.
- Store `contentSha` per file so unchanged item projections survive across branch refreshes.

File-backed collection index behavior:

- Read the single content file and extract the configured array.
- Project only item id, route, label fields, state field, order fields, and item index.
- Cache by the file blob SHA, not only by ref.
- A file-backed collection can never resolve one item without reading its container file, but it should avoid repeatedly parsing it for every route.

Navigation API:

```ts
dataLayer.getCollectionNavigation({
  repo,
  ref,
  slug
}): Promise<OrderedCollectionNavigation>;
```

This should return the current `OrderedCollectionNavigation` shape so UI migration is small, but it should be backed by `CollectionIndex`.

### 5. Item Resolver Layer

Item view must stop loading entire directory collections.

Public API sketch:

```ts
dataLayer.resolveCollectionItem({
  repo,
  ref,
  slug,
  itemRouteOrId
}): Promise<ResolvedCollectionItem>;

type ResolvedCollectionItem = {
  config: DiscoveredConfig;
  indexItem: CollectionIndexItem;
  content: ContentRecord;
};
```

Directory-backed lookup:

1. Load `RepositorySnapshot`.
2. Load `CollectionIndex`.
3. Resolve by route, stable id, filename, or manifest reference.
4. Read exactly `indexItem.path`.
5. Parse one content record.

File-backed lookup:

1. Load `RepositorySnapshot`.
2. Load file-backed `CollectionIndex`, which reads the container file once.
3. Resolve item by route/id/index.
4. Return the projected/full item from the parsed container cache.

The old `findContentItemByRoute(await fetchContentDocument(...))` pattern should become an implementation detail only for file-backed containers, never for directory-backed collections.

### 6. Content Document Layer

Full content remains necessary for singleton page editing, publish review sections, preview diffs, and some file-backed collection mutations.

Public API sketch:

```ts
dataLayer.getPageDocument({ repo, ref, slug }): Promise<PageDocumentResult>;
dataLayer.getCollectionItemDocument({ repo, ref, slug, itemRouteOrId }): Promise<ItemDocumentResult>;
dataLayer.getCollectionDocument({ repo, ref, slug, reason }): Promise<ContentRecord[]>;
```

Rules:

- `getPageDocument()` reads one singleton file.
- `getCollectionItemDocument()` reads one directory item file or one file-backed container.
- `getCollectionDocument()` is allowed but must require a named reason such as `publish-review-full-diff`, `export`, or `legacy-migration`. The API name should make full collection reads visible in code review.
- Directory-backed full collection reads should be paginated or bounded where the caller can accept it.

### 7. Draft Change Index Layer

Promote the current changed-file logic into a shared cacheable index:

```ts
type DraftChangeIndex = {
  repoKey: string;
  baseRef: string;
  draftRef: string;
  baseHeadSha: string;
  draftHeadSha: string;
  mergeBaseSha?: string;
  files: ChangedFile[];
  byConfigSlug: Map<string, ConfigChangeScope>;
  rootConfigChanged: boolean;
  navigationManifestChanged: boolean;
  configDiscoveryChanged: boolean;
  blockDiscoveryChanged: boolean;
  hiddenFiles: ChangedFile[];
};

type ConfigChangeScope = {
  configSlug: string;
  configPathChanged: boolean;
  contentFiles: ChangedFile[];
  templateChanged: boolean;
  mode: 'file' | 'directory';
  cheapSummary: {
    possible: boolean;
    modified: string[];
    created: string[];
    deleted: string[];
    ambiguous: boolean;
  };
};
```

Cache key:

```text
draft-change-index:{repoKey}:{baseRef}:{baseHeadSha}:{draftRef}:{draftHeadSha}
```

Consumers:

- `/api/repo/pages-summary`: derive changed page count from `byConfigSlug` without comparing every config.
- `/api/repo/draft-status`: return current config status from the index; fetch item details only if the UI needs richer content.
- `/api/repo/publish-view`: start from candidate scopes and only load full content for visible review sections.
- Cache invalidation after writes: changed paths from mutations update or invalidate affected snapshot/index/document keys.
- Sidebar badges: use config scopes and collection item scopes before reading content.

### 8. Request Coordinator

The layer should coordinate concurrent work across route calls:

```ts
type DataRequestPriority =
  | 'primary-route'
  | 'current-navigation'
  | 'draft-status'
  | 'sidebar-background'
  | 'prefetch';
```

Responsibilities:

- Deduplicate identical in-flight snapshot/index/document requests.
- Bound GitHub read concurrency.
- Let primary route content start before background summaries.
- Allow stale cached data to be returned with refresh metadata.
- Expose instrumentation for cache hit/miss, fanout counts, and read type.

Public API can return:

```ts
type DataResult<T> = {
  value: T;
  freshness: 'fresh' | 'stale' | 'refreshing';
  identity: RepositoryRefIdentity | ContentIdentity;
};
```

## Cache Model

### Identity Types

Use identity, not TTL, as the primary cache key.

Repository snapshot:

```text
snapshot:{repoKey}:{ref}:{headSha}:{treeSha}
```

Config index:

```text
config-index:{repoKey}:{ref}:{treeSha}
```

Block config index:

```text
block-config-index:{repoKey}:{ref}:{treeSha}
```

Navigation manifest:

```text
navigation-manifest:{repoKey}:{ref}:{manifestBlobSha | missing}
```

Directory collection index:

```text
collection-index:{repoKey}:{ref}:{treeSha}:{configSlug}:{directoryPath}:{templatePath}:{indexSchemaHash}
```

Directory item projection:

```text
item-projection:{repoKey}:{path}:{blobSha}:{indexSchemaHash}
```

Directory item document:

```text
item-document:{repoKey}:{ref}:{path}:{blobSha}
```

File-backed collection index/document:

```text
file-content:{repoKey}:{ref}:{contentPath}:{blobSha}:{itemsPath | singleton}
```

Draft change index:

```text
draft-change-index:{repoKey}:{baseRef}:{baseHeadSha}:{draftRef}:{draftHeadSha}
```

### Index Schema Hash

Collection index cache must include a hash of the fields needed to build navigation:

- config id field
- blocks used by `resolveContentItemTitle()`
- explicit `isItemLabel` block
- date sort block
- collection state block
- group field ids
- manual sorting mode

If a config changes the label/state/order schema, the index is invalid even if item blobs are unchanged.

### TTL Role

TTL should become a polling/backstop policy:

- Check branch identity after a short TTL.
- If `headSha` and `treeSha` are unchanged, reuse identity-keyed caches.
- If identity changed, build new identity-keyed entries and leave old entries available for stale display until eviction.

## Progressive Route Loading

Route handlers should become thin data-layer clients. They should not know how to list directories or parse every collection item.

### `/api/repo/configs`

Return `RepositorySnapshot`-derived data:

- configs
- block config summaries
- root config
- navigation manifest
- active draft branch
- snapshot identity/freshness

Do not run separate content and block discovery tree walks.

### `/api/repo/page-view`

Primary response:

- discovered config
- singleton content, or collection landing metadata if collection page
- branch/ref identity
- minimal form config needed to render

Background or separately cached response:

- package block registry
- non-current sidebar summaries
- draft summary

For collection pages, do not fetch every item body just to show the collection landing/editor shell. If the page needs a first item redirect, use collection index navigation.

### `/api/repo/item-view`

Primary response:

- discovered config
- resolved item document
- item index metadata
- branch/ref identity

It must use `resolveCollectionItem()` and read one directory item file. It should not call `getCachedContent()` for directory-backed collections.

### `/api/repo/collection-items`

Return `getCollectionNavigation()` backed by `CollectionIndex`. For directory-backed collections, this should list tree entries and read only projection-needed files. It should cache each item projection by blob SHA.

### `/api/repo/config-states`

Only singleton top-level states belong here. Resolve singleton state by reading singleton files or using page document caches. Collection item states belong in `CollectionIndex`.

The route should run as sidebar/background priority.

### `/api/repo/pages-summary`

Accept no client-posted config array long term. The server should load the snapshot and `DraftChangeIndex`, then derive summary from shared indexes. This avoids stale client config payloads and avoids one comparison per config.

### `/api/repo/draft-status`

Use `DraftChangeIndex.byConfigSlug`. Only load full content if the response contract needs before/after field details. For directory-backed collection changes, filename-derived summaries are enough for badges and counts.

### `/api/repo/publish-view`

Use `DraftChangeIndex` and `ConfigChangeScope` as the candidate source. Load full base/draft content only for sections that are actually visible in the review model. For directory-backed collections, load changed item documents first and only load full collection documents when order/group comparisons or ambiguous changes require it.

### Navigation Manifest Writes

Write/setup flows can use deeper content reads, but they should use data-layer helpers:

- collection index for item ids and reference maps
- item resolver for one changed item
- mutation result paths for invalidation
- snapshot refresh when config/root/manifest paths change

## Local And GitHub In The Same Model

Local and GitHub should share public data-layer APIs:

```ts
dataLayer.getSnapshot(context)
dataLayer.getCollectionIndex(context, slug)
dataLayer.getCollectionNavigation(context, slug)
dataLayer.resolveCollectionItem(context, slug, itemRouteOrId)
dataLayer.getPageDocument(context, slug)
dataLayer.getDraftChangeIndex(context)
dataLayer.commitContentMutation(context, mutation)
```

The source adapter differs:

- GitHub source uses refs, commits, trees, blobs, and compare APIs.
- Local source uses file handles, directory walking, content hashes/signatures, and no draft branches.

Local mode should still use indexes because it keeps behavior consistent and catches future feature regressions. Its persisted cache can evolve from `LocalDiscoverySignature` to snapshot/index identities.

## Mutation And Invalidation

Every write should return changed paths and the target ref:

```ts
type MutationResult = {
  ref: string;
  previousHeadSha?: string;
  nextHeadSha?: string;
  changedPaths: Array<{
    path: string;
    type: 'create' | 'update' | 'delete';
    previousPath?: string;
  }>;
};
```

Invalidation rules:

- `tentman.json`: invalidate snapshot, config index, block index, navigation ordering semantics, package block loading.
- `*.tentman.json`: invalidate snapshot/config index and affected collection index schema.
- `tentman/navigation-manifest.json`: invalidate navigation manifest and ordered navigation outputs.
- directory content item path: invalidate item projection, item document, affected collection index ordering if label/sort/state fields may change.
- file-backed collection path: invalidate file content/index/document for that config.
- content component files: invalidate content component index/registry.
- draft branch write: invalidate draft change index for base/draft pair and affected draft ref caches.

Optimistic updates can patch collection indexes after writes when the mutation payload includes enough item metadata, but correctness should come from path-scoped invalidation and ref identity refresh.

## Existing Direct Calls To Replace

These should eventually stop being public call sites for read workflows:

- `getCachedContent()` in:
  - `routes/api/repo/page-view/+server.ts`
  - `routes/api/repo/item-view/+server.ts`
  - `routes/api/repo/collection-items/+server.ts`
  - `routes/api/repo/config-states/+server.ts`
  - `routes/pages/[page]/[itemId]/edit/+page.server.ts`
- `fetchContentDocument()` in:
  - local page/item/edit Svelte loaders
  - `draft-comparison.ts`
  - `review-draft/build-review-model.ts`
  - read-side navigation manifest helpers
- direct `backend.discoverConfigs()`, `backend.discoverBlockConfigs()`, `backend.readRootConfig()`, and `loadNavigationManifestState()` in bootstrap routes/stores, replaced by `getSnapshot()`.
- direct `backend.readTextFile()` for config source reads in UI flows, replaced by config source/document helpers where possible.
- direct `RepositoryBackend` dependencies in future feature modules. New features should depend on `RepositoryDataLayer` capabilities.

Low-level backend calls can remain in:

- repository source adapter implementations
- mutation primitives
- compatibility shims during migration
- tests that intentionally exercise the backend contract

## Migration Phases

### Phase 1: Data Layer Skeleton And Compatibility Shims

- Add `repository-data` types and source adapters.
- Implement `getSnapshot()` using existing backend methods first.
- Preserve current route responses.
- Add instrumentation around snapshot/cache/read fanout.
- Add lint/check guidance or a thin-backend rule extension that flags new direct content reads in route handlers.

Success criteria:

- No behavior change.
- Routes can retrieve configs/root/block/manifest through one service.
- Existing tests pass.

### Phase 2: Single-Pass GitHub Snapshot Discovery

- Implement GitHub ref identity and recursive tree cache.
- Replace separate content/block discovery tree walks with one snapshot discovery.
- Cache snapshot by `repo/ref/headSha/treeSha`.
- Keep TTL only for branch identity rechecks.

Success criteria:

- `/api/repo/configs`, page view bootstrap, form config, and collection-items share one snapshot.
- Config discovery no longer repeats root/tree traversal for content and blocks.

### Phase 3: Collection Indexes

- Implement `CollectionIndex` for directory-backed collections using tree entries.
- Add item projection reads for title/sort/state fields with blob-SHA caching.
- Implement file-backed collection indexes by container blob SHA.
- Make `/api/repo/collection-items` use `getCollectionNavigation()`.

Success criteria:

- Collection navigation for `news` no longer reads 222 full bodies on every request.
- Navigation output remains compatible with current `CollectionPanel`.

### Phase 4: Item Resolver

- Implement `resolveCollectionItem()`.
- Migrate `/api/repo/item-view` and edit server delete lookup to resolver/index APIs.
- Add tests proving directory item view reads one item file after index resolution.

Success criteria:

- Directory-backed item view avoids whole collection reads.
- Delete/rename flows still resolve stored filenames correctly.

### Phase 5: Progressive Route Contracts

- Split primary route data from background/sidebar work.
- Move package block registry and pages summary to lower priority or independent loads where possible.
- Allow stale snapshot/index data with explicit refresh metadata.

Success criteria:

- Current page/item content is not blocked by overview summaries, non-current collection lists, or draft page summaries.

### Phase 6: Draft Change Index

- Extract shared `DraftChangeIndex` from `draft-comparison.ts` and review-draft candidate logic.
- Migrate pages summary, draft status, publish view, and invalidation to use it.
- Limit full content comparisons to ambiguous file-backed collections, renames, and visible review details.

Success criteria:

- Pages summary no longer calls `compareDraftToBranch()` once per config with possible full content fallbacks.
- Draft status for directory-backed collections can answer count/badge data from changed paths.

### Phase 7: Mutation-Aware Invalidation

- Route writes through data-layer mutation helpers.
- Return changed paths and next ref identity.
- Invalidate affected snapshot/index/document/draft keys precisely.
- Add optimistic index patching for common create/update/delete item flows.

Success criteria:

- Writes do not cause broad `/api/repo/*` cache invalidation.
- Changed collection navigation updates without refetching unrelated collections.

### Phase 8: Retire Legacy Content Cache

- Replace `getCachedContent()` with document/index APIs.
- Keep `getCollectionDocument({ reason })` as an explicit escape hatch.
- Remove or shrink `content-cache.ts` once no route depends on full content caching for ordinary reads.

Success criteria:

- Code review can easily spot any full collection read.
- Future features naturally consume indexes/resolvers.

## Test Strategy

### Unit Tests

- Snapshot discovery reads root/tree once and classifies content/block configs from the same tree.
- Cache keys include repo, ref, head SHA, tree SHA, blob SHA, and index schema hash where appropriate.
- Directory collection index filters template files, `_` files, nested files, and `.tentman.json`.
- Directory item resolver reads one item file after index resolution.
- File-backed collection index reads one container file and resolves by route/id/index.
- Draft change index maps root/config/manifest/content/template changes to scopes.
- Invalidation maps changed paths to exact cache keys.

### Route Tests

- `/api/repo/collection-items` returns the same shape without calling full `fetchContentDocument()` for directory mode.
- `/api/repo/item-view` resolves a directory item without loading all collection files.
- `/api/repo/pages-summary` derives from `DraftChangeIndex`.
- `/api/repo/configs` uses one snapshot bootstrap.

### Integration Tests

- GitHub backend fixture with a 200+ item directory collection:
  - collection navigation read count stays bounded
  - item view reads one item document
  - page view does not load every body unless explicitly requested
- Local mode returns identical navigation and item data through the same APIs.
- Manual navigation ordering and groups still apply from manifest.
- Draft publish review still shows rich details for changed files.

### Browser Tests

- Sidebar loads current page first, then collection panel/background states.
- Collection panel shows item labels and groups from index data.
- Item edit/delete flows preserve filenames and draft branch state.
- Stale cached navigation can render while refresh state is visible.

### Instrumentation

Keep production timing available behind a flag and add:

- snapshot cache hit/miss and identity
- collection index cache hit/miss, item count, projection read count
- item resolver read count
- full collection document reads with required `reason`
- draft change index hit/miss and changed-file count
- per-endpoint primary vs background duration

## Design Principles For Future Features

- Start from `RepositorySnapshot`, `ConfigIndex`, `CollectionIndex`, or `DraftChangeIndex`.
- Read full content only for the current page/item or an explicit review/export operation.
- Make ref identity explicit in API calls; do not hide draft/base choice in a backend instance.
- Cache by immutable identity first, TTL second.
- Return stale usable data with refresh metadata when possible.
- Add any new remote data need as a data-layer capability, not a route-local `RepositoryBackend` call.

