# Asset Rendering Context Refactor Plan

## Context

The asset config MVP moved Tentman from legacy per-block `assetsDir` behavior to root-level asset config:

```json
{
	"assets": {
		"path": "./static/images/projects",
		"publicPath": "/images/projects"
	}
}
```

That model is correct, but the rendering layer is currently too ad hoc. Components decide for themselves whether to read from `localContent`, `page.data.rootConfig`, `localPreviewUrl`, or GitHub route data. This creates inconsistent behavior between local and GitHub-backed sessions.

The immediate symptom is that GitHub-backed image previews can resolve to a local preview URL instead of the GitHub asset proxy.

## Goals

- Make asset rendering mode-aware in one place.
- Ensure GitHub-backed sessions never use `local.previewUrl` for asset image sources.
- Ensure local sessions keep using `local.previewUrl` when configured.
- Ensure GitHub sessions route managed relative and public asset paths through `/api/repo/asset`.
- Remove component-level `localContent ?? page.data` asset decisions.
- Clarify the difference between a full root config and any lightweight session summary.
- Add tests that cover the GitHub/local/no-backend asset rendering matrix.

## Non-Goals

- Redesign upload staging or draft asset storage.
- Reintroduce `assetsDir` behavior.
- Change persisted content values beyond ensuring new draft assets materialize to `assets.publicPath`.
- Add support for unauthenticated GitHub asset access.

## Current Problems

### 1. Backend Mode Is Decided In Too Many Places

These surfaces currently participate in asset URL selection:

- `apps/web/src/lib/components/AssetImage.svelte`
- `apps/web/src/lib/features/markdown-editor/RichEditorImage.svelte`
- `apps/web/src/lib/components/content/ContentValueDisplay.svelte`
- `apps/web/src/lib/features/draft-assets/image-resolver.ts`
- `apps/web/src/lib/utils/assets.ts`

Some of them reach directly into `localContent`; some use `page.data.rootConfig`; some pass a `previewBaseUrl`; some rely on `resolveClientAssetUrl` to infer GitHub mode from `$app/state`.

The result is fragile: a component can accidentally combine GitHub route data with stale local config or local preview state.

### 2. `rootConfig` Has Ambiguous Shape

The top-level GitHub session bootstrap stores a lightweight root config snapshot, currently only `siteName` and `componentsDir`. The `/pages` repo bootstrap returns a full parsed root config including `assets`.

Both are exposed as `rootConfig`, which makes it unclear whether code can rely on `rootConfig.assets`.

### 3. Browser Coverage Is Stale

`asset-rendering.svelte.spec.ts` still contains legacy `assetsDir` expectations. It does not cover the current root `assets` model for GitHub-backed image rendering.

## Proposed Architecture

Introduce one client-side asset rendering context helper.

Example shape:

```ts
type AssetRenderContext =
	| {
			mode: 'github';
			assets: RootAssetsConfig | null;
			repository: {
				owner: string;
				name: string;
				defaultBranch: string;
			} | null;
	  }
	| {
			mode: 'local';
			assets: RootAssetsConfig | null;
			previewBaseUrl: string | null;
	  }
	| {
			mode: 'none';
			assets: null;
			previewBaseUrl: null;
	  };
```

Suggested module:

```txt
apps/web/src/lib/features/assets/render-context.ts
```

The helper should accept explicit inputs rather than importing `$app/state` internally:

```ts
export function getAssetRenderContext(input: {
	selectedBackend: SelectedBackend | null | undefined;
	selectedRepo: GitHubRepositoryIdentity | null | undefined;
	rootConfig: RootConfig | null | undefined;
	localRootConfig: RootConfig | null | undefined;
	localPreviewUrl: string | null | undefined;
}): AssetRenderContext;
```

This keeps the helper pure and easy to unit test.

## Resolution Rules

### GitHub Mode

- Relative managed asset value, such as `hero.jpg`, resolves to `/api/repo/asset`.
- Public managed asset value, such as `/images/projects/hero.jpg`, resolves to `/api/repo/asset`.
- `local.previewUrl` is ignored completely.
- `localContent.rootConfig` is ignored completely.
- External absolute URLs are preserved.
- `draft-asset:` refs resolve through the draft asset store.
- If `assets` is missing, return a deliberate fallback. Prefer `null` for previews that cannot be resolved, or preserve the raw public path only if that is already existing behavior and tests lock it down.

### Local Mode

- Root `assets.publicPath` maps saved asset values to a browser URL.
- `local.previewUrl` provides the origin when present.
- GitHub proxy is never used.
- External absolute URLs are preserved.
- `draft-asset:` refs resolve through the draft asset store.

### No Backend

- Do not infer local preview behavior.
- Preserve external absolute URLs.
- Public paths may remain public paths.
- Relative managed values should avoid pretending to be resolvable without an asset context.

## Implementation Pass 1

1. Add the pure asset render context helper.
2. Add a resolver that accepts `AssetRenderContext`, for example:

	```ts
	export async function resolveAssetUrlForRender(
		value: string | null | undefined,
		context: AssetRenderContext
	): Promise<string | null>;
	```

3. Move GitHub proxy URL construction into that resolver.
4. Move local preview URL application into that resolver.
5. Update these surfaces to use the helper/resolver:
	- `AssetImage.svelte`
	- `RichEditorImage.svelte`
	- `ContentValueDisplay.svelte`
6. Remove direct asset decisions like:

	```ts
	$localContent.rootConfig?.assets ?? page.data.rootConfig?.assets
	```

7. Add focused unit tests for the resolver/context helper.
8. Update or add browser tests for the current root `assets` model.

## Implementation Pass 2

1. Rename the top-level GitHub session root config snapshot to avoid implying it is the full root config.
	- Candidate: `rootConfigSummary`
	- Candidate: `selectedRepoConfigSummary`
2. Update `SessionBootstrap`, `App.Locals`, and downstream route data typing.
3. Ensure `/pages` route data remains the source of the full root config.
4. Audit all `page.data.rootConfig` uses and confirm whether each expects the full or summary shape.

## Suggested Test Matrix

- GitHub + root assets + `hero.jpg` -> `/api/repo/asset?value=hero.jpg&assetPath=...&publicPath=...`
- GitHub + root assets + `/images/projects/hero.jpg` -> `/api/repo/asset?...`
- GitHub + root assets + `local.previewUrl` configured -> still `/api/repo/asset`, never `localhost`.
- GitHub + no root assets + `hero.jpg` -> deliberate unresolved state.
- Local + root assets + local preview URL + `hero.jpg` -> `http://localhost:4173/images/...`
- Local + root assets + no preview URL + `hero.jpg` -> `/images/...`
- External absolute URL -> unchanged in all modes.
- `draft-asset:` -> draft asset store result in all modes.

## Acceptance Criteria

- A GitHub-backed repository with root `assets.path` and `assets.publicPath` renders saved image fields and markdown images through `/api/repo/asset`.
- Local preview URLs are only used when the selected backend is local.
- No rendering component contains a backend decision based on `localContent ?? page.data`.
- Tests fail if GitHub mode renders managed assets with a localhost preview URL.
- Legacy `assetsDir` still warns only and does not drive asset behavior.

