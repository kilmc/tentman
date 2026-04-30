# Ideas

This file is a lightweight parking place for future Tentman ideas that still feel worth keeping around, but do not need their own standalone plan file right now.

These are not commitments and they are not sequenced roadmap items. They are here so older exploratory thinking stays easy to revisit without keeping the `plans/` directory crowded with superseded or speculative documents.

## Editor And Source Format Ideas

### Rich markdown editing with a raw escape hatch

- Replace the current textarea-first markdown experience with a richer editor surface plus a plain Markdown tab.
- Keep Markdown as the persisted source of truth.
- Preserve a raw editing path for round-trip edge cases and unsupported syntax.

### Inline draft-asset support inside markdown

- Allow inline markdown images to use the same draft-asset pipeline as dedicated image fields.
- Keep staged asset refs in markdown until explicit save, preview materialization, or publish.
- Reuse one shared materialization path instead of growing a second image-upload flow just for markdown.

### Content adapters for markdown-like formats

- Let repos declare additional markdown-like file extensions such as `.svx` or `.mdx`.
- Support adapter-owned parsing and serialization for known project syntax without forcing Tentman to render framework components itself.
- Keep this boundary focused on editing and source preservation rather than public-site rendering.

### Source preservation and raw fallback

- Strengthen guarantees around preserving unknown syntax, hand-authored HTML, imports, and unusual markdown/source formatting.
- Warn when a save would substantially rewrite a file.
- Consider a raw-source fallback for files Tentman cannot safely round-trip.

## Asset Workflow Ideas

### OPFS-staged draft assets

- Stage selected image bytes in the browser first, ideally in OPFS with IndexedDB-backed metadata.
- Keep only draft refs in form data while editing.
- Materialize final files only on explicit save, preview, draft save, or publish.
- Show pending asset file changes alongside content file changes in preview UIs.

### Richer asset pipeline

- Broader image/file pipeline around uploads, dimensions, path normalization, thumbnails, alt requirements, and related diagnostics.
- Keep the current conservative asset commands as the safe baseline.

## Collection And Navigation Ideas

### Compact collection item previews

- Better compact rows/cards for repeatable items and collection entries.
- Support primary label, secondary metadata, optional thumbnail, missing-required-field warnings, and clearer scan/edit/reorder behavior.
- Keep nested repeatable items and top-level collections conceptually aligned where that helps the UI.

### More advanced collection reordering UX

- Drag handles, compact rows, group-level reordering, and richer preview affordances for reorderable collection content.
- Keep this separate from source-of-truth identity and manifest logic, which are already in much better shape now.

## Scaffolding And Automation Ideas

### Instructions / scaffold flows

- Repo-authored `tentman/instructions/<id>/` flows for generating new pages or other content structures from schema-driven inputs and file templates.
- Client-planned by default, with the server limited to authenticated remote reads/writes in GitHub-backed mode.
- Good long-term fit for safe repo-specific automation without turning Tentman into a generic code-execution surface.

## UX And Product Polish Ideas

### Near-term polish candidates

- Better markdown preview rendering and typography.
- Stronger toast/notification behavior.
- Skeleton loading states instead of generic spinners.
- Better validation feedback and character counters.
- More visible upload progress and image-preview affordances.

### Larger workflow ideas

- Richer draft/change management.
- Clearer local workflow states such as edited, written, committed, staged for review, draft branch, and ready to publish.
- Deeper local Git workflow support if that becomes a clear product need.
