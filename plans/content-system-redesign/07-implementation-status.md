# Implementation Status

## Current Slice

- Phase: 3
- Slice: 18
- Title: Move item identity and draft comparison helpers off the bridge Config alias
- Status: in_progress

## Slice Goal

Replace the remaining non-field runtime consumers that still import the bridge `Config` alias in item identity and draft-comparison helpers with direct parsed-config typing.

This slice should establish:
- item identity and draft-comparison helpers typed against `ParsedContentConfig` rather than `$lib/types/config`'s `Config` alias
- a smaller non-field bridge surface outside the remaining field compatibility helpers
- no behavior change in item ID derivation or draft comparison logic

It should not yet remove the temporary compatibility bridge in `src/lib/types/config.ts` or the parsed `fields` bridge it still supports.

## Completed Work

- Planning and v1 spec docs created and tightened.
- Hard-cut migration plan created.
- Phase 1 / Slice 1 completed.
- Added explicit config schema types for `type: "content"` and `type: "block"` in `src/lib/config/types.ts`.
- Added explicit parsing/validation entry points in `src/lib/config/parse.ts`.
- Replaced discovery parsing to only accept the new explicit schema and respect root `configsDir` / `blocksDir` filtering for content discovery.
- Updated root config parsing to include `blocksDir`, `configsDir`, and `assetsDir` alongside existing preview metadata.
- Migrated the example content config at `src/lib/examples/posts.tentman.json` to the new schema.
- Added focused parser/discovery tests and updated affected helper specs to use the new schema.
- Verified with `npm run check` and targeted `vitest` runs.
- Phase 1 / Slice 2 completed.
- Added block config discovery that respects `blocksDir` for both local and GitHub repository backends.
- Added a first `blocks` domain with built-in primitive block definitions and a registry loader.
- Added duplicate block ID failure handling across built-ins and local block configs.
- Added block discovery and registry tests.
- Phase 1 / Slice 3 completed.
- Added block adapter interfaces plus built-in primitive block adapters.
- Extended the registry so built-in block types resolve to adapters through one lookup path.
- Wired existing default-value and validation helpers through that built-in adapter lookup.
- Added adapter-focused tests for built-in defaults and validation.
- Phase 1 / Slice 4 completed.
- Added generated structured block adapters for reusable local block configs and inline nested block definitions.
- Extended registry-backed adapter resolution to recurse through nested child block usages.
- Updated form-data defaults and validation helpers to operate from `config.blocks` through the adapter layer, with registry injection support.
- Added tests for nested defaults and recursive validation behavior.
- Phase 2 / Slice 1 completed.
- Replaced form generation with block-based rendering from `config.blocks`.
- Added registry-aware UI support for built-in primitive blocks, inline nested blocks, and reusable local block configs.
- Threaded discovered block configs through local and GitHub form routes so the UI can build real block registries.
- Verified the updated form path with `npm run check` and focused `vitest` runs.
- Phase 2 / Slice 2 completed.
- Replaced card metadata derivation with block-based display metadata from `config.blocks`.
- Replaced singleton/detail read rendering with recursive block-based structured value display.
- Threaded discovered block configs into the main content page route so read-side UI can resolve reusable local block structures.
- Removed the main read-side dependency on normalized legacy `fields` for cards and detail display.
- Phase 3 / Slice 1 completed.
- Added explicit content adapter interfaces in `src/lib/content/adapters/types.ts`.
- Added initial `file` and `directory` content adapters in `src/lib/content/adapters/file.ts` and `src/lib/content/adapters/directory.ts`.
- Added `src/lib/content/service.ts` as the first content service boundary dispatching by `config.content.mode`.
- Replaced the implementation inside `src/lib/content/fetcher.ts` and `src/lib/content/writer.ts` with thin compatibility wrappers over the new content service.
- Added focused service tests covering file singleton reads/writes, file `itemsPath` collections, and directory-backed content using `content.path`.
- Verified with `npm run check` and `npx vitest run src/lib/content/service.spec.ts`.
- Phase 3 / Slice 2 completed.
- Extended the content adapter/service boundary to support preview/change-summary generation.
- Replaced the implementation inside `src/lib/utils/preview.ts` with a thin compatibility wrapper over the new content service.
- Updated directory preview behavior to follow `content.path` and use template-backed create output so previews better match actual writes.
- Extended `src/lib/content/service.spec.ts` with preview coverage for file collections and directory creates.
- Verified with `npm run check` and `npx vitest run src/lib/content/service.spec.ts`.
- Phase 3 / Slice 3 completed.
- Replaced draft-comparison branch reads with the new content service read path in `src/lib/utils/draft-comparison.ts`.
- Collapsed separate array/collection diffing into shared item-based comparison keyed through `getContentItemId`.
- Added focused comparison tests in `src/lib/utils/draft-comparison.spec.ts`.
- Verified with `npm run check` and `npx vitest run src/lib/utils/draft-comparison.spec.ts src/lib/content/service.spec.ts`.
- Phase 3 / Slice 4 completed.
- Switched the preview page server route path from `fetcher`/`writer`/`preview` wrappers to direct `src/lib/content/service.ts` usage.
- Replaced persistence-oriented `type === 'collection'` branching in preview mutation option building with `config.content.mode === 'directory'` checks.
- Kept route-level singleton vs non-singleton gating intact while removing redundant `ConfigType` plumbing from the actual persistence calls.
- Verified with `npm run check` and `npx vitest run src/lib/content/service.spec.ts src/lib/utils/draft-comparison.spec.ts`.
- Phase 3 / Slice 5 completed.
- Switched `src/lib/stores/content-cache.ts` from `src/lib/content/fetcher.ts` to direct `src/lib/content/service.ts` reads.
- Removed the cache API's redundant `ConfigType` parameter and updated GitHub-backed page/edit server callers to use the slimmer shared loader path.
- Added focused cache-store coverage for service-backed branch-aware reads in `src/lib/stores/content-cache.spec.ts`.
- Verified with `npm run check` and `npx vitest run src/lib/stores/content-cache.spec.ts src/lib/content/service.spec.ts`.
- Phase 3 / Slice 6 completed.
- Switched the remaining local-mode content reads in the page/edit Svelte routes from `src/lib/content/fetcher.ts` to direct `src/lib/content/service.ts` usage.
- Left the temporary compatibility bridge in `src/lib/types/config.ts` untouched while removing the last read-side callers of the fetch wrapper.
- Verified with `npm run check` and `npx vitest run src/lib/content/service.spec.ts src/lib/stores/content-cache.spec.ts`.
- Phase 3 / Slice 7 completed.
- Switched the local-mode save/create/delete handlers in the interactive Svelte routes from `src/lib/content/writer.ts` to direct `src/lib/content/service.ts` usage.
- Replaced write-side filename branching in those local routes with `config.content.mode === 'directory'` checks where the distinction was purely about persistence behavior.
- Verified with `npm run check` and `npx vitest run src/lib/content/service.spec.ts src/lib/stores/content-cache.spec.ts`.
- Phase 3 / Slice 8 completed.
- Moved the remaining server-side delete path off `src/lib/content/writer.ts` and onto `src/lib/content/service.ts`.
- Deleted the now-unused compatibility wrappers at `src/lib/content/fetcher.ts`, `src/lib/content/writer.ts`, and `src/lib/utils/preview.ts`.
- Verified with `npm run check` and `npx vitest run src/lib/content/service.spec.ts src/lib/stores/content-cache.spec.ts src/lib/utils/draft-comparison.spec.ts`.
- Phase 3 / Slice 9 completed.
- Refactored draft comparison and shared item identity helpers to derive comparison branching and item IDs from the explicit content config rather than threading `ConfigType` through those paths.
- Updated the page/publish callers of `compareDraftToBranch` plus the item helper call sites to use the slimmer config-driven signatures.
- Verified with `npm run check` and `npx vitest run src/lib/utils/draft-comparison.spec.ts src/lib/features/content-management/item.spec.ts src/lib/content/service.spec.ts src/lib/stores/content-cache.spec.ts`.
- Phase 3 / Slice 10 completed.
- Removed the dead legacy `ConfigType`-based option and preview types from `src/lib/features/content-management/types.ts` after the wrapper cleanup left them without callers.
- Verified with `npm run check` and `npx vitest run src/lib/utils/draft-comparison.spec.ts src/lib/features/content-management/item.spec.ts src/lib/content/service.spec.ts src/lib/stores/content-cache.spec.ts`.
- Phase 3 / Slice 11 completed.
- Replaced the remaining route-level singleton/collection gating that still depended on `discoveredConfig.type` with explicit `config.collection` and `config.content.mode` checks.
- Kept `DiscoveredConfig.type` available for now while removing its remaining behavioral use in page/edit/new/preview server routes and the main page view.
- Verified with `npm run check` and `npx vitest run src/lib/utils/draft-comparison.spec.ts src/lib/features/content-management/item.spec.ts src/lib/content/service.spec.ts src/lib/stores/content-cache.spec.ts`.
- Phase 3 / Slice 12 completed.
- Removed the last route-level presentation dependence on `discoveredConfig.type` in the main page view by deriving the displayed content kind from the explicit config.
- Left `DiscoveredConfig.type` in place only as bridge-facing metadata after clearing the route behavior and route presentation consumers.
- Verified with `npm run check` and `npx vitest run src/lib/utils/draft-comparison.spec.ts src/lib/features/content-management/item.spec.ts src/lib/content/service.spec.ts src/lib/stores/content-cache.spec.ts`.
- Phase 3 / Slice 13 completed.
- Removed `type` from `DiscoveredConfig`, updated discovery to stop attaching bridge-derived runtime metadata, and switched the content index page to derive its displayed kind from the explicit config.
- Updated discovery tests to reflect the slimmer discovered-config surface.
- Verified with `npm run check` and `npx vitest run src/lib/config/discovery.spec.ts src/lib/utils/draft-comparison.spec.ts src/lib/features/content-management/item.spec.ts src/lib/content/service.spec.ts src/lib/stores/content-cache.spec.ts`.
- Phase 3 / Slice 14 partially advanced.
- Removed `getConfigRuntimeType` usage from `src/lib/config/parse.ts` so parser internals now branch directly on explicit content config state.
- Updated parser tests accordingly, leaving `getConfigRuntimeType` itself isolated to the compatibility bridge as the final remaining runtime-type export.
- Verified with `npm run check` and `npx vitest run src/lib/config/parse.spec.ts src/lib/config/discovery.spec.ts src/lib/utils/draft-comparison.spec.ts src/lib/features/content-management/item.spec.ts src/lib/content/service.spec.ts src/lib/stores/content-cache.spec.ts`.
- Phase 3 / Slice 14 completed.
- Removed the now-unused `ConfigType` and `getConfigRuntimeType` exports from `src/lib/types/config.ts` while preserving the temporary field-based compatibility bridge.
- Confirmed there are no remaining source callers of the removed runtime-type exports.
- Verified with `npm run check` and `npx vitest run src/lib/config/parse.spec.ts src/lib/config/discovery.spec.ts src/lib/utils/draft-comparison.spec.ts src/lib/features/content-management/item.spec.ts src/lib/content/service.spec.ts src/lib/stores/content-cache.spec.ts`.
- Phase 3 / Slice 15 completed.
- Replaced the remaining `SingletonConfig` / `SingleFileArrayConfig` / `MultiFileCollectionConfig` bridge-alias usage in `src/lib/content/adapters/file.ts`, `src/lib/content/adapters/directory.ts`, and `src/lib/features/content-management/transforms.ts` with explicit parsed-config narrowing over `content.mode` and `content.itemsPath`.
- Added focused transform coverage for directory template info resolution from explicit `content.template` state.
- Verified with `npm run check` and `npx vitest run src/lib/content/service.spec.ts src/lib/features/content-management/transforms.spec.ts`.
- Phase 3 / Slice 16 completed.
- Removed the now-unused legacy parsed-config alias exports from `src/lib/types/config.ts` after clearing their persistence callers.
- Verified with `npm run check`.
- Phase 3 / Slice 17 completed.
- Moved `src/lib/content/adapters/types.ts` and `src/lib/content/service.ts` off the bridge `Config` alias and onto `ParsedContentConfig`.
- Verified with `npm run check` and `npx vitest run src/lib/content/service.spec.ts`.

