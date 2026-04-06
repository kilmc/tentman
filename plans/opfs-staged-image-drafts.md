# OPFS-Staged Image Drafts for Thin-Backend Tentman

## Summary

Replace immediate image uploads with a browser-first draft asset flow that stages image bytes in OPFS, keeps only draft references in form data while editing, and uploads/writes image files only on an explicit user action:

- GitHub mode: upload staged images during `Save to Draft` and `Publish Now`
- Local-repo mode: write staged images during explicit local `Save Changes` / `Create Item`
- Preview UI: include pending image file changes alongside content file changes
- Thin-backend fit: keep server work limited to privileged GitHub-backed writes; no new server read surfaces

This is a v1 image-only change. It does not add full unsaved-form recovery or general autosave.

## Key Changes

### 1. Draft asset model and browser storage

- Add a client-only `DraftAssetStore` abstraction with:
  - OPFS as the primary byte store
  - IndexedDB manifest storage for metadata and lookup
  - IndexedDB blob fallback when `navigator.storage.getDirectory()` is unavailable
- Store one manifest record per staged image with:
  - `id`
  - `repoKey`
  - `storagePath`
  - `originalName`
  - `mimeType`
  - `size`
  - `createdAt`
  - deterministic `targetFilename`
- Use a stable draft reference string in form data: `draft-asset:<id>`
- Generate deterministic final filenames up front from the original base name plus the asset id suffix, so preview and final upload paths match exactly
- On first draft-asset use, best-effort call `navigator.storage.persist()`
- Add lightweight GC:
  - delete replaced/removed draft assets immediately
  - delete successfully uploaded/written draft assets immediately
  - run best-effort startup cleanup for stale orphaned draft assets older than 24 hours

### 2. Rendering and form behavior

- Change `ImageField.svelte` so selecting a file:
  - validates type and size as today
  - stores the file in `DraftAssetStore`
  - sets `value` to `draft-asset:<id>`
  - shows preview from local object URL / resolved draft asset URL
  - performs no immediate network request
- Replace the current sync-only image resolution path with a reusable client image resolver component/helper that supports:
  - existing remote/static values via current `resolveAssetValue`
  - draft refs via async lookup from `DraftAssetStore`
- Use that reusable resolver in:
  - image field previews
  - `ContentValueDisplay.svelte`
  - `ItemCard.svelte`
- Keep text/content serialization unchanged except for image fields now carrying `draft-asset:*` until materialization
- Removing an image should delete the staged draft asset if the current value is a draft ref

### 3. Materialization on explicit save/draft/publish

- Add a shared draft-asset materialization step that:
  - recursively scans content data for unique `draft-asset:*` refs
  - resolves each ref to bytes + metadata from `DraftAssetStore`
  - writes/uploads the asset to its final repo path
  - rewrites the content data to final public asset paths
  - returns the rewritten content plus synthetic file-change metadata for the uploaded assets
- GitHub mode:
  - wire this into the existing preview-page enhanced submissions for:
    - single-entry preview save/publish
    - collection item preview save/publish
  - client enhancement appends a JSON draft-asset manifest plus one file part per asset to `FormData`
  - server actions upload assets before `saveContentDocument` / `createContentDocument`
  - draft saves must write image files to the selected draft branch
  - publish-now must write image files to the default branch
- Local-repo mode:
  - wire materialization into the client-side explicit local save/create handlers before content write
  - write asset bytes directly into the chosen local repo path, then save rewritten content
- Extend the repository abstraction with a binary write surface, e.g. `writeBinaryFile(path, bytes, options)`
  - GitHub backend: base64-write file contents, respecting `ref/branch`
  - local backend: write bytes via File System Access API
- Update GitHub image-writing utility so branch/ref is explicit and deterministic filename/path is caller-provided
- Remove `ImageField`’s dependency on `/api/upload-image`; delete that endpoint if no callers remain after migration

### 4. Preview behavior

- Keep existing thin preview APIs focused on content-file diffs
- On the preview pages, client-side augment the returned `changesSummary` with synthetic asset `FileChange` entries derived from the current draft-asset manifest
- Preview must show both:
  - normal content file changes
  - pending uploaded image file changes with their final target paths
- The preview count should include these asset file entries in the total displayed file count

## Interfaces and Types

- New draft ref wire format: `draft-asset:<id>`
- New client module/interface:
  - `DraftAssetStore.create(file, { repoKey, storagePath }): Promise<{ ref, previewUrl, metadata }>`
  - `DraftAssetStore.readFile(ref): Promise<File | Blob>`
  - `DraftAssetStore.resolveUrl(ref): Promise<string | null>`
  - `DraftAssetStore.delete(ref): Promise<void>`
  - `DraftAssetStore.collectFromContent(data): DraftAssetRef[]`
  - `DraftAssetStore.gc(): Promise<void>`
- `RepositoryBackend` gains `writeBinaryFile(...)`
- GitHub image write path becomes deterministic and branch-aware instead of generating the final filename at upload time
- Preview-page enhanced submissions gain:
  - one JSON manifest field for referenced staged assets
  - one file/blob part per referenced asset

## Test Plan

- GitHub single-entry edit:
  - selecting an image performs no network upload
  - preview shows content changes plus image file creates
  - `Save to Draft` uploads image to the draft branch, rewrites content path, clears local draft asset
  - `Publish Now` uploads image to main/default branch and clears local draft asset
- GitHub collection item flows:
  - existing item edit and new item create both handle staged images correctly
  - rename/new filename flows still work with staged image uploads
- Local-repo mode:
  - selecting an image stages locally only
  - explicit local save/create writes the image file into the repo and rewrites content
  - no server endpoint is used
- Replace/remove behavior:
  - replacing a staged image deletes the old staged asset
  - removing a staged image before save results in no upload/write
- Rendering:
  - image previews work for normal repo paths, absolute URLs, and `draft-asset:*` refs
  - list cards and content detail views render staged images without broken links
- Storage and resilience:
  - OPFS path works in supported browsers
  - IndexedDB fallback works when OPFS is unavailable
  - stale draft asset GC removes abandoned local assets
- Regression:
  - thin-backend guardrails still pass
  - no route-server read loads are reintroduced
  - no immediate image upload call remains in field interaction

## Assumptions and Defaults

- Scope includes both GitHub-backed mode and local-repo mode in v1
- Preview should include pending image file changes, not just content-file diffs
- Current 5 MB client-side image size limit stays unchanged in v1
- No unsaved-form autosave/recovery is added; only image bytes persist locally until explicit save/draft/publish
- Draft asset storage is repo-scoped and best-effort durable, but not treated as a permanent source of truth
- OPFS is the preferred byte store; IndexedDB blob fallback exists for unsupported environments
