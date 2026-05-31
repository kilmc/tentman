# Review Draft Redesign Plan

## Summary

Redesign Tentman's GitHub-backed `Review Draft` page into a calm, non-technical pre-publish review
surface that answers one question clearly: what exactly will go live when the user publishes.

The current `/publish` flow is still config-rollup-oriented. It shows changed config counts and
generic `Open` links, while the underlying compare utility reports only `modified`, `created`, and
`deleted` buckets. This plan replaces that with a Tentman-owned review model built from parsed
before/after content and existing Tentman ordering rules, while still using GitHub compare/file data
to narrow the work efficiently.

This pass is intentionally GitHub-draft-only. Local-mode parity is out of scope.

## Product Goals

- Replace the current config-count summary with config-first review sections.
- Show specific changed items in authored order, not grouped change buckets.
- Show only changed content inside item detail.
- Support content edits plus structural ordering changes in one review surface.
- Keep the UI human-readable and non-technical.
- Keep publish always enabled and available in the page header.

## Scope

### In Scope

- GitHub-backed `/publish` review flow
- Top-level content reorder review
- Per-config review sections
- Changed item cards for singletons and collections
- Edited, new, deleted, and moved/reordered states
- Field-level change presentation for text, markdown, structured content, and media/files
- Narrow fallback handling for Tentman-related unmappable changes

### Out Of Scope

- Local-mode Review Draft parity
- Commit history or PR state in the publish UI
- Filters, acknowledgments, or review checklists
- Rendering unchanged content in full
- A generic repo-wide diff browser
- Non-Tentman site changes beyond a minimal fallback notice/section

## Current State

- [apps/web/src/routes/publish/+page.svelte](/Users/kilmc/code/tentman/tentman/apps/web/src/routes/publish/+page.svelte)
  renders a simple config rollup with change counts and generic config links.
- [apps/web/src/routes/api/repo/publish-view/+server.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/routes/api/repo/publish-view/+server.ts)
  loads all configs and asks the draft comparison utility for per-config `modified / created / deleted`
  results.
- [apps/web/src/lib/utils/draft-comparison.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/utils/draft-comparison.ts)
  already uses GitHub compare data efficiently enough to skip unchanged configs, but its public model
  is too coarse for the redesigned UI.
- Existing shared ordering and labeling primitives already exist:
  - [apps/web/src/lib/features/content-management/navigation.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/features/content-management/navigation.ts)
    for item titles, config item labels, collection ordering, and top-level config ordering
  - [apps/web/src/lib/features/content-management/navigation-manifest.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/features/content-management/navigation-manifest.ts)
    for navigation manifest loading and manual ordering rules

## Technical Direction

- Keep GitHub compare/file APIs as the substrate for changed-file detection and efficient narrowing.
- Build a Tentman-owned review model from parsed before/after content plus manifest/root ordering.
- Keep server/client separation clear:
  - server builds the review model
  - client renders collapsible sections/cards and lightweight diff presentation
- Favor small composable feature modules over growing `draft-comparison.ts` into a monolith.
- Reuse existing Tentman title logic and ordering rules exactly rather than recreating them in
  review-specific code.

## Proposed Architecture

Add a new feature area:

`apps/web/src/lib/features/review-draft/`

Suggested modules:

- `types.ts`
  - Tentman-owned review model types
- `build-review-model.ts`
  - top-level server entry point for assembling the publish review payload
- `candidate-changes.ts`
  - wraps or extracts the cheap GitHub compare/file narrowing logic
- `config-review.ts`
  - builds one config section from before/after content and structural metadata
- `structural-changes.ts`
  - top-level order changes, collection reorder changes, repeating-structure reorder detection
- `field-review.ts`
  - derives changed field units from before/after records
- `text-diff.ts`
  - simple word-level and line-level diff helpers
- `fallback.ts`
  - collects Tentman-related changed files that could not be confidently mapped
- `navigation.ts`
  - helpers to build item/config-targeted review links

Suggested Svelte components:

- `ReviewDraftPageHeader.svelte`
- `ReviewDraftTopLevelOrderSection.svelte`
- `ReviewDraftSection.svelte`
- `ReviewDraftItemCard.svelte`
- `ReviewDraftFieldChange.svelte`
- `ReviewDraftRepeatingStructure.svelte`
- `ReviewDraftOtherChanges.svelte`

These should live under:

`apps/web/src/lib/features/review-draft/components/`

## Review Model

The API for `/api/repo/publish-view` should return a `reviewModel` instead of the current
`configsWithChanges + commits` shape.

Suggested shape:

