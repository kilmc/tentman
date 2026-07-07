# Collection Sort Capabilities and Ordering Config

## Summary

Refactor collection panel sorting so Tentman only exposes controls that are backed by maintainer intent or clear schema capability. Replace the early `collection.sorting: "manual"` model with clearer `collection.ordering: true`, add explicit collection sort capabilities, and support a default sort with optional direction.

The guiding product principle is that Tentman should not tease editors with disabled or ineffective features. The maintainer chooses what editor-facing controls appear.

## Current State

- Root/top-level manual ordering is configured with `root.content.sorting: "manual"`.
- Collection manual ordering is configured with `collection.sorting: "manual"`.
- Collection panel `Custom`, `Alphabetical`, and `Date` sort UI is mostly hardcoded in `CollectionPanel.svelte`.
- `Date` appears even when no date field exists, then disables itself based on loaded item `sortDate` values.
- `sortDate` is derived from the first block whose `type` is `"date"`.
- Alphabetical sorting uses the resolved collection item title.
- There is no config for:
  - collection sort modes
  - default collection sort
  - default sort direction
  - choosing which text/date block powers a sort
  - multiple date sort modes such as published, created, and updated

## Goals

- Show collection sort controls only when they are actually available.
- Remove disabled Date sort affordances when the maintainer has not provided a date capability.
- Replace `collection.sorting: "manual"` with clearer `collection.ordering: true`.
- Add explicit collection sort configuration while preserving useful inferred defaults.
- Support multiple text/date sort modes.
- Support default sort direction.
- Keep implementation small enough for an early-access cleanup.

## Proposed Config Shape

```json
{
  "collection": {
    "ordering": true,
    "defaultSort": {
      "id": "publishedAt",
      "direction": "desc"
    },
    "sorts": [
      { "type": "alphabetical", "label": "Title" },
      { "type": "chronological", "blockId": "publishedAt", "label": "Published" },
      { "type": "chronological", "blockId": "createdAt", "label": "Created" },
      { "type": "chronological", "blockId": "updatedAt", "label": "Updated" }
    ]
  }
}
```

`defaultSort` should be polymorphic:

```json
{
  "collection": {
    "defaultSort": "published"
  }
}
```

is equivalent to:

```json
{
  "collection": {
    "defaultSort": {
      "id": "published"
    }
  }
}
```

## Proposed Types

```ts
type CollectionSortDirection = 'asc' | 'desc';

type CollectionSortConfig =
  | {
      id?: string;
      type: 'alphabetical';
      blockId?: string;
      label?: string;
      defaultDirection?: CollectionSortDirection;
    }
  | {
      id?: string;
      type: 'chronological';
      blockId: string;
      label?: string;
      defaultDirection?: CollectionSortDirection;
    }
  | {
      id: string;
      type: 'title';
      label?: string;
      defaultDirection?: CollectionSortDirection;
    }
  | {
      id: string;
      type: 'text';
      blockId: string;
      label?: string;
      defaultDirection?: CollectionSortDirection;
    }
  | {
      id: string;
      type: 'date';
      blockId: string;
      label?: string;
      defaultDirection?: CollectionSortDirection;
    };

type CollectionDefaultSortConfig =
  | string
  | {
      id: string;
      direction?: CollectionSortDirection;
    };

interface CollectionBehaviorConfig {
  ordering?: boolean;
  defaultSort?: CollectionDefaultSortConfig;
  sorts?: CollectionSortConfig[];
  groups?: CollectionGroupConfig[];
  state?: StateConfig;
}
```

## Semantics

- `collection.ordering: true` enables manual/custom ordering and the Customize UI.
- `collection.sorting: "manual"` should be removed rather than carried forward; this is early access and existing configs can be migrated.
- `collection.sorts` declares editor-selectable non-manual sort modes.
- Authored sorts should prefer intent names: `alphabetical` for title/text sorting and `chronological` for date-backed sorting.
- Field-backed authored sorts derive a stable sort id from `blockId` when `id` is omitted.
- `collection.defaultSort` selects the initial collection panel mode.
- If `defaultSort` is a string, use that sort mode's natural/default direction.
- If `defaultSort.direction` is provided, it overrides the sort mode's natural/default direction.
- Natural default directions:
  - title/text sorts: `asc`
  - date sorts: `desc`
  - manual/custom ordering: no direction

## Inferred Defaults

If `collection.sorts` is omitted, infer sort capabilities from the schema:

- Always infer a title sort from the resolved item title.
- Infer a date sort for each block with `type: "date"`.
- Use each date block's `id` as the sort id unless a collision requires a deterministic suffix.
- Use each date block's label as the sort label when available.
- Do not infer manual/custom ordering. Manual ordering only exists when `collection.ordering === true`.

