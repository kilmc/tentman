# Reference-Based Content Component Placement Refactor and Completion

## Summary

Complete the reference-placement feature as a shared content-component runtime, then reduce `MarkdownField` to a thin UI container that consumes that runtime. Treat the current implementation as an alpha-phase partial slice: preserve the semantic marker direction and the useful editor affordances, but replace the current ad hoc reference handling with one authoritative model for schema validation, reference indexing, instance resolution, preview/render context, and save-blocking diagnostics.

This feature is not limited to collection-item embedding. The intended model is broader: markdown content components are semantic placement markers for any structured data that lives inside the current content item. A repeatable collection item is only one valid reference shape. A sibling structured object, a top-level structured object, or a primitive top-level field are all equally part of the core feature when they expose a primitive token field through `referenceFor`.

## Implementation Status

Overall estimated completion: 95-100%

### 1. Shared reference-aware content-component subsystem

Estimated completion: 95-100%

Done
- Core content-component normalization supports `reference`, `referenceScope`, shared reference indexing, unified `{ attributes, data }` resolution, validation helpers, and `render` target metadata.
- Shared reference state helpers exist on the web side for collecting bindings and picker options from the current content item.
- Shared validation now covers unresolved references, missing attributes, invalid directive instances, and disabled/unknown components at the markdown-field boundary.

In progress
- Final downstream alignment has been exercised through the focused browser/editor flows and shared test suites, with remaining risk now mostly around future feature additions rather than the current implementation slice.

Remaining
- Keep using the shared runtime as the only policy path for new authoring/display surfaces added after this refactor.

### 2. Unified preview/render pipeline

Estimated completion: 90-95%

Done
- Preview resolution now uses shared core content-component rules.
- `@tentman/mdsvex` supports `render.mdsvex` targets with generated imports and component invocations.
- Preview and validation safely handle malformed directive attributes instead of throwing.

In progress
- Browser-led parity work has been completed for the intended v1 authoring and preview flows; residual risk is now edge-case drift outside the focused harness.

Remaining
- Extend the same parity expectations to any future display surfaces or framework targets added beyond the current mdsvex/preview scope.

### 3. `MarkdownField` refactor into a thin orchestrator

Estimated completion: 95-100%

Done
- Shared TypeScript helpers now exist for reference state, dialog logic, availability checks, markdown validation, and safer directive parsing.
- `MarkdownField.svelte` now delegates toolbar UI, content-component dialog UI, link popover UI, editor host shell, lifecycle/bootstrap, draft-asset staging, context/config resolution, toolbar actions, popover behavior, and validation bookkeeping to focused modules/components.
- `MarkdownField.svelte` is now primarily composition, local editor state, top-level effects, and field messaging.

In progress
- Only small orchestration polish remains if the team wants to reduce the Svelte file even further; there is no longer a major architectural seam left to extract for the planned scope.

Remaining
- Optional cleanup only: continue trimming local convenience wrappers if that improves readability, without changing behavior.

### 4. Broken and incomplete marker authoring UX

Estimated completion: 95-100%

Done
- Invalid or incomplete markers can now be preserved as explicit rich-editor nodes with recoverable raw source and salvaged attribute values.
- Broken instances render visibly as invalid instead of silently degrading into plain markdown behavior.
- Clicking a broken component instance can route back into the repair dialog flow.

In progress
- Repair behavior and incomplete-marker handling are now browser-proven in the focused harness, with residual work limited to any new edge cases discovered later.

Remaining
- No known v1 behavior gaps remain; treat future polish as follow-up rather than blocking work.

### 5. Diagnostics alignment across editor, preview, and save

Estimated completion: 90-95%

Done
- Shared validation helpers are now used for markdown component validation rather than duplicating rules locally.
- Save blocking is wired through the form path for invalid markdown component content.
- Unknown and disabled component checks have been moved into shared helpers.

In progress
- Validation emissions and save-blocking behavior are now aligned in the focused authoring flows, with the remaining risk mainly being future regressions rather than missing implementation.

Remaining
- Keep the browser harness and shared validation helpers in sync as new diagnostics are added.

### 6. Test coverage and verification

Estimated completion: 90-95%

Done
- Shared/server-side tests are green for content-component markdown, validation, preview, availability, registry, and mdsvex render-target behavior.
- Additional tests were added around recoverable broken markers and incomplete save-blocking behavior.

In progress
- The focused browser harness is now stable and treated as the main truth source for this feature area.

Remaining
- Expand beyond the focused harness only if broader end-to-end coverage becomes worth the extra maintenance cost.

This plan assumes:

- v1 includes the full planned feature, not just cleanup.
- alpha-phase breakage is acceptable where the new model is cleaner.
- no compatibility layer is added for the current partial reference behavior if it conflicts with the final model.

## Core Model Clarification

The intended core feature is:

- structured content is authored in normal Tentman blocks on the current content item
- markdown stores semantic component directives, not copied structured payloads
- a component attribute marked with `reference: true` stores a primitive token
- a primitive structured source field marked with `referenceFor` declares that it can satisfy that component attribute
- the shared runtime resolves the token back into structured data within the current content item only

