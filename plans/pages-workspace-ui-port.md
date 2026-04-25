# Pages Workspace UI Port

## Summary

Port the refined `design-mockups/07-app-flow` direction into the real Tentman pages workspace as a feature-first Svelte implementation, using the prototype as visual reference rather than copying its CSS.

The first implementation should include the full pages UI: left site sidebar, top header actions, collection panel/editor layout, singleton form width cap, and structured repeatable-block side editor.

Use Kilian's coding style: split the work into small `content-management` and `form` feature components, keep route files thin, use Svelte 5 runes-era patterns where touched, and avoid custom config-specific layout hacks.

## Key Changes

- Canonical layout terms for this shell:
  - `Sidebar`: left app/site navigation
  - `Header`: top action bar for the current view
  - `Collection Panel`: panel for top-level collection item management
  - `Main Panel`: primary content/view/edit surface
  - `Side Panel`: flexible right-side panel for secondary editing flows
- Add `lucide-svelte` and use Lucide for all new icon work in this UI update: settings, navigation edit, list hide/show, sort, add, check/status, remove, and drag/order controls.
- Do not migrate existing bespoke/inline icons outside this new UI work in this pass. Leave the markdown toolbar and unrelated icons for a later Lucide consistency pass.
- Replace the current top-header-heavy pages experience with a pages workspace shell:
  - Left sidebar owns site name, repo label, settings cog menu, page-only navigation, Edit navigation, and Switch site.
  - Settings stays in the cog menu, not in the page nav.
  - Header shows the current page title plus `Preview` and `Publish` actions using existing availability rules.
  - Normal sidebar nav shows only user site pages, no collection item counts.
- Extract route chrome out of `src/routes/pages/+layout.svelte` into feature components under `src/lib/features/content-management/components`, keeping data/loading logic explicit and route-owned where appropriate.
- Move collection item navigation into a dedicated collection panel:
  - The collection panel is visible beside item view/edit/new routes on desktop.
  - Selecting an item does not collapse the panel.
  - Collapsed panel mode uses an explicit hide/show control tied to the collection panel.
  - `New {itemLabel}` lives in the collection panel, not beside Publish.
- Add collection panel sorting:
  - Support `Custom`, `Title A-Z`, and `Title Z-A`.
  - `Custom` uses the manifest order and reveals an edit-order action.
  - Editing custom order updates `tentman/navigation-manifest.json` through the existing manifest write flow.
  - Do not add date sorting in this pass because the current collection list data is title/id based.
- Update form/editor surfaces:
  - Singleton page forms stay left-aligned with a reasonable max width.
  - Collection item editors use the persistent index plus editor layout.
  - Image fields remain in normal one-column form flow.
  - Remove internal terms from user-facing app chrome; use labels like Posts, Projects, Home.
  - Use monochrome status dots/badges for draft/new/changed state, no colored highlight system.
- Update structured repeatable block editing:
  - Replace inline-expanded structured arrays in `ArrayField.svelte` with a selected-row list plus right-side item editor panel.
  - Apply this only to structured repeatable block/object entries.
  - Keep primitive arrays simple and inline.
  - Row labels should be deterministic: use `itemLabel` when available, then the first non-empty displayable child field, then `Item {index + 1}`.
  - On narrow screens, stack the selected-entry editor below the repeatable list rather than using a drawer/modal.

## Implementation Notes

- Keep server/API shapes mostly unchanged. Reuse existing `/api/repo/collection-items` and navigation manifest endpoints where possible.
- If helper logic grows, add focused modules under `src/lib/features/content-management` for collection panel view models and under `src/lib/features/forms` for repeatable item labels.
- Avoid a broad rewrite of content loading, draft branch handling, local/GitHub save flows, or asset staging.
- Use component-scoped styles or small semantic class systems inside the new feature components; do not paste prototype CSS wholesale.
- Preserve current local and GitHub modes, draft branch behavior, form actions, keyboard shortcuts, and unsaved-change guards.

## Test Plan

- Add or adjust browser component tests for:
  - Pages sidebar renders site pages only, settings in cog, and Switch site at the bottom.
  - Collection item routes render the collection panel beside the editor and keep it visible after item selection.
  - Collection panel sort switches between Custom and title sorting, and Custom edit mode updates the navigation manifest flow.
  - Singleton edit pages keep forms left-aligned with a capped width.
  - Structured repeatable arrays render as row list plus selected editor panel; primitive arrays remain inline.
  - Image fields remain in normal form flow.
- Keep existing local/GitHub save, create, edit, delete, draft asset, and manual navigation tests passing.
- Run scoped Vitest browser tests for touched routes/components, then `svelte-check --tsconfig ./tsconfig.json`; run broader tests if shared helpers or route data contracts are changed.

## Assumptions

- First pass covers the pages/content-management workspace, not the unauthenticated landing/repo selection/docs screens.
- `lucide-svelte` should be added as the icon dependency for new UI work.
- Existing bespoke icons can stay until a later cleanup pass.
- Preview and Publish should use the prototype labels but respect existing backend/draft availability.
- Collection item ordering belongs in the collection panel, not the global site sidebar.
- No new cross-content relationship UI should be introduced.
