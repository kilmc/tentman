# Implementation Status

## Current Slice

- Phase: post-rollout
- Slice: 1
- Title: Try the redesigned content system on real content and capture follow-up friction
- Status: pending

## Slice Goal

Use the refactored core in practice before opening larger new architecture tracks.

This slice should:

- exercise the redesigned config/block/content system against real content
- capture adoption blockers and sharp edges worth fixing next
- keep broader package-runtime work and blueprints/scaffolding deferred unless real usage shows a clear need

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
- Phase 3 / Slice 18 completed.
- Moved `src/lib/features/content-management/item.ts` and `src/lib/utils/draft-comparison.ts` off the bridge `Config` alias and onto `ParsedContentConfig`.
- Updated the focused item/draft-comparison specs to use parsed content config fixtures without bridge casts.
- Verified with `npm run check` and `npx vitest run src/lib/features/content-management/item.spec.ts src/lib/utils/draft-comparison.spec.ts`.
- Phase 3 / Slice 19 completed.
- Moved `src/lib/features/forms/helpers.ts` and `src/lib/utils/validation.ts` off the bridge `Config` alias and onto `ParsedContentConfig`, while preserving the field helper bridge imports they still require.
- Updated the focused form-helper spec to use parsed content config fixtures without bridge casts.
- Verified with `npm run check` and `npx vitest run src/lib/features/forms/helpers.spec.ts src/lib/blocks/adapters/structured.spec.ts`.
- Phase 3 / Slice 20 completed.
- Moved the remaining caller-side bridge `Config` alias usage in `src/lib/components/form/FormGenerator.svelte` and `src/lib/stores/content-cache.ts` onto `ParsedContentConfig`.
- Confirmed there are no remaining `Config` imports from `src/lib/types/config.ts` anywhere under `src/`.
- Verified with `npm run check` and `npx vitest run src/lib/stores/content-cache.spec.ts`.
- Phase 3 / Slice 21 completed.
- Replaced the remaining component-facing `BlockUsage` imports in `src/lib/features/content-management/item.ts` and `src/lib/components/ItemCard.svelte` with direct `$lib/config/types` imports.
- Confirmed there are no remaining `BlockUsage` imports from `src/lib/types/config.ts` anywhere under `src/`.
- Verified with `npm run check`.
- Phase 3 / Slice 22 completed.
- Moved `DiscoveredConfig` and `DiscoveredBlockConfig` into the config discovery domain and switched repository/cache/server/form-registry callers to import them directly from `$lib/config/discovery`.
- Verified with `npm run check` and `npx vitest run src/lib/config/discovery.spec.ts src/lib/blocks/registry.spec.ts src/lib/stores/content-cache.spec.ts`.
- Phase 3 / Slice 23 completed.
- Extracted field compatibility helpers into `src/lib/config/fields-compat.ts` and switched the remaining field-helper callers away from the deleted bridge module path.
- Confirmed there are no remaining `src/` imports from `src/lib/types/config.ts`.
- Verified with `npm run check` and `npx vitest run src/lib/config/discovery.spec.ts src/lib/features/forms/helpers.spec.ts src/lib/content/service.spec.ts src/lib/blocks/adapters/structured.spec.ts src/lib/stores/content-cache.spec.ts`.
- Phase 3 / Slice 24 completed.
- Deleted the now-unused temporary compatibility bridge at `src/lib/types/config.ts` after confirming it had no remaining code callers outside docs/plans.
- Verified with `npm run check` and `npx vitest run src/lib/config/discovery.spec.ts src/lib/features/forms/helpers.spec.ts src/lib/content/service.spec.ts src/lib/blocks/registry.spec.ts src/lib/stores/content-cache.spec.ts`.
- Phase 3 / Slice 25 completed.
- Replaced the remaining runtime `config.fields` reads in `src/lib/utils/validation.ts` and `src/lib/content/adapters/file.ts` with block-driven metadata helpers from `config.blocks`.
- Added focused validation and content-service coverage for custom collection array validation and generated file-backed IDs sourced from block metadata.
- Verified with `npm run check` and `npx vitest run src/lib/utils/validation.spec.ts src/lib/content/service.spec.ts src/lib/features/forms/helpers.spec.ts`.
- Phase 3 / Slice 26 completed.
- Removed parsed `fields` from `ParsedContentConfig` / `ParsedBlockConfig` in `src/lib/config/parse.ts` and updated parser/discovery/helper specs to normalize `blocks` explicitly where that compatibility shape is still under test.
- Confirmed there are no remaining parsed-config `.fields` callers anywhere under `src/lib` or `src/routes`.
- Verified with `npm run check` and `npx vitest run src/lib/config/parse.spec.ts src/lib/config/discovery.spec.ts src/lib/features/forms/helpers.spec.ts src/lib/utils/validation.spec.ts src/lib/content/service.spec.ts`.
- Phase 3 / Slice 27 completed.
- Removed the dead `FieldDefinition`-driven runtime helper path from `src/lib/features/forms/helpers.ts` and `src/lib/blocks/compat.ts` by deleting `getDefaultFieldValue` and `toBlockAdapterUsage`.
- Cleared stale runtime `getFieldLabel` imports from `src/lib/components/form/FormField.svelte` and `src/routes/pages/[page]/[itemId]/edit/+page.svelte`.
- Verified with `npm run check` and `npx vitest run src/lib/features/forms/helpers.spec.ts src/lib/blocks/adapters/structured.spec.ts`.
- Phase 3 / Slice 28 completed.
- Removed the now-unused `getFieldLabel` helper from `src/lib/config/fields-compat.ts`, leaving that module as a narrow explicit compatibility helper for field-shape normalization in specs.
- Verified with `npm run check` and `npx vitest run src/lib/config/parse.spec.ts src/lib/config/discovery.spec.ts src/lib/features/forms/helpers.spec.ts src/lib/content/service.spec.ts`.
- Phase 3 / Slice 29 completed.
- Simplified `src/lib/config/parse.ts` so parsed content configs no longer expose legacy compatibility aliases like `ParsedSingletonConfig`, `ParsedSingleFileArrayConfig`, `contentFile`, `collectionPath`, `template`, or top-level `filename`.
- Updated parser/discovery specs to assert against the explicit `config.content` shape instead of those compatibility aliases.
- Verified with `npm run check` and `npx vitest run src/lib/config/parse.spec.ts src/lib/config/discovery.spec.ts src/lib/features/forms/helpers.spec.ts src/lib/content/service.spec.ts`.
- Phase 3 / Slice 30 completed.
- Replaced the remaining route-level legacy content vocabulary in the page list/detail routes with explicit labels like `single entry`, `file collection`, and `directory collection`, and updated the related page-route server comments to match the current content model.
- Rewrote `src/routes/docs/+page.svelte` so the in-app docs now describe the explicit v1 schema (`type`, `content`, `blocks`, reusable block configs, root discovery settings, and migration notes) instead of the removed legacy `fields` / `contentFile` / inferred-type model.
- Verified with `npm run check` and `npx vitest run src/lib/config/parse.spec.ts src/lib/config/discovery.spec.ts src/lib/content/service.spec.ts src/lib/utils/draft-comparison.spec.ts src/lib/features/content-management/item.spec.ts`.
- Phase 3 completed.
- The remaining legacy top-level schema/docs surface has been cleared: routes and docs now describe the explicit config model, parsed configs no longer expose bridge aliases, and Phase 3's content adapter cleanup is in place end-to-end.
- Phase 4 / Slice 1 completed.
- Added `src/lib/blocks/adapter-files.ts` as the first custom-adapter file boundary for local block configs, including repo-relative adapter path resolution and validation of the named `adapter` module export.
- Extended `src/lib/blocks/registry.ts` so `loadBlockRegistry` can accept an injected local adapter-module loader, attach validated adapter-file metadata to local registry entries, and fall back to the structured adapter when no custom adapter is loaded.
- Added focused registry tests covering successful custom-adapter loading plus failures for missing named exports and block-type mismatches.
- Verified with `npm run check` and `npx vitest run src/lib/blocks/registry.spec.ts`.
- Phase 4 / Slice 2 completed.
- Extended `src/lib/repository/local.ts` with a concrete local-only adapter-module loader that reads repo files through the browser file-handle backend, imports self-contained `.js` / `.mjs` ESM via blob URLs, and surfaces unsupported local runtime cases explicitly.
- Added `createLoadedBlockRegistry(...)` plus local-content store wiring so local mode now loads a real block registry asynchronously, preserves adapter-load failures as explicit UI state, and threads the loaded registry into the local read/edit/new route consumers.
- Added focused local-loader coverage in `src/lib/repository/local.spec.ts`.
- Updated the Phase 4 architecture/spec docs to record the current local runtime constraint that adapter files must be self-contained `.js` / `.mjs` ESM modules for now.
- Verified with `npm run check` and `npx vitest run src/lib/blocks/registry.spec.ts src/lib/repository/local.spec.ts`.
- Phase 4 / Slice 3 completed.
- Updated `src/routes/docs/+page.svelte` with a dedicated custom block adapter section covering reusable block `adapter` declarations, the required named `adapter` export, relative path resolution, local registry error behavior, and the current self-contained `.js` / `.mjs` local runtime constraint.
- Added a matching reusable-block custom-adapter example to the in-app docs and migration notes so authors can follow the implementation that now exists in local mode.
- Verified with `npm run check`.
- Phase 4 completed.
- Phase 4 now has the planned loader boundary, validation rules, local runtime integration, and author-facing documentation in place.
- Phase 4 / Slice 4 completed.
- Reviewed the shipped Phase 4 result against the rollout goals and confirmed that the current local-only custom-adapter runtime constraints are acceptable for v1.
- Decided not to open another Phase 4 hardening slice before Phase 5; the current boundary is intentionally narrow but coherent, documented, and validated.
- Decided not to start Phase 5 package work immediately by default; package-distributed blocks remain a later extension point rather than the current recommended next implementation step.
- Phase 5 / Slice 1 completed.
- Added `blockPackages` to the parsed root-config contract in `src/lib/config/types.ts` and `src/lib/config/parse.ts`, including validation that it is an array of non-empty package names.
- Added `src/lib/blocks/packages.ts` plus `src/lib/blocks/adapter-contract.ts` to define the first package export contract: package modules expose a named `blockPackage` object whose `blocks` array contributes reusable `type: "block"` configs with optional direct adapter objects.
- Extended `src/lib/blocks/registry.ts` so the async registry loader reads `rootConfig.blockPackages`, merges package blocks after built-ins and local blocks, gives package blocks the same structured-adapter fallback behavior as local reusable blocks, and throws explicit duplicate-ID or missing-loader/export errors.
- Extended `src/lib/blocks/registry.spec.ts` and `src/lib/config/parse.spec.ts` with focused coverage for root-config parsing, package block loading, structured package defaults, missing package loaders/exports, and local-vs-package ID conflicts.
- Tightened the plan/spec docs in `plans/content-system-redesign/02-adapter-and-registry.md` and `plans/content-system-redesign/04-v1-spec.md` so the written Phase 5 contract now matches the shipped code.
- Verified with `npm run check` and `npx vitest run src/lib/config/parse.spec.ts src/lib/blocks/registry.spec.ts`.
- Phase 5 / Slice 2 completed.
- Chose the first concrete package-loader runtime boundary: GitHub-backed/server mode now loads installed package modules, serializes structured package block configs into route data, and merges them into the client-side registry after built-ins and local blocks.
- Added `src/lib/server/block-registry-data.ts` plus focused tests in `src/lib/server/block-registry-data.spec.ts` to load package blocks for GitHub-backed routes, reject package definitions that rely on direct adapter exports, and surface route-friendly registry errors instead of silently ignoring package failures.
- Updated the GitHub-backed page/new/edit route loaders to pass `packageBlocks` and `blockRegistryError` through to the page clients, and updated the corresponding Svelte pages so non-local mode builds registries from built-ins + local blocks + package blocks only when that server-side load succeeded.
- Updated `src/lib/stores/local-content.ts` so local browser-backed mode now fails explicitly when `root.blockPackages` is configured instead of quietly building an incomplete registry.
- Tightened the Phase 5 plan/spec docs to record the new runtime decision: the first supported path is GitHub-backed/server mode with structured package blocks only, while local browser mode remains unsupported for `blockPackages`.
- Verified with `npm run check` and `npx vitest run src/lib/config/parse.spec.ts src/lib/blocks/registry.spec.ts src/lib/server/block-registry-data.spec.ts`.
- Phase 5 / Slice 3 completed.
- Updated `src/routes/docs/+page.svelte` to document `root.blockPackages`, add a dedicated package-blocks section, and explain the exact first supported runtime boundary: GitHub-backed/server mode with installed structured package blocks only.
- Added matching examples and migration/discovery notes so the in-app docs now call out the current limits clearly: direct package adapter exports are rejected in that path, and local browser-backed mode still does not support `blockPackages`.
- Tightened the user-visible package error copy in `src/lib/server/block-registry-data.ts` and `src/lib/stores/local-content.ts` so product-facing guidance uses the same GitHub-backed/server-versus-local wording as the docs.
- Verified with `npm run check`.
- Phase 5 / Slice 4 completed.
- Reviewed the realistic widening directions for package runtime support and concluded there is no obviously small safe follow-up slice: GitHub-backed direct package adapters would require a new adapter-execution boundary, while local browser `blockPackages` support would require a package-resolution/loading strategy that does not exist yet.
- Decided with the user to keep broader package runtime support deferred and treat the current GitHub-backed structured-only path as the intentional Phase 5 stopping point.
- Updated the rollout/architecture docs to record that decision so the plan now favors real-world trial of the refactored core before broader package runtime work or blueprints.

