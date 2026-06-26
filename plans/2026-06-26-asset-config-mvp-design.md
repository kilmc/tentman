# Asset Config MVP Design

## Goal

Design the smallest responsible asset config system that fixes GitHub issue #39 while replacing the old `assetsDir` behavior with one explicit model.

The core product boundary is:

> Tentman saves files to `assets.path` and writes URLs under `assets.publicPath`. The site is responsible for serving that public path.

This keeps Tentman out of framework-specific asset pipelines while still supporting SvelteKit, 11ty, and other static/public asset setups.

## Root Config

Tentman supports one root-level asset mapping in `tentman.json`:

```json
{
	"assets": {
		"path": "./src/assets",
		"publicPath": "/assets"
	}
}
```

`assets` is optional. Projects without managed uploads or managed repo asset proxying should continue to work normally.

### `assets.path`

`assets.path` is the repository storage path for managed uploads.

Rules:

- Required when `assets` exists.
- Must be a non-empty string.
- Must be repo-relative.
- Allows ordinary relative spellings such as `assets`, `./assets`, and `./tentman/configs/assets`.
- Rejects absolute paths, `~`, URLs, Windows drive roots, and paths that escape the repo with `..`.
- Does not support template variables in the MVP.
- Normalizes internally to a repo-relative path with a trailing slash, for example `tentman/configs/assets/`.

### `assets.publicPath`

`assets.publicPath` is the public URL prefix Tentman writes into content.

Rules:

- Required when `assets` exists.
- Must be a non-empty string.
- Must be root-relative, such as `/assets`, `/images`, or `/`.
- Rejects full URLs, relative paths, empty strings, `..`, query/hash suffixes, and unsupported shapes.
- Does not support template variables in the MVP.
- Normalizes trailing slashes away except for `/`.

`assets.publicPath: "/"` is valid and means root-public references such as `/logo.png`.

## Legacy `assetsDir`

`assetsDir` is no longer supported behavior.

Old configs should still load, but Tentman should warn:

```txt
assetsDir is no longer used. Configure assets.path and assets.publicPath in tentman.json instead.
```

Behavior:

- Root `assetsDir` is ignored.
- Block-level `assetsDir` is ignored.
- Legacy `assetsDir` should not influence upload, preview, proxy, asset checking, schema output, or unused-asset detection.
- Warnings should appear in existing configuration warning surfaces, not as toasts.
- Root `assetsDir` should produce a global/project-level warning.
- Block-level `assetsDir` should attach to the owning config or reusable block where possible.
- Remove `assetsDir` from public config types, docs, schema/list output, and normal fixtures.
- Preserve raw/internal legacy visibility only where needed to generate warnings.

## Ownership And Shared Utilities

`@tentman/core` owns the asset config contract.

Core should export small, dependency-free utilities for:

- Parsing, normalizing, and validating root `assets`.
- Resolving asset values against `{ path, publicPath }`.
- Building repo paths from public or relative asset values.
- Building public paths for uploaded filenames.
- Detecting legacy `assetsDir` usage for diagnostics and warnings.

The web app should use core root config parsing for `tentman.json`, so root asset behavior has one source of truth. Full content/block parser consolidation is out of scope for this MVP.

User-facing docs should document only the config shape, not internal helper names.

## Proxy And Preview

Remove the old `static/` inference model and remove `getPublicPathFromAssetsDir`.

The GitHub repo asset proxy should use explicit mapping params:

```txt
value
assetPath
publicPath
owner
repo
branch
```

Rules:

- If `value` starts with `/`, it must match `publicPath`, unless `publicPath` is `/`.
- If `value` is relative, resolve it under `assetPath`.
- Reject path traversal, query/hash suffixes, external URLs, `data:`, `blob:`, and `draft-asset:` values.
- Read from the Tentman draft branch first when present, then fall back to the default branch.
- Do not accept legacy `assetsDir` as a proxy mapping.

The issue #39 mapping must work:

```txt
value: /assets/05-skiingdino_carolinabuzio.jpg
assetPath: tentman/configs/assets
publicPath: /assets
repo path: tentman/configs/assets/05-skiingdino_carolinabuzio.jpg
```

### GitHub Mode

With valid root `assets`, managed root-relative and relative asset values should use the private repo proxy.