This means the reference system is fundamentally about semantic placement of structured content, not about collections specifically. Collections are an important use case, but they do not define the feature boundary.

### Supported Reference Shapes

The shared runtime should treat the following as equally first-class:

1. Primitive top-level field reference
   - Example: `heroToken: "main-hero"` on the current item.
   - `self` resolves to the primitive token value.
   - `container` and `full` both collapse to the current content item because the matched field lives at top level.

2. Sibling structured object reference
   - Example: `gallery.referenceToken: "main"` next to a markdown `body` field on the same content item.
   - `container` resolves to the sibling object that owns the token field.
   - `full` resolves to the full current content item so render mappings can pull sibling data from elsewhere.

3. Nested collection item reference
   - Example: `galleries[].id: "city-sketches"` inside a repeatable structured block.
   - `container` resolves to the matched collection item.
   - `full` resolves to the full current content item.

4. Nested non-collection object reference
   - Example: `seo.openGraph.imageToken` inside a nested object tree.
   - `container` resolves to the nearest structured object that owns the token field.
   - `full` resolves to the full current content item.

These are not edge cases or follow-up extensions. They are the core runtime contract implied by `self`, `container`, and `full`.

### Core Contract vs Authoring Convenience

The core reference contract should stay explicit and stable:

- the source token lives in structured content
- the binding is declared on the source field with `referenceFor`
- the component declares exactly one reference attribute in v1
- the runtime resolves that reference into `{ attributes, data }`

On top of that core contract, the editor may provide convenience affordances:

- picker dialogs for available tokens
- `referenceLabel`-driven option labels
- copied semantic markers from structured item UIs
- hidden reference attributes in dialogs
- defaulted reference attributes when a marker omits them

Those conveniences are useful, but they must not become the definition of the feature. A valid component marker should resolve correctly whether the reference value came from a picker, a copied marker, a hand-authored explicit attribute, or an omitted attribute that is filled by the component default.

### Implications for Theresa-Style Placement

The Theresa-style pattern is a canonical example of the feature, not a special carveout:

- a markdown field places a custom component within prose
- the data source is a sibling structured object on the same content item
- the token field is a primitive leaf such as `gallery.referenceToken`
- preview can resolve `container` to the sibling object
- render can resolve `full` to the full content item and map props from `data.gallery`

If that pattern fails, the bug is in the implementation or coverage, not in the conceptual model or site integration.

## Key Changes

### 1. Make reference placement a real shared content-component subsystem

Move the feature center into `@tentman/core/content-components` and make it the only source of truth for reference-aware behavior.

- Extend component definition normalization to support:
  - `reference: true`
  - `referenceScope` in string and object forms
  - one-reference-attribute-only validation for v1
  - bounded `render` config with mode-specific target/component/prop mapping
- Add shared helpers to expose:
  - the reference attribute for a component
  - normalized preview/render scope for that attribute
  - declarative prop mapping validation limited to `attributes.*` and `data.*`
- Add shared block/content reference indexing that:
  - walks only the current content item
  - collects bindings from `referenceFor`
  - records enough ancestry to resolve `self`, `container`, and `full`
  - treats top-level fields, sibling structured objects, nested non-collection objects, and collection items as equally valid source locations
  - reports duplicate token values per binding as errors instead of silently deduping
- Add shared instance resolution that produces the planned runtime shape:
  - `attributes`
  - `data`
- `data` must resolve as:
  - `self`: matched primitive value
  - `container`: nearest enclosing structured object that owns the matched source field
  - `full`: top-level current content-item structured value only
  - miss: `null`
- Add shared content-component diagnostics for:
  - invalid component schema
  - invalid `referenceFor` targets
  - missing required reference configuration
  - duplicate content tokens for a binding
  - unresolved marker references
  - missing required attributes
  - invalid render mappings

### 2. Unify preview and render around the same resolved context

Stop treating editor preview, markdown display preview, and eventual runtime rendering as separate interpretations.

- Change shared render/preview invocation so both surfaces consume the same resolved context:
  - `attributes`
  - `data`
- Update shared rendering so preview templates receive the resolved context, not just raw attributes.
- Add runtime render mapping support in core so non-preview rendering can map from `attributes.*` and `data.*` into framework props.
- Remove the current drift where:
  - editor node views pass reference-related options one way
  - content display preview transforms use another path
- Keep one shared "resolve instance for surface" pipeline that takes:
  - component definition
  - normalized instance
  - current content item
  - reference index
  - target surface: `preview` or `render`

### 3. Refactor `MarkdownField` into a thin orchestrator

Reduce `MarkdownField.svelte` to composition and local editor state only.

- Keep in `MarkdownField`:
  - rich/markdown tab switching
  - value synchronization
  - draft asset staging hooks
  - top-level error banners
  - composition of child UI pieces
