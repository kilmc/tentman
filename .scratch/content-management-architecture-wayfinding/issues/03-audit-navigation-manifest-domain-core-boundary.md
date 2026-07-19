# Audit the Navigation Manifest Domain Core boundary

Type: research
Status: resolved
Blocked by: 01

## Question

Where does the current web app still duplicate, reinterpret, or bypass Domain Core Navigation Manifest semantics?

## Evidence that counts as done

- Compare the current web code against [Own navigation manifest semantics in core](../../../docs/adr/0001-own-navigation-manifest-semantics-in-core.md) and the resolved Navigation Manifest module issues.
- Inspect parsing, reference normalization, grouping, ordering, writes, stable-id repair, web tests, and API behavior.
- Separate legitimate App Core or Content Source responsibilities from duplicated Domain Core semantics.
- Identify any regressions that appear to undo or muddy the resolved Navigation Manifest module work.

## Resolution should decide

Whether the Navigation Manifest boundary currently holds, and what follow-up work is required if it does not.

## Answer

The Navigation Manifest boundary **holds narrowly for the canonical schema contract**, but **does not yet hold as a clean Domain Core/App Core/Content Source seam**.

No evidence suggests that the resolved Navigation Manifest module work has been undone at the parser/serializer level. Domain Core still owns the canonical browser-safe contract in `@tentman/core/navigation-manifest`: parsing accepts shorthand references, in-memory manifests normalize to canonical `{ id }` Navigation References, serialization emits canonical references, and helper behavior covers reference ids plus collection/group lookup semantics. Web manifest loading and writes still delegate through that contract: `loadNavigationManifestState` parses with `parseNavigationManifest`, `writeNavigationManifest` serializes with `serializeNavigationManifest`, GitHub `save-manifest` parses the incoming payload before persistence, and the GitHub cache normalizes patched manifests.

The remaining problem is that the web app still bypasses or reinterprets parts of the Domain Core semantic surface in active read, edit, repair, and cache-update paths:

- `apps/web/src/lib/features/content-management/navigation.ts` looks up a collection with `manifest.collections[config._tentmanId]` instead of the core `getNavigationManifestCollection` helper. That means collection navigation, first-item selection, and record grouping do not use core's accepted collection reference identities (`collection key`, `id`, `configId`, `slug`) unless the manifest has already been repaired into the current stable-id key shape.
- `apps/web/src/lib/features/content-management/navigation-draft.ts` has the same direct `manifest.collections[configId]` assumption when creating navigation edit drafts, and matches manifest groups by `group.id` rather than routing through the core group helper. This is acceptable as a UI draft projection after canonical setup, but it is still a web-side reinterpretation of which references count.
- `apps/web/src/lib/features/content-management/navigation-manifest.ts` contains the deepest mixed module. Some of it is legitimate web/App Core or Content Source behavior: repository reads/writes, setup state, stable-id repair, config and item file updates, collection group lifecycle orchestration, and cache invalidation triggers. But the module also duplicates Navigation Manifest reference identity rules through `getConfigReferenceCandidates`, `getGroupReferenceCandidates`, `getItemReferenceCandidates`, `getConfigReferenceSet`, `getCollectionReferenceSet`, `getConfigManifestCollection`, and direct group matching. Those functions mix portable manifest semantics with web-specific config/content discovery and repair behavior.
- `apps/web/src/lib/features/content-management/navigation-group-options.ts` correctly uses `getNavigationManifestCollection` for reading group options, preserving issue 07's cleanup. However, its test-covered but apparently inactive `addNavigationGroupToManifest` helper still hand-rolls collection reference resolution by checking `configId`, `id`, and `slug`, omitting the collection key case that core handles. That is not currently the main write path, but it muddies the module surface and could reintroduce divergent behavior if reused.
- `apps/web/src/lib/stores/github-repository-cache.ts` and `apps/web/src/routes/pages/[page]/groups/+page.svelte` duplicate collection group mutation projection logic for GitHub cache/page-local state. This is not Domain Core schema semantics, but it is source-independent App Core workflow semantics living in UI/cache layers. The cache may legitimately patch IndexedDB and warm collections as a Content Source concern, but it should not need to know manifest collection-key lookup rules or replay group create/edit/delete/merge rules separately from the source-independent mutation result.
- `apps/web/src/lib/features/review-draft/structural-changes.ts` reads `manifest.collections[config._tentmanId]` directly for collection order review. This is a review projection, so it is App Core/UI-adjacent, but it has the same legacy-reference blind spot as navigation reads.

The legitimate split is:

- **Domain Core** should keep owning pure Navigation Manifest semantics: version/schema validation, shorthand compatibility, canonical Navigation Reference normalization, serialization, reference-id extraction, and collection/group lookup semantics.
- **App Core** should own source-independent editing workflows over canonical manifests and configs: creating navigation drafts, applying navigation order/group mutation intents, producing mutation results, preserving the durable Editing Source contract from ticket 02, and deciding optimistic/saved/syncing/needs-attention state transitions.
- **Content Source adapters** should own mechanics only: local filesystem writes, GitHub draft branch commits, repository reads, IndexedDB/cache patching, invalidation, freshness checks, and provider-specific retry/sync behavior. They should consume App Core mutation results and Domain Core-normalized manifests, not reinterpret manifest references.

So the current Navigation Manifest work should be preserved, but only as the Domain Core foundation. Future planning should not grow a half-migrated dual system where some web paths continue editing the Content Source directly while a new Editing Source is introduced beside them. Navigation ordering/grouping edits and collection group edits should move toward the same durable Editing Source-first model as content edits: mutate canonical editing state first, then let local/GitHub Content Source adapters sync/persist in the background.

Follow-up work required:

- In the App Core/Content Source boundary decision, require a small source-independent Navigation Manifest editing interface that hides collection/group lookup, draft serialization, group mutation projection, and mutation result shaping behind one web-owned seam.
- Replace direct active web reads of `manifest.collections[config._tentmanId]` with the core lookup helpers or with an App Core projection that delegates to those helpers. The highest-value targets are `navigation.ts`, `navigation-draft.ts`, `review-draft/structural-changes.ts`, GitHub cache group patching, and the groups page patch helper.
- Retire or fold the inactive `addNavigationGroupToManifest` helper into the canonical group-management path so it cannot become a second manifest mutation implementation.
- Keep stable-id repair in web/App Core unless CLI or another surface needs the exact same repair workflow. If it stays web-owned, narrow it so Domain Core helper calls define what counts as a manifest reference, while web code only maps discovered configs/items/groups to durable ids and asks Content Source adapters to persist repairs.
- In the collection group lifecycle ticket, treat duplicated create/edit/delete/merge projection across server mutation, GitHub cache, and page-local state as an App Core seam problem rather than a Domain Core manifest schema regression.

No new frontier ticket is needed from this audit. The existing collection group lifecycle ticket and final App Core/Content Source boundary ticket already cover the follow-up decisions this audit exposes.