## Files Changed In Current Program Of Work

- `/Users/kilmc/code/tentman/src/lib/config/types.ts`
- `/Users/kilmc/code/tentman/src/lib/config/blocks.ts`
- `/Users/kilmc/code/tentman/src/lib/config/parse.ts`
- `/Users/kilmc/code/tentman/src/lib/config/discovery.ts`
- `/Users/kilmc/code/tentman/src/lib/config/fields-compat.ts`
- `/Users/kilmc/code/tentman/src/lib/config/root-config.ts`
- `/Users/kilmc/code/tentman/src/lib/config/parse.spec.ts`
- `/Users/kilmc/code/tentman/src/lib/config/discovery.spec.ts`
- `/Users/kilmc/code/tentman/src/lib/repository/local.ts`
- `/Users/kilmc/code/tentman/src/lib/repository/local.spec.ts`
- `/Users/kilmc/code/tentman/src/lib/repository/github.ts`
- `/Users/kilmc/code/tentman/src/lib/repository/types.ts`
- `/Users/kilmc/code/tentman/src/lib/blocks/adapters/types.ts`
- `/Users/kilmc/code/tentman/src/lib/blocks/adapter-files.ts`
- `/Users/kilmc/code/tentman/src/lib/blocks/adapter-contract.ts`
- `/Users/kilmc/code/tentman/src/lib/blocks/adapters/builtins.ts`
- `/Users/kilmc/code/tentman/src/lib/blocks/adapters/builtins.spec.ts`
- `/Users/kilmc/code/tentman/src/lib/blocks/adapters/structured.ts`
- `/Users/kilmc/code/tentman/src/lib/blocks/adapters/structured.spec.ts`
- `/Users/kilmc/code/tentman/src/lib/blocks/compat.ts`
- `/Users/kilmc/code/tentman/src/lib/blocks/builtins.ts`
- `/Users/kilmc/code/tentman/src/lib/blocks/packages.ts`
- `/Users/kilmc/code/tentman/src/lib/blocks/registry.ts`
- `/Users/kilmc/code/tentman/src/lib/blocks/registry.spec.ts`
- `/Users/kilmc/code/tentman/src/lib/server/block-registry-data.ts`
- `/Users/kilmc/code/tentman/src/lib/server/block-registry-data.spec.ts`
- `/Users/kilmc/code/tentman/src/lib/components/form/StructuredBlockField.svelte`
- `/Users/kilmc/code/tentman/src/lib/components/form/FormGenerator.svelte`
- `/Users/kilmc/code/tentman/src/lib/components/form/FormField.svelte`
- `/Users/kilmc/code/tentman/src/lib/components/form/ArrayField.svelte`
- `/Users/kilmc/code/tentman/src/lib/components/content/ContentValueDisplay.svelte`
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
- `/Users/kilmc/code/tentman/src/lib/utils/validation.ts`
- `/Users/kilmc/code/tentman/src/lib/utils/validation.spec.ts`
- `/Users/kilmc/code/tentman/src/routes/pages/[page]/preview-changes/+page.server.ts`
- `/Users/kilmc/code/tentman/src/routes/pages/[page]/[itemId]/preview-changes/+page.server.ts`
- `/Users/kilmc/code/tentman/src/routes/pages/[page]/+page.server.ts`
- `/Users/kilmc/code/tentman/src/routes/pages/[page]/+page.svelte`
- `/Users/kilmc/code/tentman/src/routes/pages/+page.svelte`
- `/Users/kilmc/code/tentman/src/routes/docs/+page.svelte`
- `/Users/kilmc/code/tentman/src/routes/pages/[page]/new/+page.server.ts`
- `/Users/kilmc/code/tentman/src/routes/pages/[page]/new/+page.svelte`
- `/Users/kilmc/code/tentman/src/routes/pages/[page]/edit/+page.server.ts`
- `/Users/kilmc/code/tentman/src/routes/pages/[page]/edit/+page.svelte`
- `/Users/kilmc/code/tentman/src/routes/pages/[page]/[itemId]/edit/+page.server.ts`
- `/Users/kilmc/code/tentman/src/routes/pages/[page]/[itemId]/edit/+page.svelte`
- `/Users/kilmc/code/tentman/src/routes/pages/[page]/preview-changes/+page.server.ts`
- `/Users/kilmc/code/tentman/src/routes/pages/[page]/[itemId]/preview-changes/+page.server.ts`
- `/Users/kilmc/code/tentman/src/routes/publish/+page.server.ts`
- `/Users/kilmc/code/tentman/src/routes/docs/+page.svelte`
- `/Users/kilmc/code/tentman/plans/content-system-redesign/03-phased-rollout.md`
- `/Users/kilmc/code/tentman/plans/content-system-redesign/02-adapter-and-registry.md`
- `/Users/kilmc/code/tentman/plans/content-system-redesign/04-v1-spec.md`
- `/Users/kilmc/code/tentman/plans/content-system-redesign/07-implementation-status.md`