- Extract UI concerns into focused components:
  - toolbar UI
  - content-component dialog
  - link popover
  - editor host wrapper
- Extract plain TypeScript modules for:
  - component availability validation for stored markers
  - reference option lookup from form content context
  - dialog field generation from component schema
  - dialog validation and marker serialization
- The toolbar/dialog layer must consume shared content-component metadata rather than infer policy locally.
- Use explicit typed interfaces instead of raw `Record<string, string>` as the main internal contract where a stronger dialog/runtime shape is available.

### 4. Finish the editor-authoring behavior promised by the plan

Bring the markdown editor behavior up to the original plan instead of stopping at the current partial picker flow.

- Reference attributes in component dialogs must render as pickers sourced from shared reference state for the current content item.
- Picker labels must use explicit `referenceLabel` fields from structured data, falling back only where the shared resolver says to.
- Picker UX is a convenience layer, not a requirement for the underlying runtime contract.
- Valid complete pasted markers should remain immediately usable.
- Markers that rely on component defaults for omitted reference attributes must resolve through the same shared runtime path as explicitly authored markers.
- Recognized incomplete or invalid component markers must stay visible as broken instances, not disappear into raw markdown-only failure.
- Editing a broken instance must reopen the component dialog with recoverable values where possible.
- Markdown fields must surface component-not-enabled and unknown-component errors consistently in both editor and preview paths.

### 5. Enforce strict validation and save blocking at the form/content boundary

Validation must move from "warn in the component" to "block invalid content from saving."

- Introduce a shared markdown content-component validation pass for markdown field values that checks:
  - unknown component names
  - components not enabled on the field
  - missing required attributes
  - unresolved references
  - broken reference tokens
- Integrate those diagnostics into the existing form/content validation flow so save is blocked when markdown contains invalid component instances.
- Surface errors both:
  - inline in markdown editor UI
  - in the broader form submission/validation path
- Keep broken instances visible in preview/editor while still making save impossible until fixed.

## Important API and Type Changes

- `@tentman/core/content-components` public surface should include normalized reference-aware helpers and one shared instance-resolution API for `preview` and `render`.
- `renderContentComponent()` should no longer effectively mean "render template with attributes only"; it should accept or internally derive the full resolved context.
- Component definitions gain real normalized support for:
  - `reference`
  - `referenceScope`
  - `render`
- Shared reference indexing should return:
  - reference index
  - picker options by binding
  - diagnostics
- Shared reference indexing and resolution should not distinguish between collection-backed references and sibling/top-level structured references beyond the normal `container` / `full` ancestry rules.
- Web-side content-component helpers should stop encoding reference behavior independently from core; their job becomes adaptation, not policy.

## Test Plan

Add or update tests to cover the full feature and the refactor boundaries.

- Core unit tests:
  - valid component with one reference attribute and one normal attribute
  - `referenceScope` string form for `self`, `container`, `full`
  - object-form `referenceScope` with different preview/render scopes
  - `referenceFor` single-string and array forms
  - top-level primitive-field resolution
  - sibling structured-object resolution
  - nested non-collection object resolution
  - nested collection-item resolution
  - `container` and `full` collapsing for top-level matches where appropriate
  - explicit marker attribute and defaulted marker attribute both resolving through the same runtime path
  - invalid config for missing component/attribute target in `referenceFor`
  - invalid config for missing `referenceScope`
  - invalid config for more than one reference attribute
  - invalid render mapping outside `attributes.*` / `data.*`
  - duplicate token values for a binding producing hard diagnostics
  - unresolved reference producing `data: null` in preview resolution and validation failure for saved content
- Web unit tests:
  - dialog field generation for reference and non-reference attributes
  - picker options derived from current content item labels
  - availability validation for stored markdown markers
  - broken marker parsing and recovery behavior
- Browser tests:
  - insert referenced component from toolbar
  - edit existing referenced component
  - render a sibling structured-object reference inside the rich editor and keep save enabled when the token resolves
  - render a sibling structured-object reference whose token is supplied by a component default
  - click broken instance and reopen dialog
  - complete pasted marker works immediately
  - incomplete marker stays visibly invalid
  - field with disabled component surfaces error
  - save is blocked while unresolved or invalid component instances exist
- Regression checks:
  - existing non-reference content components still insert, edit, serialize, and preview correctly
  - rich/markdown source-of-truth sync remains intact
  - image staging behavior remains unaffected

## Assumptions and Defaults

- v1 supports exactly one reference attribute per component.
- reference resolution never climbs outside the current content item.
- `full` stops at the current content item's top-level structured value.
- sibling structured objects, top-level structured objects, and collection items are all core supported reference shapes.
- strict validation is required; unresolved references and broken component instances block save.
- current partial reference behavior is not preserved if it conflicts with the cleaner shared runtime.
- `Copy Marker` remains in scope conceptually for the feature, but the implementation priority in this pass is the shared runtime, unified preview/render flow, editor refactor, and save-blocking validation unless existing structured-item UI already has a natural place to add it during this work.