Without valid root `assets`, Tentman should not proxy managed local values. It should leave them as-is or let normal rendering handle them.

External, `data:`, and `blob:` URLs remain direct.

### Local Mode

For root-relative values, local mode should use `local.previewUrl` when available.

Without `local.previewUrl`, leave root-relative values as-is.

Do not synthesize direct file URLs from `assets.path`; local previews should reflect what the site serves.

## Uploads

Managed uploads require a valid root `assets` mapping.

If root `assets` is missing:

- Disable markdown image upload/insert controls.
- Disable image-field upload controls.
- Keep manual string editing available.
- Use this tooltip copy:

```txt
Configure assets.path and assets.publicPath in tentman.json to enable uploads
```

When uploading:

- Markdown fields and image fields use the same root asset mapping.
- Files are written under `assets.path`.
- Content receives `assets.publicPath` plus the generated filename.
- Keep the current filename policy: sanitized basename plus short draft id suffix.
- Do not require the target directory to already exist. Repository backends should create/write the target file path.

Draft asset metadata and form manifests should carry the storage path and public path used when the asset was staged.

On save, the server must validate staged asset entries against the current root `assets` mapping:

- `storagePath` must match normalized `assets.path`.
- Final public paths must be under normalized `assets.publicPath`.

If root `assets` changed between staging and saving, reject the stale staged asset instead of writing to an old path.

## Asset Values

Managed asset values support:

- Root-relative public paths under `assets.publicPath`, such as `/assets/photo.jpg`.
- Relative paths such as `photo.jpg` and `gallery/photo.jpg`, resolved under `assets.path`.

Managed asset values reject:

- Traversal such as `../secret.jpg` or `/assets/../secret.jpg`.
- Query/hash suffixes such as `/assets/photo.jpg?v=1` or `/assets/photo.jpg#caption`.
- External URLs, `data:`, `blob:`, and `draft-asset:` values for repo proxy/checking.

External/manual URLs may still be used as content values, but they are outside the managed asset system.

## Core And CLI Asset Checks

Core and CLI behavior should match the web app.

Asset list/check should use the root `assets` mapping and cover:

- Structured `image` fields.
- Markdown image destinations in `markdown` blocks.
- HTML `<img src="...">` values inside markdown fields.

Ignore:

- External absolute URLs.
- `data:`, `blob:`, and `draft-asset:` values.

Markdown asset paths can be reported with field paths like:

```txt
body.markdownImages[0]
```

Checks:

- Root-relative managed values outside `assets.publicPath` should report a path mismatch.
- Missing repo files under `assets.path` should report a missing asset.
- Unused asset detection should scan only root `assets.path`.
- Markdown references count as used.
- Legacy `assetsDir` produces warnings but does not affect resolution.

## Docs

Update the public docs/reference only.

Document:

- `assets.path`
- `assets.publicPath`
- The product boundary: Tentman writes files and references; the site serves them.

SvelteKit-style example:

```json
{
	"assets": {
		"path": "./static/images",
		"publicPath": "/images"
	}
}
```

11ty-style example:

```json
{
	"assets": {
		"path": "./src/assets",
		"publicPath": "/assets"
	}
}
```

Do not keep `assetsDir` in docs.

## Tests

Use the existing unit, integration, and browser test setup. Do not add a new E2E policy for this MVP.

Cover:

- Core asset config normalization and validation.
- Web root config parsing through core.
- GitHub proxy explicit mapping, including issue #39.
- Rejection of traversal, invalid public paths, and missing mappings.
- Draft upload materialization writes to `assets.path` and writes public refs.
- Save rejects stale staged asset mappings.
- Markdown and image field upload-disabled UI when `assets` is missing.
- Markdown/image preview URL generation with and without mapping.
- Core asset list/check includes markdown refs and structured image refs.
- Unused asset detection counts markdown refs as used.
- Legacy `assetsDir` produces warnings and does not affect behavior.

## Non-Goals

This MVP does not include:

- Block-level or collection-level `assets` overrides.
- Template variables in asset paths.
- CDN or fully-qualified public paths.
- Query/hash suffix support for managed assets.
- Framework-specific asset processing, imports, transforms, or optimization.
- Full content/block config parser consolidation.
