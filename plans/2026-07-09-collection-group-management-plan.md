# Collection Group Management

## Summary

Add first-class collection group management to Tentman through `collection.groupManagement: true`. This is independent from `collection.ordering: true`: maintainers can allow group CRUD without allowing manual item/group ordering, allow manual ordering without group CRUD, or enable both.

V1 should be comprehensive across the web app, docs, core package, and CLI-facing schema/diagnostics. It should remove `tentmanGroup.addOption` as a supported feature control rather than preserving a second public API. Existing `addOption` usage should produce clear migration guidance: move the capability to the target collection with `collection.groupManagement: true`.

## Current State

- Collection groups are configured in `collection.groups` with `label`, optional `value`, and optional `_tentmanId`.
- `tentmanGroup` fields store item membership in `_tentmanGroupId`.
- Inline "Add group..." currently appears only when a `tentmanGroup` block has `addOption: true`.
- Inline add currently creates a stable id in the form field, writes that id to the navigation manifest, but writes a different generated `_tentmanId` to `collection.groups`. This must be fixed before building the management UI.
- The collection panel can reorder groups and move items between groups only when collection ordering is active.
- The visible Ungrouped section is computed from collection items that are not listed in any manifest group; it is not a real configured group.
- Normal app behavior already uses `_tentmanGroupId` and manifest group `id` as stable identity. Remaining `value` reference paths in core and web are migration/repair compatibility paths.

## Product Decisions

- `collection.groupManagement: true` enables group creation and the Manage Groups UI.
- `collection.ordering: true` continues to enable collection manual order/customize behavior.
- `groupManagement` and `ordering` do not imply each other.
- `tentmanGroup.addOption` is removed as a supported config surface.
- `label` is the human-facing display text in the Tentman UI.
- `value` remains required metadata for groups and should remain unique within a collection to avoid author confusion, even though identity is `_tentmanId`.
- Editing a group can change `label` and `value`, but must not change `_tentmanId` or item `_tentmanGroupId` memberships.
- Deleting a group removes the group definition and unassigns its items; those items should appear at the bottom of Ungrouped.
- Merging appends source group items to the end of the target group and removes the source group.
- Deleting or merging the final group is allowed.
- Direct visits to `/pages/[page]/groups` should redirect back to `/pages/[page]` when group management is not enabled.
- V1 should use a dedicated Manage Groups button beside the `+` button in the collection panel header, not an overflow menu.

## Config Shape

```json
{
  "collection": {
    "groupManagement": true,
    "groups": [
      {
        "_tentmanId": "identity",
        "label": "Identity",
        "value": "identity"
      }
    ]
  },
  "blocks": [
    {
      "type": "tentmanGroup",
      "label": "Group",
      "collection": "projects"
    }
  ]
}
```

`collection: true` remains valid for simple collections. To enable group management, authors must use object form:

```json
{
  "collection": {
    "groupManagement": true
  }
}
```

## Semantics

- `groupManagement: true` allows creating, editing, deleting, and merging configured groups for the current collection.
- Group management applies only to the current collection config.
- The Manage Groups button should only render when the current collection has `groupManagement: true`.
- Inline "Add group..." for `tentmanGroup` fields should be allowed when the block targets a collection with `groupManagement: true`.
- Inline add should no longer depend on block-local `addOption`.
- Group creation must create one stable id and use it consistently in:
  - config group `_tentmanId`
  - manifest group `id`
  - any immediate form field value selected after inline creation
