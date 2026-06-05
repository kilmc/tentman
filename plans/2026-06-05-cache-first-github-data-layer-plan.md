# Cache-First GitHub Data Layer Plan

## Summary

Make the GitHub-backed UI read from a client-side repository cache by default, backed by IndexedDB, with GitHub used as the upstream sync source. After an initial warm, navigating back to a collection like Projects should render immediately from cached snapshot/index data, hydrate visible titles first, and continue fetching the rest in the background.

The implementation should replace ad hoc route-level caching with a single cache/store boundary. Existing server `repository-data` stays useful, but route loads and layout components should ask the client cache first.

## Key Changes

- Add a browser-only GitHub repository cache store using raw IndexedDB, no new dependency.
- Cache keys must be identity based, not TTL first:
  - repo/ref identity: `repoFullName + ref`
  - snapshot: `repoFullName + ref + treeSha`
  - collection index: `repoFullName + ref + treeSha + configSlug`
  - projection: `repoFullName + blobSha + schemaIdentity`
  - item document: `repoFullName + blobSha + configSlug`
- Store these records:
  - serialized repository snapshot: configs, block configs, root config, navigation manifest, tree entries, head SHA, tree SHA
  - tree-only collection index: path, filename, blob SHA, route fallback, fallback title, hydration status
  - hydrated item projection: final title, stable item id, sort date, state, route
  - full item document for opened items
- Add a Svelte-facing API, for example `githubRepositoryCache`, with:
  - `hydrateFromBootstrap(data)`
  - `getCollectionNavigation(slug)`
  - `warmCollection(slug, { visibleLimit })`
  - `hydrateCollectionProjections(slug, blobShas)`
  - `getItemDocument(slug, itemId)`
  - `invalidatePaths(changedPaths)`
  - `clearRepo(repoFullName)`
- Replace the draft `github-route-cache` idea with this central cache; route JSON caching should not remain as a separate system.

## Implementation Changes

- Refactor `/pages` layout bootstrap so it seeds the GitHub cache with `/api/repo/configs` results, then uses cached snapshot/config data as the default source for sidebar/header decisions.
- Add a cheap collection index endpoint, `GET /api/repo/collection-index?slug=...`, returning tree-derived items without reading every item blob.
- Add a projection batch endpoint, `POST /api/repo/collection-projections`, accepting `{ slug, blobShas }` and returning projection records for only those blobs.
- Change collection page load behavior:
  - on click, render from cached collection index immediately if present
  - if absent, fetch tree-only collection index first, then render
  - request visible projections first, default first 30 items
  - hydrate remaining projections in background batches of 20 with bounded concurrency
- Extend collection navigation item shape with optional metadata:
  - `hydration: 'fallback' | 'hydrated'`
  - `hrefItemId?: string`
  - UI links use `hrefItemId ?? itemId`
- For fallback rows, use filename/route as the clickable id; after hydration, replace title/state/sort data and stable id. Manual grouping/order may appear after hydration when stable IDs become known.
- Split block registry loading from collection landing pages. Collection page view should not wait for block registry/package blocks unless rendering singleton content, item view, or edit form content that needs `ContentValueDisplay`.
- On item click:
  - resolve path/blob SHA from cached collection index or projection
  - return cached full document if present
  - otherwise fetch only that item blob, cache it, then render
- Invalidate precisely after save/publish/delete/navigation changes:
  - changed item path clears its projection/document and affected collection navigation
  - config/root/navigation changes clear snapshot and relevant collection indexes
  - publish/discard clears draft-ref cache scope

## Test Plan

- Unit test IndexedDB cache read/write, serialization, identity-key lookup, and invalidation by changed path.
- Unit test collection index creation from tree-only data without blob reads.
- Server tests for new collection index and projection batch endpoints.
- Route/load tests proving warm `/pages/projects` navigation does not call `/api/repo/page-view`.
- Browser test for Projects flow:
  - first click renders fallback rows quickly
  - visible titles hydrate before background items
  - clicking an item fetches only that item when not cached
  - clicking away and back renders from cache without waiting on GitHub
- Existing focused server tests for repository-data, page-view, item-view, collection-items.
- Keep current known unrelated `tsc --noEmit` failures documented unless fixed separately.

## Assumptions

- Implement IndexedDB in this pass.
- Use vanilla IndexedDB wrappers following existing local repository storage style.
- Cache is allowed to show stale-but-known data while checking branch/tree identity in the background.
- Blob SHA equality means cached projection/document data is fresh.
- Branch head/tree identity is the freshness boundary for snapshots and collection indexes.
- The first version prioritizes same-browser speed; cross-device/shared caching is out of scope.
