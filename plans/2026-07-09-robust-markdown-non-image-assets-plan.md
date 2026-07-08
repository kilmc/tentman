# Robust Non-Image Asset Insertion In Markdown Fields

## Executive Summary

Add non-image asset insertion to Markdown fields as a first-class rich-editor feature, not as raw markdown string insertion.

The recommended architecture keeps the existing image behavior intact, extends the generic asset picker to all asset kinds, and adds dedicated TipTap media nodes for audio and video. File and PDF insertion should serialize as normal Markdown links, but insertion should still be done through TipTap JSON content/commands so it participates cleanly in editor history, selection, synchronization, and round-tripping.

The core editor model should be:

- Images remain handled by the existing `image` node and `RichEditorImage.svelte` node view.
- Audio uses a new block atom node, for example `markdownAudio`, that parses `<audio>` HTML and serializes stable `<audio controls src="..."></audio>` or nested `<source>` HTML.
- Video uses a new block atom node, for example `markdownVideo`, that parses `<video>` HTML and serializes stable `<video controls src="..."></video>` or nested `<source>` HTML.
- File/PDF insertion creates a Markdown link node shape, not a raw string, producing `[filename](src)` through `editor.getMarkdown()`.
- Draft/local/GitHub preview URL resolution happens only in node views and preview renderers. The editor document and saved Markdown preserve raw asset values such as `draft-asset:...` or `/media/clip.mp4`.

The first implementation should support direct `src` insertion for new audio/video assets and also parse/preserve nested `<source>` immediately. This prevents data loss for existing author content while keeping the picker workflow simple.

## Current State

Existing Markdown image insertion is already reasonably well-shaped:

- `apps/web/src/lib/components/form/MarkdownField.svelte`
  - Owns the field UI and currently opens `AssetPicker` for images.
  - Calls `richEditor.insertImageValue(nextValue)` for selected existing images.
  - Calls `richEditor.insertImageFiles(files)` for uploads/paste/drop.
  - Uses `stageMarkdownFieldImage` for upload validation and draft asset creation.
- `apps/web/src/lib/features/markdown-editor/create-editor.ts`
  - Creates the TipTap editor with `contentType: 'markdown'`.
  - Extends TipTap's `Image` node with a Svelte node view.
  - Uses JSON content insertion for images through `createImageNode`.
  - Uses `editor.getMarkdown()` for output and `editor.commands.setContent(markdown, { contentType: 'markdown' })` for sync.
- `apps/web/src/lib/features/markdown-editor/image-node-view.ts`
  - Bridges the image node to `RichEditorImage.svelte`.
- `apps/web/src/lib/features/markdown-editor/RichEditorImage.svelte`
  - Resolves draft/local/GitHub URLs for preview without mutating the saved `src`.
- `apps/web/src/lib/features/assets/asset-picker.ts`
  - Already defines `AssetPickerKind = 'image' | 'video' | 'audio' | 'file'`.
  - Already has generic `AssetPickerFilter`, `AssetPickerEntry`, and recursive listing.
  - Only exports `imageAssetFilter` today.
- `apps/web/src/lib/components/assets/AssetPicker.svelte`
  - Already accepts a generic `filter`.
  - UI preview is image-specific through `AssetImage`.
- `apps/web/src/routes/api/repo/assets/+server.ts`
  - Already allows `image`, `video`, `audio`, and `file` kinds.
  - Relies on caller-provided extensions.
- `apps/web/src/lib/features/draft-assets/shared.ts`
  - Collects and replaces exact string draft refs.
  - For Markdown strings, currently only recognizes Markdown images and HTML `<img src="...">`.
- `apps/web/src/lib/features/draft-assets/validation.ts`
  - Image-only validation.
- `apps/web/src/lib/features/draft-assets/image-resolver.ts`
  - Despite the name, owns Markdown preview URL rewriting.
  - Currently rewrites Markdown image URLs and `<img src="...">` only.
- `apps/web/src/lib/components/content/ContentValueDisplay.svelte`
  - Renders Markdown preview through `@humanspeak/svelte-markdown`.
  - Calls `resolveMarkdownAssetUrls` before preview rendering.
- `apps/web/src/lib/server/repo-asset-proxy.ts`
  - Only maps image extensions to specific content types.
- `packages/core/src/assets.js`
  - Asset audit currently scans image blocks, Markdown images, and HTML `<img src="...">`.

## Confirmed Technical Constraints

The current TipTap Markdown setup does not preserve raw `<audio>` or `<video>` HTML unless explicit nodes are registered:

- Existing raw audio/video HTML is dropped when parsed with `contentType: 'markdown'`.
- `editor.chain().insertContent('<audio ...>')` escapes the HTML as text.
- Markdown links like `[Download](draft-asset:file)` survive cleanly.

Upstream API references used for this plan:

- [TipTap Node API](https://tiptap.dev/docs/editor/extensions/custom-extensions/create-new/node): documents `Node.create`, `parseHTML`, `renderHTML`, `addAttributes`, `group`, `atom`, `selectable`, and `draggable`.
- [TipTap node views](https://tiptap.dev/docs/editor/extensions/custom-extensions/node-views): documents node views as the right mechanism for custom in-editor experiences that are separate from output HTML.
- [TipTap Markdown basic usage](https://tiptap.dev/docs/editor/markdown/getting-started/basic-usage): documents `editor.getMarkdown()` and `editor.commands.setContent(..., { contentType: 'markdown' })`.
- [TipTap custom Markdown parsing](https://tiptap.dev/docs/editor/markdown/advanced-usage/custom-parsing): documents `parseMarkdown` and states that HTML in Markdown is parsed through extensions' `parseHTML` methods.
- [TipTap custom Markdown serializing](https://tiptap.dev/docs/editor/markdown/advanced-usage/custom-serializing): documents `renderMarkdown`.
- [TipTap Markdown extension integration](https://tiptap.dev/docs/editor/markdown/guides/integrate-markdown-in-your-extension): documents adding `parseMarkdown`, `renderMarkdown`, `markdownTokenName`, and `markdownTokenizer` to custom extensions.
- [`@humanspeak/svelte-markdown` README](https://github.com/humanspeak/svelte-markdown): documents custom `renderers` and separate `html` renderer configuration.

TipTap 3.22.3 provides the exact extension hooks needed:

- Use `Node.create(...)` from `@tiptap/core`.
- Define `parseHTML()` for raw HTML tokens inside Markdown. `@tiptap/markdown` parses HTML tokens through each extension's `parseHTML` rules by calling TipTap `generateJSON`.
- Define `renderHTML()` for editor DOM fallback and non-Markdown content paths.
- Define `renderMarkdown(node, helpers, context)` to serialize the custom node back to stable raw HTML during `editor.getMarkdown()`.
- Define `addNodeView()` for rich Svelte editor previews.
- Define `addCommands()` for explicit `setMarkdownAudio`, `setMarkdownVideo`, or shared `insertMarkdownMedia` commands if useful.
- Insert through JSON content objects or commands, not through raw HTML strings.

`@humanspeak/svelte-markdown` currently has default HTML renderers for `audio`, `source`, `track`, and `embed`, but not `video`. Admin preview therefore needs a custom `video` renderer in the Markdown preview surface.

## Proposed Architecture

### Asset Kinds And Filters

Promote the asset picker filters from image-only to first-class shared constants:

```ts
export const imageAssetFilter: AssetPickerFilter = { ... };
export const videoAssetFilter: AssetPickerFilter = {
	kind: 'video',
	extensions: ['.mp4', '.webm', '.mov', '.m4v'],
	mimePrefix: 'video/'
};
export const audioAssetFilter: AssetPickerFilter = {
	kind: 'audio',
	extensions: ['.mp3', '.m4a', '.wav', '.ogg', '.oga', '.flac'],
	mimePrefix: 'audio/'
};
export const fileAssetFilter: AssetPickerFilter = {
	kind: 'file',
	extensions: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.txt'],
};
```

Keep filtering extension-based for repository listing. Use MIME prefix and extension fallback for upload validation.

### Markdown Media Nodes

Create a small media-node feature under `apps/web/src/lib/features/markdown-editor/`.

Recommended files:

- `media-node-types.ts`
- `media-node-markdown.ts`
- `audio-extension.ts`
- `video-extension.ts`
- `media-node-view.ts`
- `RichEditorAudio.svelte`
- `RichEditorVideo.svelte`
- optionally `RichEditorMediaFrame.svelte` for shared caption/chrome logic

Recommended node shape:

```ts
interface MarkdownMediaSource {
	src: string;
	type?: string | null;
}

interface MarkdownMediaTrack {
	src: string;
	kind?: string | null;
	label?: string | null;
	srclang?: string | null;
	default?: boolean;
}

interface MarkdownMediaAttrs {
	src?: string | null;
	title?: string | null;
	ariaLabel?: string | null;
	controls?: boolean;
	sources?: MarkdownMediaSource[];
	tracks?: MarkdownMediaTrack[];
}
```

Use block atom nodes:

```ts
Node.create({
	name: 'markdownAudio',
	group: 'block',
	atom: true,
	selectable: true,
	draggable: true,

	addAttributes() { ... },
	parseHTML() { return [{ tag: 'audio' }]; },
	renderHTML({ HTMLAttributes }) { ... },
	renderMarkdown(node) { ... },
	addNodeView() { ... },
	addCommands() { ... }
});
```

Use the same structure for `markdownVideo` with `parseHTML() { return [{ tag: 'video' }]; }`.

The `parseHTML` `getAttrs` callback should inspect the actual `HTMLElement`:

- Read direct `src`.
- Read `controls`, defaulting to `true` when missing for inserted media but preserving explicit parsed value.
- Read `title`.
- Read `aria-label` into `ariaLabel`.
- Read child `<source src="..." type="...">` entries.
- For video, read child `<track src="..." kind="..." label="..." srclang="..." default>`.

The canonical inserted output should be direct `src`:

```html
<audio controls src="/media/interview.mp3"></audio>
<video controls src="/media/trailer.mp4"></video>
```

Existing nested source HTML should round-trip:

```html
<video controls>
  <source src="/media/trailer.webm" type="video/webm">
  <source src="/media/trailer.mp4" type="video/mp4">
</video>
```

The first implementation should support nested `<source>` in parsing, node attrs, node views, draft ref replacement, preview URL rewriting, and serialization. The picker UI can still insert a single direct `src`. This is the best balance: simple authoring flow, no lossy parsing.

### Markdown Serialization Helpers

Do not build media HTML with ad hoc inline string concatenation in the node extension. Add focused helpers in `media-node-markdown.ts`:

- `escapeHtmlAttribute(value: string): string`
- `renderBooleanAttribute(name: string, value: boolean | null | undefined): string`
- `renderAudioMarkdown(attrs: MarkdownMediaAttrs): string`
- `renderVideoMarkdown(attrs: MarkdownMediaAttrs): string`
- `parseMediaElementAttributes(element: HTMLElement, kind: 'audio' | 'video'): MarkdownMediaAttrs`
- `getPrimaryMediaSrc(attrs: MarkdownMediaAttrs): string | null`

This keeps quoting, boolean attributes, source ordering, and future tests in one place.

### Editor Controller API

Extend `MarkdownEditorController` in `create-editor.ts` without overloading image-specific names:

```ts
insertAudioValue(value: string, position?: number): void;
insertVideoValue(value: string, position?: number): void;
insertFileLinkValue(input: { href: string; label: string }, position?: number): void;
insertAssetValue(input: { kind: AssetPickerKind; value: string; label?: string }, position?: number): void;
```

The shared `insertAssetValue` can dispatch internally:

- `image` -> existing `insertImageValue`.
- `audio` -> JSON node `{ type: 'markdownAudio', attrs: { src: value, controls: true } }`.
- `video` -> JSON node `{ type: 'markdownVideo', attrs: { src: value, controls: true } }`.
- `file` -> JSON paragraph/link content:

```ts
{
	type: 'paragraph',
	content: [
		{
			type: 'text',
			text: label,
			marks: [{ type: 'link', attrs: { href: value } }]
		}
	]
}
```

This avoids the fragile path of inserting `[filename](src)` as a string.

### URL Resolution For Node Views

Node attrs must store raw values only. Node views should resolve preview URLs at render time:

- Reuse `getAssetRenderContext(...)`.
- Generalize `resolveClientAssetUrl(...)` out of `image-resolver.ts` into a name that is no longer image-specific, for example:
  - `apps/web/src/lib/features/draft-assets/asset-resolver.ts`, or
  - `apps/web/src/lib/features/assets/asset-url-resolver.ts`.
- `RichEditorAudio.svelte` and `RichEditorVideo.svelte` receive raw attrs and resolve:
  - direct `src`
  - each nested `source.src`
  - video `track.src`, if supported in the node view
- The rendered preview DOM uses resolved blob/proxy/public URLs.
- `renderMarkdown` always uses the original raw values from attrs.

The node view should behave like `RichEditorImage.svelte`: if resolution fails, render a clear non-editable placeholder inside the selected node, not broken invisible media.

### Asset Picker UI For Non-Images

Keep the existing modal and tab structure in `AssetPicker.svelte`, but extract kind-specific preview rendering:

- `AssetPickerPreview.svelte`
- `AssetPickerGridItem.svelte` or small inline branches if the component remains readable

Recommended UI:

- Images: keep current thumbnail grid behavior.
- Video: use a rectangular preview area in the detail panel with `<video controls preload="metadata">`; grid/list items use a video icon plus filename, not autoplay thumbnails.
- Audio: use `<audio controls preload="metadata">` in the detail panel; list items use an audio icon plus filename and extension.
- File: use a file/document icon, filename, extension, public path, and repository path. PDF can optionally show a "PDF" badge, but should still insert as a link.

For non-images, the left side should become a dense selectable list rather than a square thumbnail grid:

- filename
- relative path
- extension/kind label
- selected state matching existing stone border/fill conventions

Use existing Tailwind stone styling, 6-8px radii, and the same confirm-before-insert interaction. Use `lucide-svelte` icons where useful (`FileAudio`, `FileVideo`, `FileText`, `File`, `Music`, `Video`) because the app already depends on it.

The picker title/copy should be kind-specific:

- `Insert image`
- `Insert video`
- `Insert audio`
- `Insert file`

### Toolbar Flow

Do not make authors choose media by typing HTML.

Update toolbar config to expose asset actions for:

- Image
- Video
- Audio
- File

Implementation options:

1. Add separate icon buttons next to Image.
2. Preferably add one "Insert asset" dropdown if toolbar width becomes crowded.

Given the existing toolbar is already horizontally scrollable and action buttons are icon-only, the first implementation can use separate buttons. Each button opens the same `AssetPicker` with a different `filter` and kind-specific insertion callback.

### Draft Asset Handling

Generalize image-only draft asset handling:

- Rename or wrap `stageMarkdownFieldImage` with `stageMarkdownFieldAsset`.
- Add per-kind validation.
- Preserve image-specific behavior for paste/drop. Audio/video/file paste/drop can be out of scope unless explicitly enabled in the toolbar upload path.

Draft ref collection/replacement must cover:

- Markdown links: `[file.pdf](draft-asset:...)`
- Markdown links with angle destinations: `[file.pdf](<draft-asset:...>)`
- `<img src="draft-asset:...">`
- `<audio controls src="draft-asset:..."></audio>`
- `<video controls src="draft-asset:..."></video>`
- `<source src="draft-asset:...">`
- `<embed src="draft-asset:...">`
- `<track src="draft-asset:...">`

Recommended new helper module:

- `apps/web/src/lib/features/draft-assets/markdown-refs.ts`

Keep the regex implementation focused and well-tested. If this grows beyond simple destination/src extraction, consider using an HTML parser for HTML fragments, but do not block the first phase on that unless regex false positives show up.

### Preview Rendering

Rename/generalize preview URL rewriting:

- Current: `resolveMarkdownAssetUrls` in `image-resolver.ts`.
- Recommended: move to `apps/web/src/lib/features/draft-assets/markdown-asset-resolver.ts` or `apps/web/src/lib/features/assets/markdown-asset-resolver.ts`.

It should rewrite the same asset references listed above so admin preview can play staged/local/GitHub media.

For `ContentValueDisplay.svelte`, add a custom `@humanspeak/svelte-markdown` HTML renderer for `video`:

```svelte
<SvelteMarkdown
	source={renderedMarkdown}
	renderers={{
		html: {
			video: MarkdownVideoRenderer
		}
	}}
/>
```

The custom video renderer should:

- accept `attributes` and `children` in the shape used by `@humanspeak/svelte-markdown`;
- render `<video {...attributes}>{@render children?.()}</video>`;
- set `controls` when neither `controls` nor `autoplay` is present, if product wants inserted videos to be playable by default;
- stay small and local, probably `apps/web/src/lib/components/content/MarkdownVideoRenderer.svelte`.

### Repo Asset Proxy Content Types

Expand `getAssetContentType` in `repo-asset-proxy.ts`:

- Video:
  - `.mp4` -> `video/mp4`
  - `.webm` -> `video/webm`
  - `.mov` -> `video/quicktime`
  - `.m4v` -> `video/x-m4v`
- Audio:
  - `.mp3` -> `audio/mpeg`
  - `.m4a` -> `audio/mp4`
  - `.wav` -> `audio/wav`
  - `.ogg`/`.oga` -> `audio/ogg`
  - `.flac` -> `audio/flac`
- Files:
  - `.pdf` -> `application/pdf`
  - common office/text/archive types as needed.

This matters for browser playback through `/api/repo/asset`.

### Core Asset Audit

Update `packages/core/src/assets.js` so asset checks match what Tentman can insert:

- Rename `collectMarkdownAssetValues` internals from image-only to asset-ref language.
- Scan Markdown links in Markdown blocks.
- Scan HTML `src` attributes for `img`, `audio`, `video`, `source`, `embed`, and `track`.
- Keep field path labels descriptive, for example:
  - `body.markdownAssets[0]`
  - or more specific `body.markdownLinks[0]`, `body.htmlMedia[0]`.

Recommended: include Markdown links and HTML media refs in missing/unused asset checks. If Tentman can insert a PDF/audio/video asset, the audit should be able to report when that asset is missing or unused.

## File-Level Implementation Plan

### `apps/web/src/lib/features/assets/asset-picker.ts`

- Export `videoAssetFilter`, `audioAssetFilter`, and `fileAssetFilter`.
- Add helper `getAssetPickerFilterForKind(kind: AssetPickerKind): AssetPickerFilter`.
- Add helper `getAssetPickerKindLabel(kind)` if useful for UI text.
- Add tests for extension matching across image/video/audio/file.

### `apps/web/src/lib/components/assets/AssetPicker.svelte`

- Replace image-only preview branches with kind-aware rendering.
- Preserve current image UI.
- Add video/audio/file detail previews.
- Add non-image list row layout.
- Update accepted upload types from the provided filter.
- Keep `oninsert(value, result)` unchanged if possible.
- Change `testAdapters.loadAssetEntries` typing in callers from `typeof imageAssetFilter` to `AssetPickerFilter`.

### `apps/web/src/routes/api/repo/assets/+server.ts`

- Keep the existing `SUPPORTED_KINDS`.
- Add tests for video/audio/file query parameters to prove the generic route is not image-only.
- Consider validating extension sets against known filters server-side if abuse is a concern. This is not required for correctness because the route still enforces configured asset mapping and repository permissions.

### `apps/web/src/lib/features/markdown-editor/media-node-types.ts`

- Define shared `MarkdownMediaSource`, `MarkdownMediaTrack`, `MarkdownMediaAttrs`, and `MarkdownMediaKind`.
- Export type guards or normalizers for attrs if needed.

### `apps/web/src/lib/features/markdown-editor/media-node-markdown.ts`

- Implement parse/render helpers for media HTML attrs.
- Escape attribute values.
- Omit empty attrs.
- Preserve `controls`.
- Render direct `src` for simple inserted media.
- Render nested `<source>` and `<track>` when attrs contain them.

### `apps/web/src/lib/features/markdown-editor/audio-extension.ts`

- Add `MarkdownAudio` TipTap node with:
  - `name: 'markdownAudio'`
  - `group: 'block'`
  - `atom: true`
  - `selectable: true`
  - `draggable: true`
  - `parseHTML` for `audio`
  - `renderHTML`
  - `renderMarkdown`
  - `addNodeView`
  - command such as `setMarkdownAudio`

### `apps/web/src/lib/features/markdown-editor/video-extension.ts`

- Same as audio, with video-specific track handling and `name: 'markdownVideo'`.

### `apps/web/src/lib/features/markdown-editor/media-node-view.ts`

- Mirror `image-node-view.ts`.
- Mount either `RichEditorAudio.svelte` or `RichEditorVideo.svelte`.
- Set `contentEditable = 'false'`.
- Return `ignoreMutation() { return true; }`.
- In `update`, reject nodes of a different type and remount with new attrs.

### `apps/web/src/lib/features/markdown-editor/RichEditorAudio.svelte`

- Resolve direct `src` and `sources`.
- Render `<audio controls preload="metadata">`.
- Show a fallback placeholder with filename/path when preview is unavailable.
- Keep raw values out of the displayed media `src` when a resolved URL exists.

### `apps/web/src/lib/features/markdown-editor/RichEditorVideo.svelte`

- Resolve direct `src`, `sources`, and `tracks`.
- Render `<video controls preload="metadata">`.
- Use stable dimensions/aspect ratio to avoid editor layout jumps.
- Show a fallback placeholder with filename/path when preview is unavailable.

### `apps/web/src/lib/features/markdown-editor/create-editor.ts`

- Import and register `MarkdownAudio` and `MarkdownVideo` before `Markdown`.
- Add JSON content creators:
  - `createAudioNode(ref)`
  - `createVideoNode(ref)`
  - `createFileLinkNode({ href, label })`
- Extend `CreateMarkdownEditorOptions`:
  - consider `stageAsset(file, kind)` only if upload/paste/drop for non-images is added.
- Extend `MarkdownEditorController` with media/file insertion methods.
- Keep `insertImageFiles` image-only for paste/drop in phase 1 unless explicitly expanded.
- Ensure `getMarkdownDocumentFingerprint` benefits from the new nodes through the registered Markdown extension.

### `apps/web/src/lib/components/form/MarkdownField.svelte`

- Replace `assetPickerOpen: boolean` with an active picker state:

```ts
type MarkdownAssetPickerState =
	| { open: false }
	| { open: true; kind: AssetPickerKind; title: string; filter: AssetPickerFilter };
```

- Add `openAssetPicker(kind, trigger?)`.
- Dispatch insertion through `richEditor.insertAssetValue({ kind, value, label })`.
- For file labels, use the selected `AssetPickerEntry.name` when available; otherwise derive a filename from the public path.
- Generalize `stagePickerImage` only if upload is enabled for non-images in the same phase.
- Update test adapter types from image-only filter to `AssetPickerFilter`.

### `apps/web/src/lib/components/form/markdown-field-toolbar.ts`

- Extend `ToolbarIconName` with `audio`, `video`, and `file` if using the current local icon component.
- Prefer importing lucide icons in `ToolbarIcon.svelte` for the new names, matching the app dependency.

### `apps/web/src/lib/components/form/markdown-field-toolbar-config.ts`

- Replace `onselectimage` with either:
  - `onselectasset(kind: AssetPickerKind, trigger?: HTMLElement)`, or
  - separate callbacks `onselectimage`, `onselectvideo`, `onselectaudio`, `onselectfile`.
- Add action buttons for video/audio/file.

### `apps/web/src/lib/components/form/MarkdownRichToolbar.svelte`

- Likely no structural change if separate action buttons are used.
- If an insert-asset dropdown is chosen, add a compact dropdown around media actions.

### `apps/web/src/lib/components/form/markdown-field-draft-assets.ts`

- Add `stageMarkdownFieldAsset({ file, kind, ... })`.
- Keep `stageMarkdownFieldImage` as a wrapper for existing callers.
- Use per-kind validation.
- Generalize removed-ref cleanup to use the expanded markdown ref collector.

### `apps/web/src/lib/features/draft-assets/validation.ts`

- Add:
  - `MAX_DRAFT_VIDEO_FILE_SIZE`
  - `MAX_DRAFT_AUDIO_FILE_SIZE`
  - `MAX_DRAFT_FILE_SIZE`
  - `getDraftAssetValidationError(file, kind)`
- Keep `getDraftImageValidationError(file)` as a wrapper.
- Validate MIME prefix when present and extension fallback when `File.type` is empty.

### `apps/web/src/lib/features/draft-assets/shared.ts`

- Move Markdown string collection/replacement patterns into a helper module or expand in place.
- Replace image-specific pattern names with asset-specific names.
- Collect and replace draft refs in Markdown links and HTML media `src` attributes.
- Preserve existing exact string ref behavior.

### `apps/web/src/lib/features/draft-assets/image-resolver.ts`

- Rename to `markdown-asset-resolver.ts` or keep a compatibility re-export.
- Keep `resolveClientAssetUrl` as the shared primitive, or move it to a better-named file.
- Expand Markdown URL rewriting to links and HTML media `src` attributes.
- Add tests covering staged refs, GitHub proxy URLs, and local object URLs for audio/video/file refs.

### `apps/web/src/lib/components/content/ContentValueDisplay.svelte`

- Import a custom video HTML renderer.
- Pass `renderers={{ html: { video: MarkdownVideoRenderer } }}` to `SvelteMarkdown`.
- Keep current content component transform order before asset URL rewriting.
- Use the generalized markdown asset resolver.

### `apps/web/src/lib/components/content/MarkdownVideoRenderer.svelte`

- Add small custom renderer for `@humanspeak/svelte-markdown`.
- Render `<video {...attributes}>{@render children?.()}</video>`.
- Ensure `controls` are present for inserted videos if missing.

### `apps/web/src/lib/server/repo-asset-proxy.ts`

- Expand `getAssetContentType` for audio/video/PDF/common file extensions.
- Add unit tests in `apps/web/src/routes/api/repo/asset/server.spec.ts` or a new server helper spec if that is cleaner.

### `packages/core/src/assets.js`

- Expand Markdown asset scanning from image-only to asset refs.
- Include Markdown links and HTML media tags.
- Add tests in:
  - `packages/core/src/assets-check.test.js`
  - `packages/core/src/assets-unused.test.js`

## Test Plan

### Unit Tests

Asset picker:

- `apps/web/src/lib/features/assets/asset-picker.spec.ts`
  - matches video/audio/file extensions case-insensitively;
  - recursively lists non-image assets;
  - preserves public path creation for non-image relative paths.

Draft asset refs:

- `apps/web/src/lib/features/draft-assets/shared.spec.ts`
  - collects and rewrites `[Download](draft-asset:file)`;
  - collects and rewrites `[Download](<draft-asset:file>)`;
  - collects and rewrites `<audio src="draft-asset:audio"></audio>`;
  - collects and rewrites `<video src="draft-asset:video"></video>`;
  - collects and rewrites nested `<source src="draft-asset:source">`;
  - collects and rewrites `<embed src="draft-asset:file">`;
  - collects and rewrites `<track src="draft-asset:captions">`;
  - ignores plain prose containing `draft-asset:...`.

Validation:

- `apps/web/src/lib/features/draft-assets/validation.spec.ts`
  - accepts expected MIME types/extensions per kind;
  - rejects wrong MIME types;
  - enforces per-kind size limits;
  - handles empty `File.type` by extension.

Markdown media node helpers:

- New `apps/web/src/lib/features/markdown-editor/media-node-markdown.spec.ts`
  - renders direct audio/video `src` to stable HTML;
  - escapes attr values;
  - renders nested sources/tracks in order;
  - parses direct `src`;
  - parses nested `source`/`track` children.

Editor round-trip:

- New or existing markdown-editor spec:
  - `editor.commands.setContent('<audio controls src="/audio.mp3"></audio>', { contentType: 'markdown' })`, then `editor.getMarkdown()` contains audio HTML;
  - same for direct video;
  - same for nested video sources;
  - inserted audio/video JSON nodes serialize to expected HTML;
  - inserted file link serializes to `[filename](...)`;
  - switching rich -> markdown -> rich preserves media nodes.

Preview URL resolver:

- `apps/web/src/lib/features/draft-assets/image-resolver.spec.ts` after rename/generalization:
  - rewrites Markdown links;
  - rewrites audio/video/source/embed/track `src`;
  - routes GitHub-backed audio/video through `/api/repo/asset`;
  - resolves staged `draft-asset:` refs to blob/data URLs.

Repo asset proxy:

- `apps/web/src/routes/api/repo/asset/server.spec.ts`
  - returns correct `content-type` for `.mp4`, `.webm`, `.mp3`, `.m4a`, `.wav`, `.pdf`.

Core audit:

- `packages/core/src/assets-check.test.js`
  - reports missing audio/video/file assets referenced in Markdown links and HTML media.
- `packages/core/src/assets-unused.test.js`
  - does not mark referenced audio/video/file assets unused.

### Browser/Component Tests

Markdown field:

- `apps/web/src/lib/components/form/MarkdownField.svelte.spec.ts`
  - renders existing audio/video HTML as selectable rich editor nodes;
  - inserting via picker updates bound Markdown with stable media HTML;
  - file insertion updates bound Markdown with a Markdown link;
  - semantic fingerprint returns clean after insert/delete undo paths.

Asset picker:

- Component tests for `AssetPicker.svelte`:
  - video detail panel renders `<video controls>`;
  - audio detail panel renders `<audio controls>`;
  - file detail panel shows filename/public path and inserts on confirmation;
  - search and Enter behavior do not insert prematurely.

Content display:

- `apps/web/src/lib/test/browser/asset-rendering.svelte.spec.ts`
  - Markdown audio preview renders an audio element with resolved source;
  - Markdown video preview renders through the custom video renderer;
  - Markdown file links preserve link text and route href through resolver when appropriate.

### Playwright Tests

Extend `apps/web/tests/playwright/markdown-field.spec.ts`:

- Insert existing audio from the toolbar picker and assert:
  - picker opens with audio copy;
  - selecting a row does not insert;
  - clicking Insert writes `<audio controls src="/..."></audio>` to the hidden/debug Markdown value;
  - rich editor displays an audio node.
- Insert existing video and assert stable `<video controls src="/..."></video>`.
- Insert existing PDF/file and assert `[filename.pdf](/...)`.
- Start with Markdown containing nested video sources and assert it stays visible and survives rich/markdown tab switching.
- Delete a selected audio/video node and assert Markdown is removed.
- Undo deletion and assert node returns without preview errors.

## Migration And Backward Compatibility

No data migration should be required.

Existing image Markdown remains unchanged:

- Markdown images continue to serialize as `![alt](src)`.
- HTML `<img>` refs continue to be collected, replaced, and preview-resolved.
- Existing image upload and picker behavior should remain byte-for-byte compatible unless tests intentionally update UI copy.

Existing raw audio/video HTML that is currently dropped by the rich editor will become preserved after the new nodes are registered. That is a backward-compatible improvement for saved content, but it can change editor fingerprints for content that previously normalized by losing media. Add tests around semantic fingerprints so this is understood.

For existing Markdown files:

- Direct `<audio src="...">` and `<video src="...">` should parse into media nodes.
- Nested `<source>` should parse and serialize back with the same source order.
- Unsupported attributes should either be preserved if explicitly modeled or intentionally dropped. In phase 1, preserve `src`, `controls`, `title`, `aria-label`, source `type`, and video track metadata. Drop arbitrary event/style attributes for safety.

## Risks And Decisions

### Decision: First-Class Nodes, Not Raw String Insertion

Use TipTap nodes and JSON insertion. Raw HTML insertion has already been verified to escape or drop content in this setup.

### Decision: Support Nested Sources Immediately

New picker insertion can use direct `src`, but the node model should parse and preserve nested `<source>` immediately. This prevents losing existing author markup and aligns with the draft replacement/preview scope.

### Decision: Preserve Raw Values In Editor State

Node views resolve preview URLs only for playback. Saved Markdown must keep raw `draft-asset:`, public path, or relative asset values.

### Decision: File/PDF Uses Markdown Links

Files should not get custom TipTap nodes in phase 1. Native Markdown links are portable, already round-trip, and match expected authored Markdown. The insertion path still needs to use TipTap JSON/commands.

### Risk: HTML Parsing Is Browser-Dependent

`@tiptap/markdown` parses HTML tokens through TipTap `generateJSON`, which needs browser DOM APIs. This project uses the editor in the browser, but unit tests that instantiate the editor need a DOM environment.

Mitigation:

- Put pure render/parse helpers in standalone modules.
- Run editor round-trip tests in browser/Vitest browser where needed.

### Risk: Regex-Based Markdown Asset Rewriting Can Miss Edge Cases

Markdown and HTML can contain complex quoting and nesting.

Mitigation:

- Keep supported patterns explicit.
- Test the exact forms Tentman inserts.
- Avoid rewriting code fences if a bug appears; if regex becomes fragile, graduate HTML `src` rewriting to an HTML parser and Markdown links to a Markdown parser.

### Risk: Video Preview Payloads Can Be Heavy

GitHub proxying video through the app can be expensive.

Mitigation:

- Use `preload="metadata"` in editor and preview.
- Do not autoplay.
- Keep picker list rows icon-based instead of thumbnail-generating.

### Risk: Toolbar Crowding

Adding three buttons can crowd smaller widths.

Mitigation:

- Existing toolbar already scrolls horizontally.
- If it feels cramped after implementation, consolidate media actions into an Insert Asset dropdown as a follow-up.

## Suggested Phased Order

### Phase 1: Shared Asset Kinds And Picker UI

- Export video/audio/file filters.
- Make `AssetPicker.svelte` kind-aware.
- Add picker tests for listing, preview, search, and confirm insert.
- Keep Markdown image behavior unchanged.

### Phase 2: Media Node Foundation

- Add audio/video TipTap nodes, parse/render helpers, and Svelte node views.
- Register nodes in `create-editor.ts`.
- Add controller insertion methods.
- Add editor round-trip tests for direct `src` and nested sources.

### Phase 3: MarkdownField Toolbar Integration

- Add audio/video/file toolbar actions.
- Open `AssetPicker` with the active kind.
- Insert media nodes or file link JSON content.
- Add MarkdownField component/browser tests.

### Phase 4: Draft Uploads And Ref Replacement

- Generalize validation and staging.
- Expand draft ref collection/replacement for links and HTML media.
- Enable picker upload tab for audio/video/file if product wants uploads in this same release.
- Add cleanup tests for removed refs.

### Phase 5: Preview Rendering And Proxy Types

- Generalize markdown asset URL rewriting.
- Add custom SvelteMarkdown video renderer.
- Expand repo asset proxy content types.
- Add preview/browser tests for staged and GitHub-backed audio/video/file refs.

### Phase 6: Core Asset Audit

- Expand `packages/core/src/assets.js` to scan Markdown links and HTML media.
- Add missing/unused asset tests for audio/video/file.
- Run core and web test suites.

## Recommended Verification Commands

Use focused checks while implementing each phase:

```sh
pnpm exec vitest run --project client apps/web/src/lib/features/assets/asset-picker.spec.ts
pnpm exec vitest run --project client apps/web/src/lib/features/draft-assets/shared.spec.ts
pnpm exec vitest run --project client apps/web/src/lib/test/browser/asset-rendering.svelte.spec.ts
pnpm exec playwright test apps/web/tests/playwright/markdown-field.spec.ts
pnpm --filter @tentman/core test
pnpm run check
```

Adjust exact commands to the repo's current test scripts if local package filters differ.