## Blockers Or Open Questions

- There is no active blocker in the shipped refactor path; the next step is practical trial and follow-up hardening.
- The current local runtime only supports self-contained `.js` / `.mjs` ESM adapter files loaded through browser blob URLs. Repo-local TypeScript adapter authoring and adapter modules with further local imports would need a later transpilation or import-resolution step.
- The first supported `blockPackages` path is now GitHub-backed/server mode only, and it depends on the referenced block packages being installed in the Tentman app runtime.
- Package blocks that rely on direct adapter exports are still unsupported in that first runtime because the current client-side form/display registry cannot serialize adapter functions across the server boundary.
- Local browser-backed repository mode still does not support `blockPackages`; broadening Phase 5 beyond the current GitHub-backed structured-only path would require a different loading/distribution strategy.
- Blueprints/scaffolding remain deliberately deferred; they should only come back into focus after the redesigned system has been used enough to prove what higher-level generation is actually needed.

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
- The dead legacy option/preview types in `src/lib/features/content-management/types.ts` have been removed, and route-level singleton/collection gating now derives from `config.collection` / `config.content.mode` instead of `discoveredConfig.type`.
- `DiscoveredConfig.type` has now been removed entirely, and the runtime-type bridge exports were deleted before the final bridge cleanup.
- The persistence path, item identity helpers, draft comparison helpers, form/validation helpers, and caller-facing `Config` typing no longer import the bridge's legacy parsed-config aliases or its `Config` alias.
- `DiscoveredConfig` / `DiscoveredBlockConfig` and field compatibility helpers now live under `src/lib/config/*`, and `src/lib/types/config.ts` has been deleted.
- Parsed configs no longer carry `fields`, and the remaining compatibility surface is now limited to the standalone `src/lib/config/fields-compat.ts` helper module plus a few dead or test-only callers.
- Runtime code no longer depends on `FieldDefinition`-driven default/adapter helpers, leaving `fields-compat.ts` as a much narrower explicit compatibility surface for specs plus one final dead label helper.
- `src/lib/config/fields-compat.ts` is now reduced to normalization helpers only, and parsed content configs no longer manufacture legacy top-level persistence aliases beyond the explicit `content` object.
- The main remaining legacy-facing surface under `src/` is UI/docs vocabulary that still talks about `singleton` / `array` / `collection` and old `contentFile` / `collectionPath` concepts even though runtime behavior has moved on.
- The route-level UI vocabulary and the in-app docs page have now been migrated to the explicit v1 schema, so the redesign can move into Phase 4 without carrying the old top-level content model in user-facing documentation.
- Added a narrow Phase 4 loader boundary in `src/lib/blocks/adapter-files.ts` and `src/lib/blocks/registry.ts` that resolves adapter paths relative to each block config file and validates a named `adapter` export before registry wiring uses it.
- Kept the existing synchronous `createBlockRegistry(...)` path on generated structured adapters for now; custom adapter files only enter through the async `loadBlockRegistry(..., { loadLocalAdapterModule })` boundary until the next slice wires a concrete local loader strategy.
- The local browser-backed repository path now provides that concrete loader strategy: local mode reads adapter files through `FileSystemDirectoryHandle`, loads self-contained `.js` / `.mjs` ESM via blob URLs, and surfaces adapter-load failures separately from config discovery failures.
- The plan docs now note this current runtime limit so the written spec matches the shipped Phase 4 behavior rather than still implying repo-local `.ts` adapter files already work end-to-end.
- The in-app docs page now documents the same custom-adapter contract and runtime constraints, so local adapter authoring guidance lives in both the implementation plans and the product docs.
- The planned post-Phase-4 pause is now complete: the current local-only adapter model is accepted for v1, no extra Phase 4 hardening slice is required right now, and Phase 5 package work remains explicitly deferred until it is worth the extra complexity.
- Phase 5 now has a concrete code-level contract before any runtime support: `rootConfig.blockPackages` is the package list, package modules use a named `blockPackage` export, package block entries may carry direct adapters, and the async registry loader merges them after built-ins and local blocks with hard duplicate errors.
- The contract is intentionally loader-agnostic for now: the shipped code requires an injected `loadBlockPackageModule(...)` and throws a clear error if `blockPackages` is configured without one.
- Package-backed reusable blocks now share the same structured-block fallback path as local reusable block configs, so the read/form registry logic does not need a separate package-only rendering branch later.
- The first concrete runtime decision is now explicit in code and docs: GitHub-backed/server mode loads installed package modules and passes structured package block configs into the client, while local browser mode rejects `blockPackages` clearly instead of pretending they work.
- Direct package adapter exports remain part of the contract, but the first concrete runtime rejects them explicitly because adapter functions cannot cross the current server-to-client registry boundary.
- Slice 4 closed a plan-level decision: broader package runtime support is intentionally deferred, and the redesign should move into real-world trial before more package work or Phase 6.

