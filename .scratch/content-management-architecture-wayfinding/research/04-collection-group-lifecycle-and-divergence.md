# Collection Group Lifecycle and Divergence

## Scope

This resolves [Explain collection group lifecycle and divergence](../issues/04-explain-collection-group-lifecycle-and-divergence.md) by tracing collection group create, rename, reorder, membership change, save, reload, and cache refresh behavior across local folder mode and GitHub-backed mode.

No product code was changed.

## Decision

Collection group bugs fall into two categories:

- **Architecture seam problems**: collection group editing is source-independent product behavior, but it is not owned by one deep App Core module yet. The current implementation spreads mutation intent validation, config mutation, Navigation Manifest mutation, item-membership reconciliation, persistence, cache patching, and visible post-save state across route components, `navigation-manifest.ts`, GitHub endpoints, local route capabilities, and `githubRepositoryCache`.
- **Isolated defects or narrower implementation gaps**: new-item create paths do not sync item group selection into the Navigation Manifest, unlike existing-item edit paths; some GitHub client surfaces patch after group mutations differently; and several paths still assume `manifest.collections[config._tentmanId]`, carrying the reference-lookup blind spot already identified by the Navigation Manifest audit.

The evidence points toward a **strangler-style App Core seam** as the likely stabilization direction: fix isolated defects directly where they are small, but move collection group editing behind one source-independent mutation interface before broad product fixes continue. A pure retrofit would have many call sites to coordinate, and a parallel rebuild would likely duplicate the existing semantics unless the new interface first makes the lifecycle authoritative.

## Intended Lifecycle

A collection group currently has two durable representations:

- The **content config** `collection.groups` entry, with `_tentmanId`, `label`, and `value`.
- The **Navigation Manifest** collection group entry, with `id`, optional `label`/`value`, and ordered `items`.

Membership also has two representations:

- Item content can store `_tentmanGroupId` through the `tentmanGroup` block field.
- The Navigation Manifest stores group membership in each group's `items`.

The intended source-independent product lifecycle from ticket 02 is: mutate the durable Editing Source first, preserve the change across reload, then let the Content Source adapter sync/persist and refresh caches. The current code instead writes the Content Source directly first, then patches or reloads local UI/cache state differently per source.

## Domain Core Semantics

Domain Core owns the pure Navigation Manifest contract through `@tentman/core/navigation-manifest`: parsing, normalization, reference compaction, serialization, and canonical Navigation References.

Collection group lifecycle semantics are not in Domain Core today. They are mostly in `apps/web/src/lib/features/content-management/navigation-manifest.ts`, which imports core helpers but also owns App Core-shaped and Content Source behavior:

- Stable identity/reference candidate logic and collection lookup (`navigation-manifest.ts:232`, `navigation-manifest.ts:292`).
- Group field detection and membership maps (`navigation-manifest.ts:686`, `navigation-manifest.ts:725`, `navigation-manifest.ts:747`).
- Config, manifest, and item mutation projection (`navigation-manifest.ts:1044`, `navigation-manifest.ts:1099`, `navigation-manifest.ts:1191`).
- Backend file writes and manifest serialization (`navigation-manifest.ts:1695`, `navigation-manifest.ts:1755`, `navigation-manifest.ts:1870`, `navigation-manifest.ts:1908`).

That module is useful shared code, but it is not a clean Domain Core/App Core/Content Source seam because callers still need to know when to refresh local content, patch GitHub IndexedDB state, warm collection indexes, set draft branch state, invalidate route data, and update page-local config projections.

## Local Folder Mode

### Load and Reload

Local mode loads collection group state from browser-side local repository state. `localContent.refresh` reads the root config, content configs, block configs, Navigation Manifest, and instructions, guarded by a discovery signature and optional localStorage cache (`local-content.ts:177`, `local-content.ts:211`, `local-content.ts:290`, `local-content.ts:335`). The groups page itself returns a placeholder for local mode (`routes/pages/[page]/groups/+page.ts:11`) and the Svelte component reads `$localContent` plus item content to compute navigation (`groups/+page.svelte:41`, `groups/+page.svelte:106`).

Collection navigation is derived by `getOrderedCollectionNavigation`, which reads manifest groups rather than item group fields directly (`navigation.ts:282`). It currently looks up the manifest collection by `config._tentmanId` (`navigation.ts:172`), so legacy/reference-compatible collection keys are still a read-side blind spot.