This keeps simple collections friendly:

```json
{
  "collection": true,
  "blocks": [
    { "id": "title", "type": "text", "label": "Title" },
    { "id": "publishedAt", "type": "date", "label": "Published" }
  ]
}
```

can expose title and published-date sorting without extra config.

## Default Sort Behavior

If `collection.defaultSort` is omitted:

- If `collection.ordering === true`, default to manual/custom order.
- Otherwise default to source/current collection order.
- Still expose inferred or explicit sort modes in the menu.

This avoids changing the first view of an existing collection just because a date field exists.

## UI Rules

The collection panel should render controls from resolved capabilities:

- Show no sort dropdown when there are fewer than two available modes.
- Show title/text/date sort modes only when resolved capabilities include them.
- Show manual/custom only when `collection.ordering === true` and the collection can save order changes.
- Never show a disabled sort option just because Tentman knows how a feature could work.
- Do not show Date when there is no date sort capability.
- Do not show Custom/Manual when manual ordering is not enabled.

## Implementation Plan

1. Update config types and parser.
   - Replace `CollectionBehaviorConfig.sorting?: "manual"` with `ordering?: boolean`.
   - Add `sorts?: CollectionSortConfig[]`.
   - Add polymorphic `defaultSort?: CollectionDefaultSortConfig`.
   - Validate sort ids are non-empty and unique within a collection.
   - Validate explicit sort `blockId` references an existing compatible block type.

2. Update manual ordering helpers.
   - Replace `isCollectionManualSortingEnabled` checks with `isCollectionOrderingEnabled`.
   - Update setup/settings copy from `collection.sorting: "manual"` to `collection.ordering: true`.
   - Update test-app configs and fixtures.

3. Add a collection sort capability resolver.
   - Input: parsed content config.
   - Output: available sort modes, default mode, default direction, and manual-ordering availability.
   - Prefer explicit `collection.sorts` when provided.
   - Infer title and date sorts when `collection.sorts` is omitted.

4. Update collection item projection data.
   - Current `sortDate` only supports one implicit date.
   - Replace or extend with a generic sort value map keyed by sort id.
   - Keep title/resolved label available for title sort.
   - Ensure GitHub projection schema identity includes explicit/inferred sort fields.

5. Update collection navigation and cache.
   - Carry generic sort values through `CollectionNavigationItem`.
   - Update collection index/projection hydration so each explicit/inferred sort's source field is projected.
   - Keep manual manifest order behavior separate from sort modes.

6. Update `CollectionPanel.svelte`.
   - Remove hardcoded `CollectionSortType = 'custom' | 'title' | 'date'`.
   - Render menu options from resolved capabilities.
   - Initialize from `defaultSort`.
   - Apply sort using selected capability and direction.
   - Hide the dropdown when only one effective mode exists.
   - Hide Customize unless ordering is enabled and saveable.

7. Update docs and settings.
   - Document `collection.ordering`.
   - Document `collection.sorts`.
   - Document `collection.defaultSort` string and object forms.
   - Explain inferred title/date sorts.

8. Update tests.
   - Parser tests for `ordering`, `sorts`, and polymorphic `defaultSort`.
   - Navigation/capability resolver tests for inferred title/date sorts.
   - Multiple date blocks produce multiple date sort modes.
   - Collection panel does not render Date without a date capability.
   - Collection panel does not render Custom without `ordering: true`.
   - Default sort id and direction are honored.
   - Existing manual ordering tests are updated to `ordering: true`.

## Migration Notes

Because Tentman is still early access and the current user is the only active user of these features, do not preserve `collection.sorting: "manual"` in the final schema unless implementation reveals a strong reason to temporarily accept it.

Update existing fixtures/configs directly:

```json
{
  "collection": {
    "ordering": true
  }
}
```

instead of:

```json
{
  "collection": {
    "sorting": "manual"
  }
}
```

Root top-level ordering can remain as `content.sorting: "manual"` for this pass unless the implementation intentionally broadens the rename. This plan focuses on collection panel sorting and collection item ordering.

## Open Questions

- Should explicit `collection.sorts: []` mean "no sort controls", or should omission be the only inferred-default path? Preferred answer: `[]` means no non-manual sort controls.
- Should `defaultSort` be allowed to reference manual ordering, for example `"manual"` or `"custom"`? Preferred answer: yes, but use an internal reserved id such as `"manual"` only when `ordering: true`.
- Should text sorts support locale/case options now? Preferred answer: not in this pass.