- New group operations must not use `value` as identity.
- `value` should be validated as required, non-empty, and unique within the collection.
- `label` should be validated as required and non-empty.
- The `tentmanGroup` edit-field UI is not the source of truth for membership persistence. It is useful editor UX, but group membership is canonically stored in `_tentmanGroupId` and mirrored through the navigation manifest.
- Editing `value` should update config and manifest metadata only. Existing item memberships remain by `_tentmanGroupId`.
- Deleting a group removes it from config and manifest groups, removes or nulls `_tentmanGroupId` from source items assigned to that group, and appends those item ids after existing ungrouped items in the manifest order.
- Merging a source group into a target group appends source group item ids after target group item ids, rewrites source items' `_tentmanGroupId` to the target id, removes the source group from config and manifest groups, and keeps the target group's `_tentmanId` stable.
- Legacy item `group` fields should be left alone unless an existing compatibility flow already updates them. The normal managed membership field is `_tentmanGroupId`.

## Route And UI

- Add `/pages/[page]/groups`.
- The route should render in the existing main panel area owned by `pages/+layout.svelte`, replacing the current collection landing content.
- The collection panel remains visible on desktop and mobile as it does for other collection routes.
- Add a Manage Groups icon button beside the existing `+` button in `CollectionPanel.svelte`.
- Use an appropriate lucide icon and accessible label such as `Manage groups`.
- The button should link to `/pages/${slug}/groups`.
- The page should show the collection's group list and actions:
  - create group
  - edit label/value
  - delete/unassign
  - merge into another group
- Use confirm affordances for destructive delete and merge operations.
- The UI should show group item counts based on current navigation/manifest state.
- Empty group collections should still support creating the first group.

## Data Mutation Design

Add a shared domain layer near `navigation-manifest.ts` for group-management mutations. The web app local path and GitHub API endpoint should call the same helpers.

Suggested helper surface:

```ts
type CollectionGroupManagementMutation =
  | { action: 'create'; label: string; value: string }
  | { action: 'edit'; groupId: string; label: string; value: string }
  | { action: 'delete'; groupId: string }
  | { action: 'merge'; sourceGroupId: string; targetGroupId: string };
```

The implementation can split this into separate functions if that reads better:

- `createCollectionGroup(...)`
- `updateCollectionGroup(...)`
- `deleteCollectionGroup(...)`
- `mergeCollectionGroups(...)`

Each mutation should:

- require a stable collection `_tentmanId`
- read and write the collection config source
- read collection content when item memberships must change
- update item `_tentmanGroupId` values only when delete/merge requires it
- update `tentman/navigation-manifest.json`
- preserve unrelated manifest sections
- preserve collection group order unless the mutation removes or appends a group
- return the next manifest

For local mode:

- Call the shared helper directly with the local repository backend.
- Refresh `localContent` with `force: true`.
- Reload local collection items and state summaries as needed.
- Show local save toasts consistent with existing collection-order flows.

For GitHub mode:

- Extend `/api/repo/navigation-manifest` or add a closely related endpoint with group-management actions.
- Use `ensureDraftBranch`, `withTrackedBatchedRepositoryWrites`, and `ensureDraftPullRequest` like existing manifest mutations.
- Invalidate repository data with the actual changed paths.
- Return the updated navigation manifest and draft branch name.
- Refresh the affected collection cache after a successful mutation.

## Independence From Ordering

Because `groupManagement` does not imply `ordering`, the implementation must not require `isCollectionOrderingEnabled()` for group creation, editing, delete, or merge.

This means group-management code needs manifest support even when `collection.ordering !== true`. The manifest should still be allowed to carry grouped membership for a collection with managed groups. Existing build/reconcile logic currently focuses collection manifest sections on ordering-enabled collections; the implementation should separate:

- collection has ordering controls
- collection has managed groups
- collection needs stable collection/item/group ids
- collection should have a manifest collection section

Add a capability helper such as:

```ts
isCollectionGroupManagementEnabled(config)
isCollectionManifestBacked(config)
```

where manifest-backed includes ordering or group management.

## Migration And Compatibility

- Remove `addOption` from the supported web config types and parser output.
- When `addOption` appears on a `tentmanGroup` block, report a clear config warning or diagnostic:
  - `tentmanGroup.addOption has been replaced by collection.groupManagement. Add "groupManagement": true to the target collection config.`
