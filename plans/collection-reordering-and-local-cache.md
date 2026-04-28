# Collection Reordering and Smarter Local Cache

## Summary

Improve two areas: make local repo discovery auto-refresh when the repo's config/plugin structure changes, and replace the separate collection reorder screen with an inline "Customize" mode that supports dragging items, moving items between groups, and reordering groups. Use explicit Save/Cancel for all ordering changes.

## Key Changes

- Add a lightweight local discovery signature to the local repository backend: root config text, discoverable content config paths, block config paths, and registered plugin entrypoint paths/existence.
- Change `localContent.refresh()` so non-forced refreshes compare the signature before reusing cached state. If files were added/removed, or root plugin/config discovery settings changed, invalidate discovery/plugin caches and reload. Existing config content edits can still require manual Rescan.
- Keep "Rescan repo" as a hard refresh escape hatch.
- Replace the Collection Panel's `Custom` button with `Customize` plus an edit icon.
- In Customize mode, render the same visible panel structure with drag handles instead of switching to a separate reorder-only layout.
- Use explicit `Save order` and `Cancel` controls. Drag changes stay local until saved.
- Allow item dragging within a group, between groups, and into Ungrouped.
- Allow group dragging. While a group drag is active, collapse group contents so only group headers/counts are visible.
- Persist group order to `collection.groups` in the content config, then rebuild/sync the manifest groups in that same order.

## Data And Mutation Behavior

- Add a collection-order save path shared by local and GitHub modes. For GitHub, add a new navigation manifest API action such as `save-collection-order`; for local, call the same domain helper directly.
- Saving collection order writes three things together: reordered `collection.groups` in the config, updated item group fields for moved items, and updated `tentman/navigation-manifest.json`.
- Auto-detect the item group field only when exactly one select block has `options.source === "tentman.navigationGroups"` and `options.collection` matching the current collection. If none or multiple exist, block Save with a clear error explaining that item group moves need one unambiguous group field.
- Group order can still be saved even if no item group field exists, but item moves between groups cannot.
- Manifest item/group membership remains the navigation/order cache, but config-backed `collection.groups` is the source of group definition and group order.

## Tests

- Unit-test local discovery signatures: added config file, removed config file, changed root config discovery/plugin settings, unchanged existing config content.
- Unit-test navigation draft serialization with reordered groups and moved items.
- Unit-test group-field auto-detection: exactly one matching field succeeds; none/multiple fail with useful errors.
- Browser-test Collection Panel customize mode: label/icon appear, current list gains drag handles, Save/Cancel work, group drag collapses items, moved item writes expected draft payload.
- API/local helper tests verify one save updates config group order, item group field values, and manifest membership/order.

## Assumptions

- Existing config edits do not need automatic cache invalidation unless they change discovered file structure or root discovery/plugin settings.
- Inline reordering is only enabled for manually sortable collections with stable runtime identities.
- Item group values should store the group `_tentmanId`, matching current navigation group option values.