## Files Changed In Current Program Of Work

- `/Users/kilmc/code/tentman/src/lib/config/types.ts`
- `/Users/kilmc/code/tentman/src/lib/config/parse.ts`
- `/Users/kilmc/code/tentman/src/lib/config/discovery.ts`
- `/Users/kilmc/code/tentman/src/lib/config/root-config.ts`
- `/Users/kilmc/code/tentman/src/lib/config/parse.spec.ts`
- `/Users/kilmc/code/tentman/src/lib/config/discovery.spec.ts`
- `/Users/kilmc/code/tentman/src/lib/repository/local.ts`
- `/Users/kilmc/code/tentman/src/lib/repository/github.ts`
- `/Users/kilmc/code/tentman/src/lib/repository/types.ts`
- `/Users/kilmc/code/tentman/src/lib/blocks/adapters/types.ts`
- `/Users/kilmc/code/tentman/src/lib/blocks/adapters/builtins.ts`
- `/Users/kilmc/code/tentman/src/lib/blocks/adapters/builtins.spec.ts`
- `/Users/kilmc/code/tentman/src/lib/blocks/adapters/structured.ts`
- `/Users/kilmc/code/tentman/src/lib/blocks/adapters/structured.spec.ts`
- `/Users/kilmc/code/tentman/src/lib/blocks/compat.ts`
- `/Users/kilmc/code/tentman/src/lib/blocks/builtins.ts`
- `/Users/kilmc/code/tentman/src/lib/blocks/registry.ts`
- `/Users/kilmc/code/tentman/src/lib/blocks/registry.spec.ts`
- `/Users/kilmc/code/tentman/src/lib/components/form/StructuredBlockField.svelte`
- `/Users/kilmc/code/tentman/src/lib/components/form/FormGenerator.svelte`
- `/Users/kilmc/code/tentman/src/lib/components/form/FormField.svelte`
- `/Users/kilmc/code/tentman/src/lib/components/form/ArrayField.svelte`
- `/Users/kilmc/code/tentman/src/lib/components/content/ContentValueDisplay.svelte`
- `/Users/kilmc/code/tentman/src/lib/types/config.ts`
- `/Users/kilmc/code/tentman/src/lib/examples/posts.tentman.json`
- `/Users/kilmc/code/tentman/src/lib/components/ItemCard.svelte`
- `/Users/kilmc/code/tentman/src/lib/features/content-management/item.ts`
- `/Users/kilmc/code/tentman/src/lib/features/content-management/item.spec.ts`
- `/Users/kilmc/code/tentman/src/lib/features/content-management/types.ts`
- `/Users/kilmc/code/tentman/src/lib/features/forms/helpers.spec.ts`
- `/Users/kilmc/code/tentman/src/lib/stores/local-content.ts`
- `/Users/kilmc/code/tentman/src/lib/content/adapters/types.ts`
- `/Users/kilmc/code/tentman/src/lib/content/adapters/file.ts`
- `/Users/kilmc/code/tentman/src/lib/content/adapters/directory.ts`
- `/Users/kilmc/code/tentman/src/lib/content/service.ts`
- `/Users/kilmc/code/tentman/src/lib/content/service.spec.ts`
- `/Users/kilmc/code/tentman/src/lib/features/content-management/transforms.ts`
- `/Users/kilmc/code/tentman/src/lib/features/content-management/transforms.spec.ts`
- `/Users/kilmc/code/tentman/src/lib/stores/content-cache.ts`
- `/Users/kilmc/code/tentman/src/lib/stores/content-cache.spec.ts`
- `/Users/kilmc/code/tentman/src/lib/content/fetcher.ts`
- `/Users/kilmc/code/tentman/src/lib/content/writer.ts`
- `/Users/kilmc/code/tentman/src/lib/utils/preview.ts`
- `/Users/kilmc/code/tentman/src/lib/utils/draft-comparison.ts`
- `/Users/kilmc/code/tentman/src/lib/utils/draft-comparison.spec.ts`
- `/Users/kilmc/code/tentman/src/routes/pages/[page]/preview-changes/+page.server.ts`
- `/Users/kilmc/code/tentman/src/routes/pages/[page]/[itemId]/preview-changes/+page.server.ts`
- `/Users/kilmc/code/tentman/src/routes/pages/[page]/+page.server.ts`
- `/Users/kilmc/code/tentman/src/routes/pages/[page]/+page.svelte`
- `/Users/kilmc/code/tentman/src/routes/pages/+page.svelte`
- `/Users/kilmc/code/tentman/src/routes/pages/[page]/new/+page.server.ts`
- `/Users/kilmc/code/tentman/src/routes/pages/[page]/new/+page.svelte`
- `/Users/kilmc/code/tentman/src/routes/pages/[page]/edit/+page.server.ts`
- `/Users/kilmc/code/tentman/src/routes/pages/[page]/edit/+page.svelte`
- `/Users/kilmc/code/tentman/src/routes/pages/[page]/[itemId]/edit/+page.server.ts`
- `/Users/kilmc/code/tentman/src/routes/pages/[page]/[itemId]/edit/+page.svelte`
- `/Users/kilmc/code/tentman/src/routes/pages/[page]/preview-changes/+page.server.ts`
- `/Users/kilmc/code/tentman/src/routes/pages/[page]/[itemId]/preview-changes/+page.server.ts`
- `/Users/kilmc/code/tentman/src/routes/publish/+page.server.ts`
- `/Users/kilmc/code/tentman/plans/content-system-redesign/07-implementation-status.md`