- The core CLI/schema should surface the same guidance.
- Do not keep app behavior branches that continue honoring `addOption`.
- Keep existing legacy repair/reference compatibility for stable-id migration:
  - group reference candidates can include `value`
  - nav refresh can rewrite legacy group references to stable ids
  - write-ids can backfill `_tentmanGroupId` from legacy item `group` values
- Treat those as migration/repair paths, not normal identity behavior.

## Core And CLI Scope

Update `packages/core` so the feature is not web-only:

- Parse and expose `collection.groupManagement`.
- Include the new field in schema output.
- Remove `tentmanGroup.addOption` from schema summaries.
- Add diagnostics for old `addOption` usage with migration guidance.
- Ensure `nav-rebuild`, `nav-refresh`, `write-ids`, diagnostics, and manifest helpers treat managed groups as stable-id entities.
- If CLI commands currently require ordering to generate collection manifest sections, update that logic to include group-managed collections.
- Update core tests around config parsing, schema, diagnostics, nav refresh/rebuild, and id writing.

## Documentation Scope

Update app docs and examples:

- Document `collection.groupManagement`.
- Document the difference between `ordering` and `groupManagement`.
- Replace `tentmanGroup.addOption` examples with `collection.groupManagement`.
- Explain that `label` is the Tentman display label.
- Explain that `value` is required unique group metadata, but not the identity reference for membership.
- Document `_tentmanId` as the stable group identity.
- Document delete/unassign and merge behavior.
- Document that Ungrouped is computed, not configured.
- Update any examples that currently show `addOption`.

## Validation Rules

- `collection.groupManagement` must be boolean when present.
- `collection.groups` must keep requiring object entries with non-empty `label`.
- In group-management mutations, `value` must be non-empty and unique among other groups in the same collection.
- Editing a group cannot change `_tentmanId`.
- Merge must reject source and target being the same group.
- Delete and merge should reject unknown group ids.
- Create should reject duplicate values and duplicate labels if product wants to keep the current stricter behavior; at minimum reject duplicate values.
- Delete and merge should not require a visible `tentmanGroup` block in the edit form. If a developer removes that field from the item edit interface, the UX is worse because editors cannot select groups while editing an item, but the canonical storage field is still `_tentmanGroupId`.
- Stale or out-of-sync group ids should be handled by an explicit refresh/repair flow, not by group-management workaround logic. The repair flow should reconcile config group ids, item `_tentmanGroupId` values, and manifest group/item references so stale ids are cleaned up in one predictable place.

## Implementation Plan

1. Update config model and parsing.
   - Add `groupManagement?: boolean` to web and core collection behavior types.
   - Parse and validate `collection.groupManagement`.
   - Add `isCollectionGroupManagementEnabled()` and a manifest-backed capability helper.
   - Remove `addOption` from supported `tentmanGroup` block parsing.
   - Add warning/diagnostic coverage for old `addOption` usage.

2. Fix stable-id alignment for inline group add.
   - Change `addCollectionGroupToConfigSource()` to use the passed id as `_tentmanId`.
   - Validate duplicate ids/values against existing config groups.
   - Keep the manifest and config write using the same id.
   - Update tests that currently allow or miss the mismatch.

3. Move inline add gating to collection config.
   - Pass enough collection capability context into form rendering so `tentmanGroup` fields know whether their target collection has `groupManagement: true`.
   - Remove `TentmanGroupBlockUsage.addOption` and `TentmanGroupBlockOptions.addOption`.
   - Keep inline add available in new/edit forms only when the target collection opts into group management.

4. Add group-management mutation helpers.
   - Implement create/edit/delete/merge in a shared module.
   - Reuse existing config source and item write helpers where possible.
   - Split current `saveCollectionOrder()` internals if needed so delete/merge can update `_tentmanGroupId` memberships without requiring ordering or a visible `tentmanGroup` edit block.
   - Ensure file-mode and directory-mode collections both work.
   - Ensure manifest updates preserve unrelated content and collection sections.

