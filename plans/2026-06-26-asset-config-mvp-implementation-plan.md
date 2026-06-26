# Tentman Asset Config MVP Implementation Plan

## Summary

Implement the MVP as a root-level asset mapping owned by `@tentman/core`:

```json
{
  "assets": {
    "path": "./tentman/configs/assets",
    "publicPath": "/assets"
  }
}
```

Tentman writes files under normalized `assets.path`, writes content references under normalized `assets.publicPath`, and never uses legacy `assetsDir` for behavior. Legacy root/block `assetsDir` remains visible only long enough to produce warnings.

Primary affected areas: core asset helpers/checks/schema, web root config parsing and asset preview/upload flows, GitHub repo proxy, CLI asset commands, docs, and fixtures/tests.

## Public API And Type Changes

- Add `RootAssetConfig` to `@tentman/core` with normalized shape:
  - `path: string`, repo-relative with trailing slash, e.g. `tentman/configs/assets/`
  - `publicPath: string`, root-relative without trailing slash except `/`
- Add core exports from a new `packages/core/src/assets-config.js`:
  - `parseRootAssetsConfig(input, context?)`
  - `getRootAssetsConfigDiagnostics(rawRootConfig)`
  - `resolveManagedAssetValue(value, assets)`
  - `buildManagedAssetPublicPath(filename, assets)`
  - `buildManagedAssetRepoPath(value, assets)`
  - `isIgnoredAssetValue(value)`
- Update `parseRootConfig` in core to return `assets?: RootAssetConfig` and preserve raw/internal legacy visibility for diagnostics.
- Update web `RootConfig` to include `assets?: RootAssetConfig` and remove `assetsDir` from public/root-facing behavior.
- Remove `assetsDir` from CLI schema output and public docs. Keep block/root parser tolerance only for warning generation.

## Implementation Phases

### Phase 1: Core Root Asset Semantics

- Create core asset config utilities in `packages/core/src/assets-config.js`.
- Validate `assets.path`:
  - required when `assets` exists
  - non-empty string
  - repo-relative only
  - allow `assets`, `./assets`, `./tentman/configs/assets`
  - reject absolute paths, `~`, URLs, Windows drive roots, and escaping `..`
  - normalize to repo-relative POSIX path with trailing slash
- Validate `assets.publicPath`:
  - required when `assets` exists
  - non-empty root-relative path
  - allow `/`
  - reject full URLs, relative paths, `..`, query/hash
  - normalize trailing slash away except `/`
- Add diagnostics for legacy `assetsDir`:
  - root warning: `assetsDir is no longer used. Configure assets.path and assets.publicPath in tentman.json instead.`
  - block/reusable block warning attached to owner where possible
- Update core `parseRootConfig`, `index.js`, and `index.d.ts`.
- Verification:
  - focused unit tests for normalization, invalid shapes, ignored legacy `assetsDir`, and issue #39 mapping.

### Phase 2: Core Asset Listing, Checking, And Unused Detection

- Rework `packages/core/src/assets.js` to use only `project.rootConfig.assets`.
- Collect asset references from:
  - structured `image` fields
  - markdown image destinations in `markdown` fields
  - HTML `<img src="...">` inside markdown fields
- Ignore external URLs, `data:`, `blob:`, and `draft-asset:` values.
- For managed references:
  - root-relative values must be under `assets.publicPath`
  - relative values resolve under `assets.path`
  - traversal/query/hash should report diagnostics, not resolve
  - missing repo files under `assets.path` should report `assets.missing-file`
- Rework unused detection to scan only root `assets.path`; markdown references count as used.
- Update `assets-check.js`, `schema.js`, CLI display labels, and fixture expectations.
- Verification:
  - `pnpm --filter @tentman/core run test`
  - specific tests for markdown refs, root-relative mismatch, missing file, unused markdown-used asset, no-assets behavior, and legacy warnings.

### Phase 3: Web Root Config Parsing And Warning Surfaces

- Change web root parsing in `apps/web/src/lib/config/root-config.ts` to call core root parsing/helpers for `assets`.
- Keep existing web content config parser, but stop exposing `assetsDir` as behavior.
- Add discovery issues for legacy root/block `assetsDir` using existing configuration warning surfaces in pages layout.
- Ensure repository snapshot/local/GitHub root config reads keep tolerant failure behavior: invalid root config still yields `null`, invalid `assets` yields no valid `assets` plus diagnostics where available.
- Update GitHub session/root config snapshots to include `assets` if needed by client preview/upload code.
- Verification:
  - web parser tests for valid `assets`, invalid assets behavior, and legacy warnings.
  - existing discovery warning UI tests updated instead of adding a new toast path.

### Phase 4: GitHub Asset Proxy And Client Preview Resolution

- Replace `apps/web/src/lib/utils/assets.ts` and `apps/web/src/lib/server/repo-asset-proxy.ts` semantics:
  - remove `getPublicPathFromAssetsDir`
  - proxy URLs use `value`, `assetPath`, `publicPath`, `owner`, `repo`, `branch`
  - no static/public directory inference
