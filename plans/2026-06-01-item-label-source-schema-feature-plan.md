# Item Label Source Schema Feature (`isItemLabel` + `itemLabelFormat`)

## Summary
Add block-level item-label metadata so each item-like schema unit can explicitly choose its human-facing label source, while preserving today's title heuristic as fallback. Implement this as shared label-resolution utilities in `apps/web`, schema/discovery metadata preservation plus warn-and-ignore validation in config discovery, and targeted updates to all existing UI surfaces that already depend on shared item-title helpers.

This v1 applies only to item-like units:
- Top-level collections
- Inline structured repeatables / nested item-like entries
- Reusable block configs that define repeatable structured entries

It explicitly does not apply to singleton pages, and it must not affect identity fields, routes, filenames, `_tentmanId`, or `idField`.

## Key Changes

### 1. Schema and parsing
Update schema types and parsers to accept and preserve the new block metadata without changing existing identity semantics.

Affected modules:
- `apps/web/src/lib/config/types.ts`
- `apps/web/src/lib/config/parse.ts`
- `packages/core/src/project.js`
- `packages/core/src/schema.js`

Changes:
- Add `isItemLabel?: boolean` to block usage types.
- Add `itemLabelFormat?: Intl.DateTimeFormatOptions` to block usage types.
- Parse both properties on primitive blocks and inline `block` usages.
- Reject neither property at parse time except where the parser already hard-rejects unsupported block shapes like `tentmanGroup`; validation moves to discovery warnings instead of parser failures.
- Preserve both properties through legacy compat transforms and reusable block expansion paths.
- Extend core schema export summaries so raw schema inspection still includes the new metadata where present.

### 2. Discovery-time validation and warnings
Extend discovery issues so invalid configurations warn precisely and are ignored at runtime rather than breaking the app.

Affected modules:
- `apps/web/src/lib/config/discovery.ts`
- `apps/web/src/routes/pages/+layout.svelte`
- `apps/web/src/lib/features/content-management/components/Sidebar.svelte`
- `apps/web/src/lib/repository/local.ts`

Validation strategy per local schema unit:
- Top-level content config `blocks`
- Each inline structured block's `blocks`
- Each reusable block config's `blocks`

Rules:
- Allow at most one valid `isItemLabel: true` per local schema unit.
- If multiple appear in the same unit, emit one precise warning for that unit, ignore all explicit item-label declarations there, and fall back to the existing heuristic.
- Supported v1 label source types: `text`, `date`.
- Unsupported v1 source types: `textarea`, `markdown`, `email`, `url`, `number`, `boolean`, `toggle`, `image`, `block`, `tentmanGroup`, `select`, and any unknown/custom types. Warn and ignore.
- `generated: true` does not disqualify supported `text` or `date` fields.
- `itemLabelFormat` only has meaning on `date` blocks with `isItemLabel: true`.
- If `itemLabelFormat` appears elsewhere, emit a warning and ignore it.

Warning payloads should include:
- Config path
- Reusable block path when applicable
- Structured block path or block id context where possible
- Offending block id
- Reason the declaration is ignored

Implementation detail:
- Add a dedicated discovery pass that walks each schema unit boundary instead of a generic recursive "all descendants conflict" walk, because parent and child units are intentionally independent.

### 3. Shared item-label resolution
Replace the current "first human-ish visible field" logic with a new shared resolver that checks explicit item-label metadata first, then falls back to the existing heuristic unchanged.

Affected modules:
- `apps/web/src/lib/features/content-management/navigation.ts`
- `apps/web/src/lib/features/content-management/item.ts`
- `apps/web/src/lib/utils/page-title.ts`

Introduce a resolver shape along these lines:
- Resolve the effective item-label block for one local schema unit.
- Resolve a human-facing label value for a record plus schema unit.
- Return metadata such as `usedFallback`, `sourceBlockId`, and `sourceType` so callers can preserve current behavior like page-title fallback handling.

Resolution behavior:
- If there is one valid explicit label field and its value resolves non-empty, use it.
- `text`: trim, collapse all internal whitespace/newlines to single spaces, treat empty result as unusable.
- `date`: if the field is present and parseable, format it for humans; if formatting options are invalid or `Intl` throws, fall back to default date formatting for that field only.
- If the explicit field is empty/unusable, fall back to the current heuristic exactly as today:
  - primary card fields
  - secondary/aside card fields
  - remaining blocks in schema order
  - route/slug/id-ish identity fallback
  - generic item label
- Keep `usedFallback` semantics aligned with current page-title behavior so generic labels still appear when the resolved title is only identity-based fallback.

Date formatting:
- Reuse `Intl.DateTimeFormat`.
- Prefer runtime locale when available.
- Because there is no existing locale subsystem, use browser/runtime locale first and a final stable fallback of `en-US` when no locale is available.
- Default date formatting path should match current human-facing behavior as closely as possible when no custom `itemLabelFormat` is provided.

### 4. Top-level collection surfaces
Move all collection-facing UI to the new shared resolver by updating only the shared helpers and the places that sort/render by title.

Affected modules:
- `apps/web/src/lib/features/content-management/navigation.ts`
- `apps/web/src/lib/features/content-management/components/CollectionPanel.svelte`
- `apps/web/src/routes/api/repo/collection-items/+server.ts`
- `apps/web/src/lib/features/review-draft/config-review.ts`
- `apps/web/src/lib/features/review-draft/structural-changes.ts`

Outcome:
- Collection panel labels use the explicit source when configured.
- "Sort by title" sorts by the resolved human-facing label, not just the heuristic title.
- Draft/review cards and order-comparison views use the same resolved label.
- Page document titles continue to derive from the shared resolution helper.