### Create and Rename

The local groups page sends create/edit/delete/merge mutations directly to `manageCollectionGroups` (`groups/+page.svelte:263`). Inline select-option creation in item edit/new forms also calls the same helper, either through `localWorkflowRouteCapabilities.createCollectionGroup` or directly (`edit/+page.svelte:372`, `new/+page.svelte:377`, `local-workflow-route-capabilities.ts:476`).

`manageCollectionGroups` checks that group management is enabled, applies the mutation to `collection.groups`, writes the content config, rebuilds/updates the manifest collection, writes the Navigation Manifest, and returns the manifest (`navigation-manifest.ts:1755`). Create generates an id when one is not supplied and validates duplicate values (`navigation-manifest.ts:1044`). Rename/edit changes label/value while preserving group identity (`navigation-manifest.ts:1070`, `navigation-manifest.spec.ts:1125`).

After the helper returns, the groups page constructs a local `WorkflowMutationResult`, force-refreshes `localContent`, then reloads local navigation (`groups/+page.svelte:272`, `groups/+page.svelte:288`). There is no commit or background sync state in local mode; success means local files were written.

### Delete and Merge

Delete removes the group from config and manifest, appends the deleted group's manifest items to ungrouped items, and rewrites item content to remove `_tentmanGroupId` (`navigation-manifest.ts:1089`, `navigation-manifest.ts:1104`, `navigation-manifest.ts:1191`, `navigation-manifest.spec.ts:1154`).

Merge removes the source group from config and manifest, appends its manifest items to the target group, and rewrites item content from source group id to target group id (`navigation-manifest.ts:1094`, `navigation-manifest.ts:1121`, `navigation-manifest.ts:1206`, `navigation-manifest.spec.ts:1226`).

### Reorder and Membership Change

Collection reorder runs through the pages workspace consumer/adapter rather than the groups page. The collection panel emits a `NavigationDraftCollection`; the layout calls `saveCollectionCustomOrder`; the adapter calls `saveCollectionOrder` in local mode (`+layout.svelte:862`, `pages-workspace-adapters.ts:576`).

`saveCollectionOrder` writes the config group order, compares draft group membership against the current manifest and item field values, optionally rewrites item documents through the detected group field, then writes the Navigation Manifest order (`navigation-manifest.ts:1695`, `navigation-manifest.ts:1714`, `navigation-manifest.ts:1723`, `navigation-manifest.ts:1732`, `navigation-manifest.ts:1744`).

Existing item edits also sync the saved item field into the Navigation Manifest after saving content (`local-workflow-route-capabilities.ts:367`, `local-workflow-route-capabilities.ts:389`). Browser tests cover that local existing-item path (`item-edit-page.svelte.spec.ts:499`).

New item creation is different. The local new-item path creates the content document and refreshes local content, but it does not call `syncCollectionItemGroupSelection` (`new/+page.svelte:455`). If the new item includes `_tentmanGroupId`, the item content is saved, but manifest-based navigation may still treat it as ungrouped until another path reconciles the manifest. This is an isolated implementation defect and test gap.

## GitHub-Backed Mode

### Load and Reload

GitHub mode starts from server bootstrap. `/pages/+layout.ts` receives repo config bootstrap data, including `navigationManifest`; the browser cache hydrates an active snapshot from that data (`github-repository-cache.ts:3107`). Server repository snapshots load the Navigation Manifest through `loadNavigationManifestState` (`repository-data/snapshot.ts:93`).

The groups route hydrates the GitHub browser cache, ensures the collection index, and returns cached collection navigation (`groups/+page.ts:25`, `groups/+page.ts:36`). Reload therefore depends on the selected draft/main ref snapshot plus browser IndexedDB hydration, not on a durable Editing Source restored before Content Source freshness checks.

Freshness checks compare repository ref/head/tree identity and mark inventory targets stale when changed paths are detected (`github-repository-cache.ts:4373`, `github-repository-cache.ts:4486`). That is Content Source cache mechanics, not a source-independent saved/synced editing contract.

### Create and Rename