```ts
interface PublishReviewModel {
	topLevelOrderChange: TopLevelOrderChangeReview | null;
	sections: ReviewSection[];
	otherSiteChanges: OtherSiteChangesReview | null;
	hasHiddenUnreviewedChanges: boolean;
}

interface ReviewSection {
	configSlug: string;
	configLabel: string;
	isCollection: boolean;
	badges: ReviewBadge[];
	defaultExpanded: boolean;
	navigationHref: string;
	collectionOrderChange: CollectionOrderChangeReview | null;
	items: ReviewItemCard[];
}

interface ReviewItemCard {
	itemId: string;
	title: string;
	href: string;
	changeKinds: Array<'edited' | 'new' | 'deleted' | 'moved'>;
	defaultExpanded: boolean;
	beforePosition?: number;
	afterPosition?: number;
	content: ReviewItemContent;
}
```

The exact types can evolve, but the key contract should hold:

- sections are config-first
- items are item-first
- movement is part of the same item card, not a separate synthetic row
- field presentation stays inside `content`
- fallback content is structurally separate from mapped review sections

## Data Assembly Flow

### 1. Load shared repo bootstrap

For `/api/repo/publish-view`, continue to load:

- selected repo context
- cached discovered configs
- root config
- navigation manifest
- draft branch name

Use existing cached loaders where possible.

### 2. Narrow changed candidate files cheaply

Reuse the current GitHub compare approach from `draft-comparison.ts` to get:

- changed file paths
- file statuses
- merge-base metadata if already available

This step should remain cheap and repo-wide.

### 3. Classify changed files

Split changed files into:

- config content files that map to a specific discovered config
- navigation manifest changes
- other Tentman-owned files that may affect review
- unmapped Tentman-related files

This classification should decide whether a config needs full before/after loading.

### 4. Build structural review first

Derive:

- top-level content order change from before/after navigation manifest state when root manual
  ordering is enabled
- per-collection order changes from before/after collection order under the same existing manifest
  rules
- repeating structured block reorder/add/remove mode switches from before/after parsed content

### 5. Build config sections

For each relevant config:

- load before content from the base branch
- load after content from the draft branch
- order items using existing Tentman rules
- compare records by stable item identity
- create one natural-order changed-item list
- keep deleted items anchored to their before-position
- attach collection reorder review if present

### 6. Build fallback section

If a changed Tentman-related file cannot be confidently mapped to:

- a top-level structural review
- a config section
- an item card

then surface it in `Other site changes`.

V1 should keep this narrow and Tentman-focused, not a generic site diff bucket.

## Reuse Points

### Ordering

Reuse existing ordering helpers rather than copying logic:

- `orderDiscoveredConfigs(...)` for section ordering
- `getOrderedCollectionNavigation(...)` or adjacent manifest-aware helpers for collection item order
- navigation manifest parsing/loading from `navigation-manifest.ts`

Behavior to preserve:

- if root manual ordering is enabled, use manifest top-level order
- otherwise preserve existing discovered/default order
- for collections with manual ordering, honor manifest order
- otherwise preserve current loaded order

### Item Labels

Reuse existing title logic from `navigation.ts`:

- `getContentItemTitle(...)`
- `resolveContentItemTitle(...)`
- `getConfigItemLabel(...)`

Do not add separate Review Draft title heuristics.

### Navigation Targets

Follow the product rules:

- changed collection item: link to that item
- changed singleton: link to config edit page
- reorder-only collection change: link to the config page

## Comparison Rules

### Config-Level

A config section should exist when any of these are true:

- item content changed
- items were created or deleted
- collection item order changed
- singleton content changed

### Item-Level

Compare collection items by the same stable identity Tentman already uses for collection navigation:

- `idField`/stable id when present
- existing route-derived fallback where current runtime behavior permits it

Each changed item card may represent:

- edit only
- new only
- deleted only
- moved only
- edit plus move

### Field-Level

For edited items, derive only changed fields.

Recommended approach:

- compare by block id across known config blocks
- ignore unchanged fields entirely
- keep field labels from config blocks
- treat unknown extra object keys conservatively and include them in structured before/after output if
  needed

### Repeating Structured Blocks

For repeatable structured fields:

- if only sub-item content changed, show only changed sub-items
- if add/remove/reorder occurred, switch that field to contextual before/after whole-list review
- mark moved sub-items explicitly

This logic belongs in a dedicated helper, not inline in the Svelte page.

## Diff Presentation

Keep the rendering primitives intentionally simple.

### Text

- default to inline word-level diff for short text
- fall back to line-level diff for longer multiline text
- preserve exact authored changes

### Markdown

- show styled source diff only
- no rendered preview mode in v1

### Structured Objects

