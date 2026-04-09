# Tiptap Markdown Editor With Draft-Asset Image Staging

## Summary

Replace the current textarea-based markdown field with a client-only Tiptap editor plus a raw Markdown tab, while keeping Markdown as the persisted source of truth.

Inline images in markdown must use the existing draft-asset pipeline instead of direct upload. Staged refs stay in markdown until save or preview materialization converts them to final public paths.

This is a markdown-editor change only. The recent sidebar/manual navigation work is unaffected and remains out of scope.

## Key Changes

### 1. Tiptap editor boundary

- Use:
  - `@tiptap/core`
  - `@tiptap/starter-kit`
  - `@tiptap/extension-link`
  - `@tiptap/extension-image`
  - `@tiptap/extension-placeholder`
  - `@tiptap/extension-file-handler`
  - `@tiptap/markdown`
- Keep Tiptap setup isolated behind a small editor boundary so the Markdown beta surface does not leak through the form system.
- Initialize and destroy the editor client-side only; do not introduce SSR-dependent editor code.

### 2. Markdown field behavior

- Expand `MarkdownField.svelte` to accept:
  - `storagePath?: string`
  - `assetsDir?: string`
- Update `FormField.svelte` to pass markdown blocks the same asset-path inputs image blocks already receive:
  - `block.assetsDir ?? imagePath` as `storagePath`
  - `block.assetsDir` as `assetsDir`
- Keep validation semantics based on serialized markdown string length, not editor document text length.

### 3. Authoring UX

- Replace the current `Edit` / `Preview` tabs with:
  - `Rich`
  - `Markdown`
- `Rich` is the default surface and includes a compact toolbar for:
  - paragraph
  - H1/H2/H3
  - bold
  - italic
  - strike
  - inline code
  - bullet list
  - ordered list
  - blockquote
  - code block
  - divider
  - link
  - image
- `Markdown` is a plain textarea bound to the same markdown value and acts as the escape hatch for round-trip issues and direct editing.
- Do not add a dedicated third preview tab in v1.

### 4. Inline image flow for markdown

- Add toolbar file-pick insertion and paste/drop support using Tiptap `FileHandler`.
- Reuse the same client validation as image fields:
  - MIME type must start with `image/`
  - max size 5 MB
- Stage files with `draftAssetStore.create(file, { repoKey, storagePath })`.
- Resolve `repoKey` from current page data the same way `ImageField.svelte` does.
- Insert markdown image syntax whose destination is the staged ref, e.g.:
  - `![](draft-asset:...)`
- Default inserted alt text to empty in v1. Users can edit alt text from the raw Markdown tab.
- Track staged refs in the markdown value and delete refs that are removed from the document so deleted inline images do not linger until GC.

### 5. Draft-asset integration for markdown strings

- Extend the shared draft-asset helpers in `src/lib/features/draft-assets/shared.ts` so they handle both:
  - exact-string refs for dedicated image fields
  - draft refs embedded inside markdown image destinations within markdown strings
  - draft refs embedded in HTML `<img src="">` values inside markdown strings
- Keep replacement logic narrow:
  - replace canonical markdown image destinations
  - replace HTML image `src` values
  - do not replace arbitrary `draft-asset:` substrings in normal prose
- Because save, preview, and publish flows already rely on the shared draft-asset helpers, this makes markdown-inline images work in:
  - local create/edit saves
  - GitHub draft saves
  - GitHub publish-now flows
  - preview-changes pages

### 6. Rich-editor image rendering

- Add a custom image node view for Tiptap that resolves image `src` values through the current client asset resolver flow.
- The node view must render all of these correctly inside the editor:
  - staged `draft-asset:` refs
  - saved repo-relative asset paths
  - local preview URLs
  - absolute external URLs
- Keep the underlying node `src` unchanged so Markdown serialization remains stable.

### 7. Save and preview behavior

- Do not use `/api/upload-image` for markdown-inline images.
- Reuse the existing materialization flow in:
  - `src/lib/features/draft-assets/materialize.ts`
  - `src/lib/features/draft-assets/client.ts`
  - `src/lib/features/draft-assets/server.ts`
  - preview route flows
- Once markdown ref detection is added, local save and GitHub preview/publish should work without a second image-upload pipeline.
- Leave the old upload endpoint/helper untouched in this change. Removing it is a separate cleanup task.

## Test Plan

- Unit tests for draft-asset markdown handling:
  - collect refs from `![](draft-asset:...)`
  - replace refs with final public paths
  - support multiple markdown images in one field
  - ignore plain prose containing `draft-asset:`
  - preserve exact-string image-field refs
  - support `<img src="draft-asset:...">` in markdown strings
- Component tests for the markdown field:
  - rich tab initializes from markdown and serializes back to markdown
  - switching between `Rich` and `Markdown` does not lose content
  - toolbar image insertion stages an asset and inserts markdown
  - paste/drop image staging works
  - removing an inline staged image cleans up the removed draft ref
  - min/max length display still reflects markdown string length
- Flow tests:
  - local create/edit materializes markdown-inline draft images to final repo paths on save
  - preview-changes includes staged markdown images in file-change summaries
  - remote preview/publish attaches markdown-inline draft assets through form data and materializes them server-side
  - missing draft metadata or file surfaces a clear error instead of silently losing the image

## Assumptions And Defaults

- Tiptap remains the editor choice for v1.
- `@tiptap/markdown` is still Beta as of April 9, 2026, so the raw Markdown tab remains in place.
- Image insertion in rich mode uses staged draft refs first, not final public URLs.
- No config/schema changes are needed; existing `markdown`, `assetsDir`, and config-level image-path behavior remain the public interface.
- Future custom markdown elements should build on Tiptap’s markdown extension hooks rather than introducing a second markdown parser.
- Official references used for package direction:
  - [Tiptap Svelte](https://tiptap.dev/docs/editor/getting-started/install/svelte)
  - [Tiptap Markdown setup](https://tiptap.dev/docs/editor/markdown/getting-started)
  - [Tiptap Markdown basic usage](https://tiptap.dev/docs/editor/markdown/getting-started/basic-usage)
  - [Tiptap FileHandler](https://tiptap.dev/docs/editor/extensions/functionality/filehandler)
  - [Tiptap Node Views](https://tiptap.dev/docs/editor/extensions/custom-extensions/node-views)