## Exact Next Action

Run the redesigned system against real configs/content, note any adoption blockers, and only open the next implementation slice from concrete trial findings rather than from speculative architecture expansion.

## Next Slice

- Phase: 6
- Slice: 1
- Title: Revisit blueprints only if real-world use proves the need
- Status: pending

## Notes For Next Session

- Phase 5 is complete at the current intended boundary.
- `src/lib/blocks/packages.ts` is now the contract boundary for package exports.
- `src/lib/server/block-registry-data.ts` is now the first concrete runtime boundary for package blocks in GitHub-backed/server mode.
- `src/routes/docs/+page.svelte` now documents the first supported `blockPackages` path and its limits.
- The next practical work should come from trying the redesign on real content, not from opening blueprints or broader package/runtime support preemptively.

## Ready-To-Paste Continuation Prompt

Continue working on the Tentman content-system redesign.

Start by reading these files:

- /Users/kilmc/code/tentman/plans/content-system-redesign/README.md
- /Users/kilmc/code/tentman/plans/content-system-redesign/03-phased-rollout.md
- /Users/kilmc/code/tentman/plans/content-system-redesign/04-v1-spec.md
- /Users/kilmc/code/tentman/plans/content-system-redesign/05-hard-cut-migration.md
- /Users/kilmc/code/tentman/plans/content-system-redesign/06-implementation-protocol.md
- /Users/kilmc/code/tentman/plans/content-system-redesign/07-implementation-status.md

Then follow the protocol exactly:

1. Summarize the current slice from the status doc.
2. State the exact next step you are taking.
3. Implement only that slice.

Work from the repo state now in place. Phases 1 through 5 of the core redesign are complete enough to trial: explicit `type: "content"` / `type: "block"` configs are live, block-based form/read rendering is wired through the registry, content persistence runs through the new content service, local custom adapter files exist with their current runtime limits, and Phase 5 stops intentionally at the current GitHub-backed/server structured-package boundary. Broader package runtime support and Phase 6 blueprints/scaffolding are both deferred for now. The current slice is post-rollout trial work: run the redesigned system on real content, capture adoption blockers, and use those findings to decide what narrow follow-up slice should come next.

Before ending, update `07-implementation-status.md` again and provide a fresh ready-to-paste continuation prompt.