- Route `/api/repo/asset` must reject missing mapping, traversal, query/hash, external, `data:`, `blob:`, and `draft-asset:` values.
- GitHub mode:
  - with valid root `assets`, image/markdown previews use proxy
  - without valid root `assets`, managed local values are left as-is
  - draft branch read first, default branch fallback unchanged
- Local mode:
  - root-relative values use `local.previewUrl` when present
  - without `local.previewUrl`, leave root-relative values as-is
  - do not synthesize URLs from `assets.path`
- Verification:
  - proxy unit tests for issue #39:
    - value `/assets/05-skiingdino_carolinabuzio.jpg`
    - assetPath `tentman/configs/assets`
    - publicPath `/assets`
    - repo path `tentman/configs/assets/05-skiingdino_carolinabuzio.jpg`
  - preview resolver tests with and without valid root assets.

### Phase 5: Upload And Draft Asset Flow

- Replace `defaultAssetStoragePath`, field `storagePath`, and upload behavior with root `assets`.
- Disable markdown and image upload controls when root `assets` is missing or invalid.
- Use tooltip copy exactly:
  - `Configure assets.path and assets.publicPath in tentman.json to enable uploads`
- Keep manual string editing enabled.
- Update draft asset metadata and manifest entries to carry:
  - normalized `storagePath`
  - normalized `publicPath`
  - generated `targetPath`
  - generated final public asset path
- Keep filename policy: sanitized basename plus short draft id suffix.
- Local and GitHub saves both write staged bytes to `assets.path + filename` and replace content refs with `assets.publicPath + filename`.
- Server save validation must reject stale staged assets if:
  - manifest `storagePath` differs from current normalized `assets.path`
  - manifest/final public path is outside current `assets.publicPath`
- Repository backends should write the target file path without requiring the directory to exist first.
- Verification:
  - draft asset shared/server/materialize tests for valid upload, stale mapping rejection, missing assets rejection, markdown refs, and image field refs.
  - browser/unit tests for disabled markdown/image upload controls.

### Phase 6: UI Plumbing Cleanup

- Update `FormGenerator`, `FormField`, `ImageField`, `MarkdownField`, `AssetImage`, array previews, item cards, and content display to consume root asset config instead of block `assetsDir`.
- Remove default `static/images/` fallback from upload paths.
- Keep legacy `assetsDir` props only temporarily where test adapters require them, then remove or rename them to asset mapping props in the same pass.
- Update markdown editor image node/render helpers to resolve through the shared root asset mapping.
- Verification:
  - targeted browser tests for image preview rendering, markdown preview URL rewriting, upload-disabled controls, and no layout regressions in existing field harnesses.

### Phase 7: CLI, Docs, And Fixtures

- Update CLI `assets check`, `assets list`, `assets unused`, and `schema` output to reflect root `assets`.
- Update public docs in `apps/web/src/lib/docs/content.ts` and package READMEs:
  - document only `assets.path` and `assets.publicPath`
  - include SvelteKit example:
    - `path: "./static/images"`
    - `publicPath: "/images"`
  - include 11ty-style example:
    - `path: "./tentman/configs/assets"`
    - `publicPath: "/assets"`
  - state product boundary: Tentman writes files and refs; the site serves them.
- Update normal fixtures, especially `test-app/tentman.json`, away from `assetsDir`.
- Keep dedicated legacy fixtures/tests only for warning behavior.
- Verification:
  - `pnpm --filter @tentman/core run test`
  - `pnpm --filter @tentman/web run test:unit -- --run`
  - `pnpm --filter @tentman/web run check`
  - targeted browser tests where upload UI behavior is covered.

## Risks And Migration Behavior

- Biggest behavioral risk: existing projects with only `assetsDir` will lose managed uploads/proxying. This is intended for MVP, but warnings must be visible and clear.
- GitHub preview risk: asset proxy URLs must include explicit `assetPath` and `publicPath`; any caller still passing `assetsDir` should fail tests.
- Draft upload risk: staged assets created before an assets config change must be rejected rather than silently written to old paths.
- Markdown parsing risk: regex-based extraction should match existing draft asset parsing behavior for markdown image destinations and HTML image tags; avoid broad HTML parsing changes in MVP.
- Fixture risk: changing the shared test app from block-level directories to one root asset directory changes unused detection expectations. Update tests deliberately rather than preserving old multi-directory behavior.

## Assumptions

- MVP supports only one root `assets` mapping; no collection/block overrides and no template variables.
- Invalid or missing root `assets` disables managed uploads/proxying but does not block manual content editing.
- Legacy `assetsDir` is parser-tolerated only for diagnostics and never participates in upload, preview, proxy, checks, schema, or unused detection.
- No new end-to-end test policy is needed; use current unit, integration, and browser test setup.