The GitHub groups page posts `manage-collection-groups` to `/api/repo/navigation-manifest` (`groups/+page.svelte:293`). The endpoint validates the mutation, ensures a draft branch, loads a repository snapshot, batches writes through `manageCollectionGroups`, ensures a draft PR, invalidates server caches, and returns the updated Navigation Manifest, changed paths, branch name, and a `WorkflowMutationResult` (`navigation-manifest/+server.ts:224`, `navigation-manifest/+server.ts:267`, `navigation-manifest/+server.ts:336`, `navigation-manifest/+server.ts:378`, `navigation-manifest/+server.ts:388`, `navigation-manifest/+server.ts:414`).

After the response, the groups page sets the draft branch, patches its page-local `remoteConfigEntry`, asks `githubRepositoryCache.patchCollectionGroups` to replay the config/group mutation into the browser snapshot, warms the collection, and invalidates `app:content` (`groups/+page.svelte:313`, `groups/+page.svelte:317`, `groups/+page.svelte:318`, `groups/+page.svelte:323`, `groups/+page.svelte:329`). Tests assert this page-level behavior and notably expect `invalidatePaths` not to be called for the groups-page GitHub mutation (`collection-groups-page.svelte.spec.ts:447`).

The browser cache has its own `applyCachedCollectionGroupMutation`, duplicating create/edit/delete/merge projection for cached configs and resolving created group ids from the returned manifest (`github-repository-cache.ts:2302`, `github-repository-cache.ts:4752`). This is source-independent App Core projection living inside a Content Source cache adapter.

Inline select-option creation diverges by surface. The edit page patches current config and `githubRepositoryCache.patchCollectionGroups` after the endpoint returns (`edit/+page.svelte:382`, `edit/+page.svelte:410`). The new-item page posts the same endpoint and updates only its local `navigationManifest` variable (`new/+page.svelte:393`, `new/+page.svelte:414`). That may be harmless for the immediate form surface, but it is suspicious cache/UI divergence compared with both the edit page and groups page.

### Delete and Merge

Delete and merge use the same GitHub endpoint and shared helper as local mode, so durable Content Source writes are equivalent in intent: config file, Navigation Manifest, and item document rewrites for delete/merge happen inside the draft-branch batch (`navigation-manifest/+server.ts:344`, `navigation-manifest.ts:1792`). The divergence is after persistence: GitHub must invalidate server repository-data caches, patch IndexedDB/browser snapshot state, warm collections, and set draft branch UI state.

### Reorder and Membership Change

Collection reorder uses the pages workspace adapter, as in local mode. GitHub posts `save-collection-order` to the same endpoint, then patches the browser Navigation Manifest, invalidates the app's manifest cache, force-loads collection navigation, and returns a `collection-order-saved` result (`pages-workspace-adapters.ts:621`, `pages-workspace-adapters.ts:651`, `pages-workspace-adapters.ts:657`). Server tests cover the endpoint intent/result shape (`api-repo-navigation-manifest.spec.ts:515`).

Existing item edits save content on the draft branch and call `syncCollectionItemGroupSelection` inside the same batched write (`edit/+page.server.ts:140`, `edit/+page.server.ts:166`). The client enhancement then recomputes the expected Navigation Manifest from submitted content and passes it to `githubRepositoryCache.patchCollectionItemFromContent` (`edit/+page.svelte:551`, `edit/+page.svelte:912`, `edit/+page.svelte:936`). The cache patch applies item projection and, when a manifest is supplied, calls `syncCollectionItemGroupSelectionInManifest` again before updating the active snapshot (`github-repository-cache.ts:4791`, `github-repository-cache.ts:4859`). This appears intended to be idempotent, but it is duplicated projection.

New item creation again diverges. The GitHub new-item server action creates the content document and invalidates repository data, but it does not call `syncCollectionItemGroupSelection` (`new/+page.server.ts:33`, `new/+page.server.ts:49`, `new/+page.server.ts:62`). The tests for this server action cover redirect and changed-path invalidation but not group membership sync (`new/page.server.spec.ts:51`). Like local mode, this is an isolated defect/test gap: a new item created with a group field can persist the field but miss the manifest membership update.

## Boundary Problems

### 1. Group Editing Lacks One Authoritative App Core Interface

Current callers submit source-independent intents such as create/edit/delete/merge/reorder, but no single App Core module returns the authoritative next editing state. Instead:

