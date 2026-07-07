# Typed Asset Picker Plan

## Summary

Add a shared asset picker that lets authors reuse files already in the configured asset directory instead of uploading duplicates.

The picker should be designed as a general typed asset browser, with image support implemented first and video/audio support made natural later. It should be used by image blocks and the rich markdown image insertion flow. Raw markdown textarea insertion is intentionally out of scope.

The core product behavior:

> Authors can either upload a new asset or browse existing assets under `assets.path`, preview the selected asset, and explicitly confirm insertion. Existing assets insert their public value directly; new uploads continue through the existing draft-asset staging flow.

## Goals

- Let authors reuse existing assets without re-uploading files.
- Prevent accidental insertion by requiring a preview-and-confirm step.
- Keep upload behavior compatible with the existing `draft-asset:` staging/materialization system.
- Build a shared picker surface that starts with images but can support video and audio later.
- Let asset listing be filtered by asset kind and extension.
- Keep the feature focused on the authoring UI surfaces that need it first:
  - `image` blocks.
  - rich markdown editor image insertion.

## Non-Goals

- Do not add raw markdown textarea insertion support in this phase.
- Do not add asset deletion, moving, renaming, or replacement.
- Do not add image/video optimization, transcoding, resizing, poster generation, or metadata extraction.
- Do not support external media providers.
- Do not attempt to understand framework-specific build pipelines.
- Do not replace the existing draft asset upload system.

## Current System Notes

Important existing implementation points:

- `apps/web/src/lib/components/form/ImageField.svelte`
  - currently stages uploaded images via `draftAssetStore.create`.
  - shows the current image through `AssetImage`.
  - has no reuse/browse path.
- `apps/web/src/lib/components/form/MarkdownField.svelte`
  - stages rich-editor image uploads through `stageMarkdownFieldImage`.
  - `openImagePicker()` currently clicks a hidden file input.
  - paste/drop insertion should continue uploading/staging new files.
- `apps/web/src/lib/features/draft-assets/*`
  - owns temporary `draft-asset:` refs.
  - replaces staged refs with public paths on save.
  - should remain the upload path for new files.
- `apps/web/src/lib/components/AssetImage.svelte`
  - already resolves a content asset value for preview in local/GitHub contexts.
- `apps/web/src/lib/repository/types.ts`
  - repository backends already expose `listDirectory`.
- `@tentman/core` asset utilities
  - already model `assets.path` and `assets.publicPath`.
  - already scan structured `image` fields and markdown image values for asset checks.

## UX Model

The picker should have two primary modes:

1. Existing assets
2. Upload new

### Existing Assets Mode

Flow:

1. User opens the picker.
2. Picker lists matching assets under the configured `assets.path`.
3. User can search/filter by filename/path.
4. User clicks a thumbnail or list row.
5. The picker shows a larger preview/details panel.
6. User clicks Insert to confirm.
7. Caller receives the selected public asset value, such as `/images/photo.jpg`.

Clicking a thumbnail must not insert immediately. Selection and insertion are separate actions.

For images, the detail panel should show:

- a larger preview of the image.
- filename.
- public path to be inserted.
- repository path if useful.
- Insert button.

For future videos, the same surface should be able to show:

- a video preview/player.
- filename.
- public path.
- Insert button.

### Upload New Mode

Upload should keep existing behavior:

1. User selects a file.
2. File is validated against the active asset kind.
3. File is staged as a `draft-asset:` ref.
4. Caller receives the staged ref.
5. The save pipeline materializes the file and replaces the ref with the final public path.

Image block upload may continue showing a local staged preview. Markdown upload should continue inserting staged image nodes.

### Empty And Disabled States

If `assets.path` or `assets.publicPath` is missing:

- Existing asset browsing should be disabled or show an actionable empty state.
- Upload should remain disabled with the existing message:

```txt
Configure assets.path and assets.publicPath in tentman.json to enable uploads
```

If the configured asset directory exists but contains no matching files:

- Show a simple empty state for the active filter.
- Keep Upload new available.

If listing fails:

- Show an error state in the picker.
- Do not destroy the current field value.

## Typed Asset Model

The picker should accept an asset kind/filter config rather than hardcoding images everywhere.

Suggested model:

```ts
export type AssetPickerKind = 'image' | 'video' | 'audio' | 'file';

export interface AssetPickerFilter {
	kind: AssetPickerKind;
	extensions: string[];
	mimePrefix?: string;
}
```

Initial image filter:

```ts
export const imageAssetFilter: AssetPickerFilter = {
	kind: 'image',
	extensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif'],
	mimePrefix: 'image/'
};
```

Likely future video filter:

```ts
export const videoAssetFilter: AssetPickerFilter = {
	kind: 'video',
	extensions: ['.mp4', '.webm', '.mov', '.m4v'],
	mimePrefix: 'video/'
};
```

Filtering should be extension-based for repository listing because many backends only expose file paths. MIME prefixes are useful for upload validation when a `File.type` is available.

## Asset Entry Model

The picker needs a normalized asset entry type for UI rendering and insertion.

Suggested shape:

```ts
export interface AssetPickerEntry {
	name: string;
	repoPath: string;
	publicPath: string;
	relativePath: string;
	kind: AssetPickerKind;
	extension: string;
}
```

Where:

- `repoPath` is under normalized `assets.path`.
- `relativePath` is the path relative to normalized `assets.path`.
- `publicPath` is `assets.publicPath` plus `relativePath`.
- `name` is the basename for display/search.

Do not include file bytes in the list response/model. Thumbnails/previews should use the same asset rendering/proxy path as existing content values.