## Blockers Or Open Questions

- None currently blocking Phase 3 / Slice 18.

## Plan Changes

- Added a temporary internal compatibility bridge in `src/lib/types/config.ts` that derives legacy runtime metadata (`fields` plus storage-kind metadata) from the new explicit config schema.
- This bridge keeps the codebase coherent while later slices replace the remaining field-based form and persistence consumers.
- Old config files are still hard-cut out of discovery/parsing. The bridge is internal only and should be deleted once registry/form/persistence slices land.
- Added repository-level block discovery methods so later slices can load a registry without re-implementing file discovery logic in routes or stores.
- Existing form components still render primitives with direct Svelte branching, but their defaults and validation now flow through the adapter layer. Rendering can move later without changing parsing/discovery again.
- Form helpers now accept an injected registry, but routes/components still use the default built-in-only registry path. The next slice needs to thread real loaded registries into the form UI.
- Form UI now consumes loaded block registries, so the next read-side slice can stop leaning on the compatibility `fields` bridge in cards and detail pages.
- Main fetch/save/delete persistence, draft comparison, item identity, and route gating now all derive from the explicit config/service path rather than wrapper-era `ConfigType` branching.
- Preview/change-summary generation now also runs through the `content.mode` service boundary, and directory previews follow the same `content.path` + template rules as actual writes.
- Draft comparison now reads through the content service, derives singleton-vs-collection behavior from the explicit content config, and uses config-driven item IDs rather than separate array/collection persistence branches.
- The old fetch/write/preview wrapper modules have now been removed, enabling follow-up cleanup passes against the remaining temporary bridge surface in `src/lib/types/config.ts`.
- The preview route server path now uses `src/lib/content/service.ts` directly, so that caller slice no longer needs the old persistence wrappers.
- The shared GitHub-backed content cache now reads through `src/lib/content/service.ts` directly, so `ConfigType` no longer needs to flow through `src/lib/stores/content-cache.ts` or its server callers.
- The temporary compatibility bridge in `src/lib/types/config.ts` still remains intentionally in place and should only be removed by a caller slice that fully replaces its consumers.
- The dead legacy option/preview types in `src/lib/features/content-management/types.ts` have been removed, and route-level singleton/collection gating now derives from `config.collection` / `config.content.mode` instead of `discoveredConfig.type`.
- `DiscoveredConfig.type` has now been removed entirely, and the runtime-type bridge exports have now been deleted from `src/lib/types/config.ts`.
- The persistence path no longer imports the bridge's legacy parsed-config aliases or its `Config` alias; the remaining bridge surface is now centered on field compatibility helpers plus non-persistence config consumers that still need caller-by-caller replacement.

## Exact Next Action

Replace the `Config` imports in `src/lib/features/content-management/item.ts` and `src/lib/utils/draft-comparison.ts` with `ParsedContentConfig`, update their focused specs, and keep the field bridge untouched.

## Next Slice

- Phase: 3
- Slice: 18
- Title: Move item identity and draft comparison helpers off the bridge Config alias
- Status: in_progress