- `manageCollectionGroups` mutates config, manifest, and sometimes item documents while also performing backend writes.
- The GitHub endpoint wraps that helper with draft branch and server cache mechanics.
- The groups page patches page-local config state.
- `githubRepositoryCache` independently replays the same group mutation for IndexedDB state.
- Existing item edit code independently reconstructs the manifest patch for cache state after a server action redirect.

This is an architecture seam problem. The interface should let callers say "apply collection group mutation" or "apply item group membership change" and receive an authoritative mutation result/projection; Content Source adapters should then persist/sync/cache that result.

### 2. Content Source Mechanics Leak Into UI Surfaces

Local mode calls `localContent.refresh({ force: true })` after writes. GitHub mode sets draft branch UI state, patches IndexedDB, warms collection indexes, invalidates SvelteKit data, and waits for freshness checks. Those are legitimate Content Source responsibilities, but they are currently orchestrated by UI route components and mixed adapters. This is why equivalent product actions have different post-save paths.

### 3. Domain Core Boundary Holds for Schema, Not Lifecycle

Domain Core Navigation Manifest parsing/serialization is still used, but collection group lifecycle semantics are web-owned and partly duplicated. The direct `manifest.collections[config._tentmanId]` read pattern in `navigation.ts` and `githubRepositoryCache` remains boundary evidence from the Navigation Manifest audit, because it bypasses the full core collection lookup semantics.

### 4. Reload Does Not Restore a Source-Independent Editing Source

Local reload restores from local files/cache signature; GitHub reload restores from server bootstrap/IndexedDB snapshot/freshness. Both can work as Content Source mechanics, but neither implements ticket 02's Editing Source-first contract for Saved/Unsynced/Needs Attention state. Collection group edits are therefore still "saved because the Content Source write/cache patch worked," not "saved because App Core durably recorded the Editing Source mutation."

## Isolated Implementation Defects and Test Gaps

- **New-item group membership is not synced to the Navigation Manifest** in local or GitHub create paths. Existing item edits call `syncCollectionItemGroupSelection`; new item creates do not. This should be fixed directly and covered by tests.
- **GitHub inline group creation differs between edit and new item pages**: edit patches config/cache, new only stores the returned manifest. This may be benign, but it should be checked when fixing new-item group membership.
- **Some changed-path/cache behavior is hard to reason about from the UI seam**. The groups-page test name says "invalidates returned changed paths" while the assertion expects `invalidatePaths` not to run, because the page patches groups and warms the collection instead. That is not necessarily wrong, but it documents that cache correctness is encoded in surface-specific knowledge rather than an App Core result contract.
- **Legacy/reference-compatible manifest collection lookup remains a targeted defect** where active reads or patches use `manifest.collections[config._tentmanId]` directly. The Navigation Manifest ticket already covers this; collection group fixes should not grow more direct lookup code.

## Implementation Strategy Evidence

For the later implementation-strategy ticket:

- **Retrofit evidence**: there is already shared code for the core mutation mechanics (`manageCollectionGroups`, `saveCollectionOrder`, `syncCollectionItemGroupSelection`) and useful tests around helper behavior, endpoint behavior, browser groups page behavior, and GitHub cache behavior. Small defects like new-item membership sync can be fixed in place.
- **Retrofit risk**: correctness is distributed across many callers. A broad retrofit would have to coordinate route components, server actions, endpoint result shapes, browser cache patches, local refresh, tests, and Navigation Manifest lookup cleanup without one authoritative seam.
- **Parallel rebuild risk**: a second implementation would likely duplicate the same lifecycle unless it first defines the App Core interface and authoritative mutation/result model. The existing behavior has enough edge cases that parallel code would need a strong contract test suite before replacing it.
- **Strangler evidence**: collection group lifecycle has a natural seam: source-independent App Core intents/results for group create/edit/delete/merge, collection order, and item group membership changes, backed by Content Source adapters for local direct writes and GitHub draft branch/cache/freshness mechanics. Existing helper tests can be migrated behind that seam while callers are moved one surface at a time.

## Follow-Up

No new ticket is required from this resolution. The existing App Core/Content Source boundary ticket should absorb the seam decision, and the implementation strategy ticket should use this evidence when choosing retrofit, parallel rebuild, or strangler migration.
