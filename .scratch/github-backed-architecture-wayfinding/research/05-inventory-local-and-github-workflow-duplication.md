# Inventory local and GitHub workflow duplication

## Summary

Local mode and GitHub-backed mode already share the core content and navigation domain functions, but they duplicate the orchestration around those functions in Svelte route/layout code. The duplication worth unifying is workflow-level: "load workspace navigation", "load page/item editor view", "save content", "refresh affected workspace data", and "sync navigation/group state". The duplication that should remain mode-specific is source/cache/persistence mechanics: browser File System Access handles for local mode, GitHub refs/draft branches/server APIs/IndexedDB cache lifecycle for GitHub mode.

The most useful future boundary is not a shared low-level repository source. The current `RepositoryBackend` and content/navigation services already make file/directory content operations polymorphic. The missing boundary is a route/workflow provider that returns common view models and accepts common mutations while letting each adapter perform its own cache, invalidation, draft, and browser-handle work underneath.

## Evidence

### Pages workspace layout

`apps/web/src/routes/pages/+layout.svelte` holds duplicated local/GitHub state maps for collection navigation and top-level config states:

- `localCollectionItemsBySlug` / `githubCollectionItemsBySlug`
- `localConfigStatesBySlug` / `githubConfigStatesBySlug`
- GitHub-only load status and error maps

The layout then derives common workspace inputs from either local store state or route data: manifest state, configs, root config, ordered configs, collection items, and config states. This is real shared workflow shape. The UI wants a normalized workspace model, but the current layout knows both data providers directly.

Local collection/config-state loading reads content documents from the browser backend and computes shared domain outputs with `getOrderedCollectionNavigation` and `resolveContentDocumentState`. GitHub loading goes through `githubRepositoryCache` and `/api/repo/config-states`, then adapts into the same output maps. The domain result is shared; the source/cache path is not.

Navigation editing is also shared workflow with adapter-specific write transport. The layout builds a `NavigationDraft`, serializes it, then either calls `writeNavigationManifest` / `saveCollectionOrder` directly on the local backend or POSTs the same intent to `/api/repo/navigation-manifest` for GitHub. Afterward both paths cancel editing, invalidate/reload workspace data, and show success.

The local rescan and GitHub cache-clear controls should remain adapter-specific. Local rescan forces `localContent.refresh`, invalidates discovery/cache signatures, and remounts local surfaces. GitHub cache clear deletes IndexedDB cache records for a repo/ref, rehydrates from bootstrap, resets freshness, and reloads the visible collection. They are analogous UI affordances, not shared domain behavior.

### Bootstrap

Local bootstrap lives in `local-repo.ts` and `local-content.ts`. It restores a File System Access directory handle from IndexedDB, checks browser permissions, persists session backend selection, constructs a `LocalRepositoryBackend`, computes a local discovery signature, optionally stores config/bootstrap data in `localStorage`, and loads a local block registry. Local package-distributed blocks are explicitly unsupported in browser-backed mode.

GitHub bootstrap lives in `repo-config-bootstrap.ts`, route layout loads, and `github-repository-cache.ts`. It requires authenticated server state, resolves the selected repo/draft branch, builds repository snapshots with ref/head/tree identities, computes changed paths for freshness checks, hydrates browser IndexedDB snapshot/index/projection/document/block-support/inventory stores, and schedules freshness checks and warming.

This is acceptable duplication in shape but not in mechanics. Both modes need "workspace bootstrap", but the identity, permission, cache, and staleness models are fundamentally different.

### Route loads

The pages layout load returns empty bootstrap data for local mode and loads `/api/repo/configs` plus instructions for GitHub mode. Page and item route loads do the same split: local mode returns placeholders, then the Svelte component reads from `localContent`/`localRepo`; GitHub mode hydrates `githubRepositoryCache`, tries cache-first reads, then falls back to `/api/repo/page-view` or `/api/repo/item-view`.

This is a major source of workflow duplication. The UI page components should not need to know that local data arrives through store hydration while GitHub data arrives through route load/cache/API fallback. A shared route-view contract would let the page/editor components consume the same shape.

Do not erase the GitHub cache-first/API fallback behavior into a lowest-common-denominator local path. The GitHub path is performance-sensitive and must keep identity-backed cache records, foreground warming, server fallback, and auth redirect handling.

### Write paths

The content service is already shared at the right low level: `fetchContentDocument`, `saveContentDocument`, `createContentDocument`, `deleteContentDocument`, and `previewContentChanges` dispatch only on file/directory content mode and accept any `RepositoryBackend`.

The duplicated part sits above that service:

- Singleton edit local save materializes draft assets in the browser, calls `saveContentDocument`, cleans staged refs, refreshes local content, and redirects.
- Singleton GitHub save submits to `?/saveToPreview`; the server action materializes draft assets, ensures the managed draft branch/PR, writes via the same content service, invalidates repository data, and redirects.
- Item edit local save additionally syncs collection group selection into the manifest and refreshes local content.
- Item edit GitHub save patches the browser cache for the edited collection item after a successful server action, and GitHub delete invalidates changed cache paths after the action returns.
- New item follows the same local direct write versus GitHub server action split.

The common workflow is "prepare form data, materialize draft assets, write content, sync navigation/group membership when needed, refresh affected view, clear recovery/staged assets, redirect/report saved". The adapter-specific steps are where the write runs, whether a draft branch/PR is required, and which caches/route data must be invalidated.