### 5. Repeatable and structured item-like labels
Generalize repeatable label resolution so inline repeatables and reusable structured repeatables use the same schema-driven explicit label logic, while preserving existing ordinal prefixes.

Affected modules:
- `apps/web/src/lib/features/forms/repeatable-labels.ts`
- `apps/web/src/lib/components/form/ArrayField.svelte`
- `apps/web/src/lib/features/forms/edit-session.ts`
- `apps/web/src/lib/blocks/registry.ts`

Behavior:
- Resolve labels within the local repeatable schema unit only.
- Preserve prefix patterns like `Section 3: Intro`.
- If the resolved explicit label is unusable, keep the current ordinal fallback like `Section 3`.
- For reusable block configs, the reusable block's own schema remains authoritative; consuming usage cannot override its internal item-label choice.
- Keep current no-per-keystroke requirement for saved page-level UI, but preserve existing in-panel draft title updates where they already happen inside the edit session.

### 6. Save and refresh behavior
Use the existing refresh model rather than introducing live label syncing infrastructure.

Affected modules:
- `apps/web/src/routes/pages/[page]/new/+page.svelte`
- `apps/web/src/routes/pages/[page]/[itemId]/edit/+page.svelte`
- `apps/web/src/lib/stores/local-content.ts`

Plan:
- Rely on the existing `localContent.refresh({ force: true })` and GitHub-backed reload/goto flows after save/create/delete.
- Ensure any collection navigation payload recomputed after save uses the shared resolver, so newly saved labels appear without hard reload.
- Do not add per-keystroke sidebar/list relabeling for top-level collections in v1.
- Keep existing repeatable-panel draft title updates in-session for the active panel only.

### 7. Documentation
Ship docs in the same change and describe both behavior and warning semantics.

Affected module:
- `apps/web/src/lib/docs/content.ts`

Docs additions:
- Reference rows for `isItemLabel` and `itemLabelFormat` in `BlockUsage`.
- Clear statement that `isItemLabel` is local to one item-like schema unit.
- One collection example using a `text` field.
- One nested/repeatable or reusable-block example.
- One `date` example using `Intl.DateTimeFormat` options.
- Explanation of one-per-schema-unit validation.
- Explanation of warn-and-ignore behavior and fallback heuristic.
- Explicit note that singleton pages are out of scope for v1.

## Test Plan

### Unit tests
Update or add tests for:
- `apps/web/src/lib/features/content-management/navigation.spec.ts`
- `apps/web/src/lib/features/forms/repeatable-labels.spec.ts`
- `apps/web/src/lib/config/discovery.spec.ts`
- `apps/web/src/lib/utils/page-title.spec.ts`
- `packages/core/src/schema.test.js`

Scenarios:
- Explicit `text` label overrides heuristic.
- Empty/blank normalized `text` falls back to heuristic.
- Explicit `date` label resolves with default formatting.
- Explicit `date` label resolves with custom `itemLabelFormat`.
- Invalid `itemLabelFormat` falls back to default date formatting, not heuristic.
- Multiple `isItemLabel` in one schema unit warns and ignores all explicit labels in that unit.
- Parent and child schema units can each have their own valid `isItemLabel`.
- Unsupported source types warn and fall back.
- Reusable block config metadata is preserved and used by repeatable label resolution.
- `usedFallback` remains correct for page-title generation.

### Integration/server tests
Add coverage around:
- `apps/web/src/lib/server/api-repo-collection-items.spec.ts`
- `apps/web/src/lib/features/review-draft/build-review-model.spec.ts`
- `apps/web/src/lib/features/review-draft/config-review.spec.ts`

Scenarios:
- Collection API returns resolved explicit labels.
- Review draft cards use explicit labels.
- Collection order review uses resolved labels in before/after entries.

### Browser tests
Add or extend browser coverage for:
- Collection panel labels after save/create
- Title sorting when `isItemLabel` points to a non-title field
- Repeatable item labels after panel commit/save
- Date label rendering in visible UI

Likely homes:
- `apps/web/src/lib/test/browser/item-edit-page.svelte.spec.ts`
- `apps/web/src/lib/features/content-management/components/CollectionPanel.svelte.spec.ts`
- `apps/web/src/lib/components/form/ArrayField.svelte.spec.ts`

## Rollout Order
1. Add type support and parser preservation in `apps/web` and `packages/core`.
2. Add discovery-time schema-unit validation and warnings.
3. Introduce shared item-label resolver utilities with fallback-preserving behavior.
4. Switch top-level collection navigation/title/sort consumers to the shared resolver.
5. Switch repeatable/reusable structured label consumers to the shared resolver.
6. Add docs and full test coverage last, after behavior is stable.

## Assumptions and Risks
Assumptions:
- Runtime locale means browser/runtime locale when available; final stable fallback is `en-US`.
- v1 warning surfaces stay in existing app discovery/config-warning channels rather than adding a brand-new CLI diagnostics pipeline.
- Existing repeatable panel draft-title updates are acceptable even though top-level collection labels do not live-update per keystroke.

Risks:
- Current heuristics are split between `resolveContentItemTitle`, `formatContentValue`, and repeatable-label logic, so the main implementation risk is duplicating rules instead of centralizing them. The plan should avoid that by creating one shared resolver for item-like schema units and thin wrappers for collection vs repeatable callers.
- Reusable block path/context warnings need careful path formatting so nested block issues remain actionable.
- Date parsing with bare ISO strings can be timezone-sensitive; tests should use stable inputs and assert displayed labels in a controlled locale.
