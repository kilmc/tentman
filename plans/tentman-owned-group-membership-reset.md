# Tentman-Owned Group Membership Reset

## Summary
Replace the current `select`-based navigation-group field with a dedicated Tentman-owned block type and move canonical item group membership storage to `_tentmanGroupId`.

This is a hard contract reset, not a compatibility layer:
- New config API: dedicated `tentmanGroup` block
- Removed config API: `type: "select"` with `options.source: "tentman.navigationGroups"`
- Canonical persisted item field: `_tentmanGroupId`
- Existing user `group` fields are left alone; Tentman no longer reads or writes them

After implementation, provide a short migration note for Theresa’s site agent that explains how to update config syntax and rerun the CLI backfill.

## Key Changes

### 1. Config/schema contract
- Add a dedicated block type, recommended shape:

```json
{
	"type": "tentmanGroup",
	"label": "Group",
	"collection": "posts",
	"addOption": true
}
```

- Do not allow `id` on this block type.
- Require `collection`.
- Keep config collection groups as:
  - `_tentmanId`
  - `label`
  - `value`
- Remove support for `select.options.source === "tentman.navigationGroups"`:
  - parser throws a hard error
  - docs/examples/tests switch to the new block
- Update schema/reporting output so the new block appears explicitly as Tentman-owned rather than a normal content field.

### 2. Storage/runtime behavior
- Treat `tentmanGroup` as a system field that always persists to `_tentmanGroupId`.
- Normal block ids continue to map to user content keys; `tentmanGroup` is the only exception and it is explicit in the block type, not hidden inside `select`.
- Web form loading/saving must:
  - read current selection from `_tentmanGroupId`
  - write updated selection back to `_tentmanGroupId`
  - never overwrite or remove any existing `group` field
- Add-group UI still creates config/manifest groups with `_tentmanId + label + value`, then selects the new group by writing its `_tentmanId` into `_tentmanGroupId`.

### 3. CLI/core flow
- `tentman ids write` becomes the canonical backfill command for this feature:
  - still writes missing config `_tentmanId`s
  - still writes missing config group `_tentmanId`s
  - additionally writes `_tentmanGroupId` into content items where a `tentmanGroup` block exists and an item can be matched to a config group by legacy reference
- Matching rule for backfill:
  - use config group references `[_tentmanId, value]`
  - if an item already has `_tentmanGroupId`, leave it unchanged
  - otherwise, if a legacy user field value matches a group `value`, write `_tentmanGroupId`
  - do not delete or rewrite the old field
  - do not guess from labels
- `nav rebuild`, `nav explain`, diagnostics, and any group-order save logic must read `_tentmanGroupId` only.
- Manifest groups continue to use stable group ids plus materialized `label` and `value`.

### 4. Web/manual-ordering updates
- Replace the current “detect the one select field using `tentman.navigationGroups`” logic with “detect the one `tentmanGroup` block for this collection”.
- Manual group reordering/moving items between groups must update `_tentmanGroupId`, not `group`.
- Form rendering should use a dedicated field component or explicit branch in `FormField.svelte` for `tentmanGroup`; do not route it through generic `SelectField` behavior unless the API remains clearly dedicated.
- Docs and examples should explain that:
  - `tentmanGroup` is a Tentman-owned field
  - it stores `_tentmanGroupId`
  - user content fields like `group` are unrelated and free for developer use

## Test Plan
- Parser tests:
  - accepts `tentmanGroup`
  - rejects `id` on `tentmanGroup`
  - rejects missing `collection`
  - rejects legacy `select + source: "tentman.navigationGroups"`
- Web/unit tests:
  - options resolve from manifest groups for `tentmanGroup`
  - saving an item writes `_tentmanGroupId`
  - existing `group` content is preserved untouched
  - add-group flow selects the new group by `_tentmanGroupId`
  - manual collection order save rewrites `_tentmanGroupId` for moved items
- Core/CLI tests:
  - `ids write` writes missing config/group ids and backfills `_tentmanGroupId`
  - `ids write` leaves existing legacy `group` fields unchanged
  - `ids write` does not overwrite existing `_tentmanGroupId`
  - `nav rebuild` groups items using `_tentmanGroupId`
  - no code path reintroduces `slug` as group identity
- Docs/examples sanity:
  - at least one example config and one README/docs section use the new block and `_tentmanGroupId` language

## Migration Note To Deliver After Implementation
Prepare a concise note for the site agent with these steps:
1. Replace any `select` block using `source: "tentman.navigationGroups"` with `type: "tentmanGroup"`.
2. Keep existing `collection.groups` definitions, but ensure each has `_tentmanId`.
3. Run `tentman ids write` to backfill `_tentmanGroupId` onto items.
4. Stop reading/writing legacy `group` for Tentman grouping; use `_tentmanGroupId` as the canonical stored membership field.
5. Run `tentman nav rebuild` if a manifest already exists so grouped manifest output reflects the new stored ids.

## Assumptions
- Chosen API: dedicated block type, recommended name `tentmanGroup`.
- Chosen policy: hard error on old syntax; no backward compatibility layer.
- Chosen persistence rule: `_tentmanGroupId` is the only Tentman-owned stored item field for group membership.
- Chosen migration rule: backfill `_tentmanGroupId`, but preserve legacy user fields like `group` verbatim.