## Listing Strategy

The listing should scan files under configured `assets.path`, recursively.

The repository abstraction already exposes:

```ts
listDirectory(path: string, options?: RepositoryReadOptions): Promise<RepoEntry[]>
```

Implementation should add a small asset-listing helper that:

- recursively walks `assets.path`.
- filters files by extension.
- converts each file into an `AssetPickerEntry`.
- sorts entries predictably, probably path/name ascending.
- handles missing directories as an empty list or a clear picker error.

Prefer this logic in a feature module rather than buried inside a Svelte component.

Possible module:

```txt
apps/web/src/lib/features/assets/asset-picker.ts
```

or:

```txt
apps/web/src/lib/features/assets/library.ts
```

Keep the type/filter/path utilities plain TypeScript so they can be unit tested without browser rendering.

## Picker Component

Possible component:

```txt
apps/web/src/lib/components/assets/AssetPicker.svelte
```

The component should be reusable by fields/editors.

Suggested props/events:

```ts
interface Props {
	open: boolean;
	filter: AssetPickerFilter;
	currentValue?: string | null;
	title?: string;
	oninsert: (value: string) => void;
	onupload?: (file: File) => Promise<{ value: string; previewUrl?: string | null }>;
	onclose: () => void;
}
```

The exact interface can follow local Svelte patterns, but the picker should keep a clear separation:

- selecting an existing entry updates internal selected state.
- Insert emits the selected `publicPath`.
- upload emits a staged ref returned by the caller's existing upload path.

The component should not know about markdown syntax. It returns an asset value; callers decide how to apply it.

## Image Field Integration

`ImageField.svelte` should replace the lone file input with a small image-control surface:

- current preview/value remains visible.
- actions:
  - Choose asset
  - Upload new
  - Remove image

The Choose asset action opens the picker in image mode. On Insert:

- clean up the previous value if it was a `draft-asset:` ref.
- set `value` to the selected public path.
- clear staged preview state.
- call `onchange`.

Upload new should preserve current validation/staging behavior. It may either live inside the picker Upload tab or remain as a direct action that opens the picker focused on upload.

## Rich Markdown Integration

The rich editor image toolbar should open the asset picker instead of only opening the native file input.

Existing upload entry points:

- toolbar image upload can become picker-driven.
- paste/drop should stay direct upload/stage behavior.

On selecting an existing asset:

- insert a Tiptap image node with `src` set to the selected public path.
- do not create a draft asset.
- do not touch draft asset cleanup.

On uploading a new asset:

- reuse `stageMarkdownFieldImage`.
- insert a Tiptap image node with `src` set to the staged `draft-asset:` ref.

The markdown field should not add raw textarea insertion support in this phase.

## Preview Rendering

Use the existing asset rendering path where possible:

- Images can use `AssetImage` with the selected `publicPath`.
- For future video/audio, introduce asset preview components that use the same value resolution pattern.

Avoid passing repository bytes through the listing API. Let thumbnails/full previews resolve through existing local object URLs or GitHub asset proxy URLs.

## Validation And Security

Existing upload validation should be generalized by asset kind when future video/audio support arrives.

For v1 images:

- Keep current image upload file-size and `image/*` validation.
- Existing-asset selection should only offer files matching image extensions.
- Do not allow selected public values outside `assets.publicPath`.
- Do not allow path traversal in constructed `publicPath`.

Because listed assets come from the backend under `assets.path`, public path construction should still normalize and validate defensively.

## Testing Plan

Unit tests:

- asset filter matches extensions case-insensitively.
- recursive listing returns only matching files.
- public path construction handles nested files.
- public path construction rejects traversal/weird paths.
- missing asset config returns a disabled/empty result.

Component/browser tests:

- `ImageField` opens picker, selecting a thumbnail shows preview/details, Insert updates the value.
- selecting an existing image after a staged draft image deletes the previous draft asset.
- upload path still stages a `draft-asset:` ref.
- rich markdown toolbar inserts an existing selected image as a normal public path.
- rich markdown upload still inserts a staged `draft-asset:` ref.

Regression tests:

- paste/drop image upload in markdown still works.
- existing `AssetImage` rendering still resolves selected public paths in local and GitHub modes.

## Rollout Phases

### Phase 1: Image Asset Picker Foundation

- Add typed asset filter/model helpers.
- Add recursive asset listing helper.
- Add shared picker UI with existing-assets and upload modes.
- Integrate with `ImageField`.
- Integrate with rich markdown image toolbar.
- Add focused tests.

### Phase 2: Better Asset Library UX

- Add used/unused badges using existing asset reference scans.
- Add sort options.
- Add richer file metadata if cheaply available.
- Consider an asset-library page in settings or project workspace.

### Phase 3: Video Support

- Add a video field/block type or video-capable content component as needed.
- Reuse picker with a video extension filter.
- Add video preview/player in the detail panel.
- Add upload validation for video files and size limits.

### Phase 4: Audio/Generic Files

- Add audio filter/preview if the product needs it.
- Consider a generic file picker mode for downloads/documents.

## Open Questions

- Should upload live inside the same modal as a second tab, or should `ImageField` expose separate Choose asset and Upload new actions that both share lower-level logic?
- Should missing configured asset directories appear as empty libraries or as configuration errors?
- Should the picker show all matching files immediately, or defer loading until opened?
- What file-size limits should video uploads use when video support lands?
- Should future video insertion into markdown use native markdown/html syntax or a content component? This is intentionally out of scope for the image-focused v1.