### Navigation/group mutations

Navigation manifest behavior is already mostly shared in `navigation-manifest.ts`: parsing/serializing, setup reconciliation, config id repair, collection ordering, group management, and group selection sync all take a `RepositoryBackend`.

GitHub's `/api/repo/navigation-manifest` endpoint repeats mutation validation and wraps the shared functions in GitHub-only mechanics: auth, draft branch creation, batched writes, snapshot selection, PR creation, config-cache invalidation, navigation manifest cache invalidation, repository-data invalidation, and changed-path returns. That wrapper should remain adapter-specific, but the route/layout components should send mutation intents to a narrower workflow interface rather than manually branching on local versus GitHub.

### Tests that encode the split

Current tests make the split visible:

- `apps/web/src/routes/pages/layout.spec.ts` asserts GitHub mode loads repo configs through the thin endpoint, while local mode returns empty bootstrap even with a stale GitHub repo snapshot.
- `apps/web/src/routes/pages/[page]/page.spec.ts`, `apps/web/src/routes/pages/[page]/[itemId]/page.spec.ts`, and edit route specs assert GitHub thin API fallback, draft branch propagation, and auth redirects. These tests do not exercise equivalent local route-data loads because local work happens in Svelte/browser stores.
- `apps/web/src/lib/test/browser/manual-navigation-sidebar.svelte.spec.ts` encodes local rescan behavior, local navigation manifest regrouping, GitHub fallback rows before projection hydration, GitHub cache progress, and visible projection hydration order.
- `apps/web/src/lib/test/browser/item-edit-page.svelte.spec.ts` directly encodes local direct save/group sync and GitHub cache patching after server-action success.
- `apps/web/src/lib/test/browser/github-cache-page.svelte.spec.ts` is rightly GitHub-specific; cache inventory actions should not move into a shared workflow core.

These tests would become simpler if there were a shared workspace/edit workflow provider contract with mode-specific test doubles. They should still keep separate adapter tests for GitHub cache lifecycle, draft branch behavior, and local File System Access handle/discovery behavior.

## Classification

Shared workflow logic candidates:

- Normalize workspace bootstrap outputs: configs, root config, manifest state, instructions, block support status, repo label, preview URL, active draft branch.
- Load collection navigation and config state into a common `CollectionItemsBySlug` / `ConfigStatesBySlug` shape.
- Prepare navigation editing, serialize navigation drafts, save full manifest, save collection order, manage collection groups.
- Load singleton/page view and collection item view for view/edit pages into common view models.
- Save singleton, create item, update item, delete item, and sync collection group selection as common mutation intents.
- Standardize post-mutation effects at the workflow level: affected paths, changed manifest, active draft branch, refresh/reload/patched view, redirect target, user-facing result.
- Keep editor recovery, dirty/save status, and form submit preparation shared at the component or workflow level.

Adapter-specific source/cache behavior:

- Local File System Access handle storage, permission checks, `.git` validation, and browser-only reads/writes.
- Local discovery signature, local config-cache persistence, `localContent.refresh({ force })`, content-component registry clearing, local block-registry loading, and local block package limitation.
- GitHub auth/session handling, selected repository and draft branch resolution, Git Data tree/blob identity, recursive snapshots, changed-path calculation, draft PR lifecycle, server actions, and GitHub API choices.
- GitHub IndexedDB cache stores, foreground/background warming, projection hydration, full-document budget, cache inventory, freshness scheduler, path invalidation, and route-data server fallback.
- Publish/review draft behavior. Local mode has immediate file writes; GitHub mode has managed draft branch state and publish/discard flows.

UI presentation state:

- Sidebar/header/collection-panel layout state, mobile/desktop panel toggles, side-panel state, editor route detection, document titles, save-status chips, recovery banners, and button labels.
- Local rescan and GitHub cache-clear buttons as presentation affordances over different adapter commands.
- Loading/error messages can consume a shared status shape, but their copy and placement are UI concerns.

Compatibility or legacy fallback:

- Local route loads returning placeholders are a compatibility artifact of the current browser-store architecture, not a domain rule.
- GitHub `/api/repo/page-view` and `/api/repo/item-view` fallbacks remain necessary until route-data/cache coverage is explicit; they should be hidden behind a GitHub provider rather than duplicated in page loads.
- Legacy repository-data/content-cache fallbacks identified by [Trace route-data assembly and legacy fallbacks](../issues/04-trace-route-data-assembly-and-legacy-fallbacks.md) are adjacent cleanup, not a reason to share local and GitHub cache mechanics.

## Decision

Real unification target: shared content-management workflow contracts and route/view assembly, especially in the pages workspace and editor flows.

Acceptable duplication: local and GitHub source, cache, freshness, persistence, and draft/publish mechanics. These should be adapter-specific implementations behind the workflow contract, not squeezed into one shared cache/source core.

The next shared-core discussion should prefer "shared route/workflow data assembly core with adapter-specific source and cache layers" or "shared pages workspace state machine with local/GitHub data providers" over "shared repository source/snapshot/index core". The source/snapshot layer already differs too much: local has browser handles and discovery signatures; GitHub has refs, tree/blob identities, server-only access, and IndexedDB cache inventory.

No new tickets were added. The existing follow-up [Decide the shared core boundary](../issues/06-decide-shared-core-boundary.md) should use this evidence to choose between route/workflow assembly and pages-workspace state as the primary seam.