- show labeled before/after at the changed-content level

### Media And Files

- show filename/reference alongside preview
- use before/after when useful
- never rely on preview alone

### Long Content

- no pagination
- allow local field-level collapsing for very long diffs

## Route Changes

### API

Refactor:

- [apps/web/src/routes/api/repo/publish-view/+server.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/routes/api/repo/publish-view/+server.ts)

Change it from:

- loop configs
- call `compareDraftToBranch(...)`
- return config buckets plus commits

To:

- load shared repo bootstrap
- build `reviewModel`
- return only publish-surface data needed by the page

Commits should be removed from the UI payload unless still needed for internal debugging.

### Page Load

Keep:

- [apps/web/src/routes/publish/+page.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/routes/publish/+page.ts)

as a thin loader around the API.

### Page UI

Replace the current rollup UI in:

- [apps/web/src/routes/publish/+page.svelte](/Users/kilmc/code/tentman/tentman/apps/web/src/routes/publish/+page.svelte)

with:

- intro copy
- persistent header publish action
- top-level reorder section when present
- independent collapsible config sections
- expand all / collapse all controls
- item review cards with targeted navigation
- `Other site changes` fallback section

Publish and discard actions in:

- [apps/web/src/routes/publish/+page.server.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/routes/publish/+page.server.ts)

should stay behaviorally unchanged in this pass.

## UI Behavior Rules

Implement these rules directly in the page state model:

- no counts in collapsed section headers
- use minimal change-type badges in collapsed headers
- sections are independently collapsible
- no exclusive accordion behavior
- if only one changed config exists, expand it by default
- if a config contains structural changes, expand it by default
- if an expanded config contains only one changed item, expand that item by default
- `Other site changes` defaults collapsed unless it is the only visible review content

## Milestones

### Milestone 1: Review Model Foundation

- Add `review-draft` feature modules and types
- Extract or wrap cheap changed-file candidate detection from `draft-comparison.ts`
- Build config/item/fallback review model assembly without UI polish
- Add model-level tests

### Milestone 2: Config Sections And Item Cards

- Replace current `/publish` UI with sectioned review rendering
- Add expand/collapse state handling and auto-expansion rules
- Reuse existing item-title and ordering helpers
- Add targeted navigation links

### Milestone 3: Field-Level Review Presentation

- Add text, markdown, structured object, and media/file presentation modes
- Show only changed fields in edited items
- Add long-field local collapsing

### Milestone 4: Structural Review

- Add top-level content reorder review
- Add collection reorder cards
- Add repeating structured block contextual before/after review for structural edits
- Add explicit moved indicators

### Milestone 5: Fallback And Cleanup

- Add `Other site changes`
- remove commit-oriented review concepts from `/publish`
- tighten copy and badge language
- finalize tests and cleanup

## Test Plan

### Model And Helper Tests

- changed-file classification maps content files to the correct configs
- top-level config ordering follows manifest/manual-order rules
- collection item ordering follows manifest/manual-order rules
- deleted items remain in their before-position in the rendered review order
- mixed edit+move produces one combined item card
- unchanged fields are excluded from edited item detail
- repeating structured blocks switch correctly between changed-subitem mode and contextual
  before/after mode
- unmappable Tentman-related files land in `Other site changes`

### Endpoint Tests

Update:

- [apps/web/src/lib/server/api-repo-publish-view.spec.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/server/api-repo-publish-view.spec.ts)

to assert:

- `reviewModel` payload shape
- top-level order section inclusion/exclusion
- config sections ordered correctly
- fallback behavior when no draft branch exists or session expires

### Page Tests

Update:

- [apps/web/src/routes/publish/page.spec.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/routes/publish/page.spec.ts)
- [apps/web/src/routes/publish/form-behavior.spec.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/routes/publish/form-behavior.spec.ts)

and add new Svelte/browser tests for:

- independent section collapsing
- expand all / collapse all controls
- default auto-expansion behavior
- item/config-targeted links
- `Other site changes` collapsed state
- publish button remaining available

### Regression Coverage

- current publish and discard mutation behavior remains unchanged
- GitHub session expiry still routes through the existing auth error handling
- no brute-force compare is introduced for all configs/files when GitHub compare can narrow the set

## Assumptions

- Review Draft remains GitHub-draft-only in this pass.
- The current Tentman draft branch flow and publish/discard actions remain intact.
- It is acceptable to replace the current publish-view API response shape because only the publish
  route depends on it.
- V1 fallback should stay narrow and Tentman-focused rather than enumerating every changed site file.
- Simple diff primitives are preferable to a heavy diff engine as long as they preserve authored
  changes clearly.