5. Extend GitHub mutation endpoint.
   - Add request validation for group-management actions.
   - Call shared helpers inside the existing batched write/draft branch flow.
   - Return updated manifest and branch name.
   - Invalidate config, manifest, collection item, and state caches using tracked changed paths.

6. Add local mutation wiring.
   - Add client-side calls for local mode from the new groups route.
   - Use the same helper against `localRepo` backend.
   - Refresh local content and collection navigation after successful mutation.

7. Add `/pages/[page]/groups`.
   - Add route load behavior compatible with local and GitHub modes.
   - Redirect to `/pages/[page]` when the collection is missing or `groupManagement` is not enabled.
   - Render group rows, counts, and create/edit/delete/merge controls.
   - Keep UI states for saving, validation errors, and confirmation flows.

8. Add Collection Panel entry point.
   - Add a Manage Groups icon button beside the `+` button.
   - Render it only for `groupManagement: true`.
   - Pass capability from `pages/+layout.svelte` into `CollectionPanel`.
   - Add desktop and mobile coverage.

9. Update core and CLI behavior.
   - Add schema output for `groupManagement`.
   - Remove schema output for `addOption`.
   - Update diagnostics and tests for migration guidance.
   - Ensure nav rebuild/refresh and write-ids work for group-managed collections independent of ordering.
   - Ensure there is a clean refresh/repair path for stale group ids and manifest references.

10. Update docs and examples.
    - Replace `addOption` docs and examples.
    - Add group-management reference docs.
    - Add behavior notes for delete, merge, Ungrouped, label, value, and stable ids.

## Test Plan

- Config parser tests:
  - parses `collection.groupManagement`
  - rejects non-boolean values
  - rejects or warns on `tentmanGroup.addOption` with migration guidance
  - keeps `ordering` and `groupManagement` independent

- Core/CLI tests:
  - schema includes `groupManagement`
  - schema no longer includes `addOption`
  - diagnostics report old `addOption`
  - nav rebuild/refresh handles group-managed collections without ordering
  - write-ids backfills group ids and item group ids for group-managed collections

- Domain mutation tests:
  - create writes matching config `_tentmanId` and manifest group `id`
  - create rejects duplicate `value`
  - edit updates label/value without touching ids or item memberships
  - delete removes the group, clears item `_tentmanGroupId`, and appends affected items to Ungrouped
  - merge appends source items to target, rewrites item `_tentmanGroupId`, removes source group, and preserves target id
  - delete/merge work for file and directory content modes
  - final group can be deleted or merged away

- API tests:
  - GitHub actions validate payloads
  - draft branch and PR flow still runs
  - changed paths include config, manifest, and item files when applicable
  - cache invalidation receives the tracked paths

- Route/component tests:
  - Manage Groups button appears only with `groupManagement: true`
  - `/pages/[page]/groups` redirects when not enabled
  - create/edit/delete/merge form states render and submit
  - local mode refreshes after mutation
  - GitHub mode updates draft branch state after mutation
  - inline Add group appears only for target collections with `groupManagement: true`

- Browser tests where useful:
  - collection panel header layout with Manage Groups and `+`
  - groups route main panel at desktop and mobile widths
  - no overlapping text in confirmation and merge controls

## Open Implementation Notes

- Prefer one shared mutation layer over duplicated local/GitHub behavior.
- Consider renaming existing inline-add helpers from "navigation group" to "collection group" while touching them.
- Keep compatibility paths isolated and named as migration/repair code so new feature code does not accidentally depend on `value` as identity.
- Keep group ordering in the existing Customize UI for v1; the Manage Groups route owns CRUD, not drag sorting.
- Do not block group management merely because the item edit form no longer exposes a `tentmanGroup` block. That is a content-model UX issue for the site developer to fix, while `_tentmanGroupId` remains the managed storage contract.
