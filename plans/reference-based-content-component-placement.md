# Reference-Based Content Component Placement

## Summary

Implement content components as a semantic markdown placement feature for structured Tentman data. Complex data continues to be authored in structured blocks; markdown components place that data within markdown via stored semantic directives. The feature adds explicit reference wiring between component attributes and source block fields, resolves referenced data for preview and render, supports declarative runtime prop mapping, and treats invalid references/components as hard errors that block save.

This plan assumes alpha-phase freedom to break schema and internal contracts where the new model is cleaner. No backward-compatibility code for older schema variants should be added.

## Key Changes

### 1. Component schema and contracts

Extend `component.json` so component attributes can declare reference-driven behavior while keeping stored values primitive.

- Keep semantic directive storage as the durable source format.
- Keep `attributes` as an object keyed by attribute id.
- Add `reference: true` on supported string-valued attributes.
- Add `referenceScope` on reference attributes.
  - Allow string form: `"self" | "container" | "full"`.
  - Allow object form with both required keys: `{ "preview": ..., "render": ... }`.
- Limit v1 to one reference attribute per component.
- Keep render mapping in `component.json` under a bounded `render` key.
- Render mappings are declarative and string-path-based only.
- Require runtime target config to include an import path and component name.
- Allow runtime prop mappings to read from `attributes.*` and `data.*`.

Recommended v1 component shape:

```json
{
	"id": "gallery-embed",
	"name": "gallery-embed",
	"kind": "block",
	"attributes": {
		"galleryId": {
			"type": "string",
			"reference": true,
			"referenceScope": {
				"preview": "container",
				"render": "container"
			},
			"required": true
		},
		"variant": {
			"type": "enum",
			"default": "default",
			"options": ["default", "compact"]
		}
	},
	"render": {
		"mdsvex": {
			"from": "$lib/components/GalleryEmbed.svelte",
			"component": "GalleryEmbed",
			"props": {
				"images": "data.images",
				"title": "data.title",
				"variant": "attributes.variant"
			}
		}
	}
}
```

### 2. Block schema and reference sources

Extend block field config so source fields explicitly declare which component attributes they can satisfy.

- Add `referenceFor` on primitive string-valued source fields.
- Accept either a single qualified id or an array of qualified ids.
- Qualified form uses `component-id:attributeId`.
- `referenceFor` implies uniqueness of actual stored values for that binding within the current content item.
- Keep source declaration on the exact leaf field that stores the token, never on container blocks.
- Add an explicit label field for referenceable items so pickers and actions do not rely on fragile heuristics.

Recommended v1 source-field shape:

```json
{
	"id": "id",
	"type": "text",
	"label": "Gallery ID",
	"referenceFor": ["gallery-embed:galleryId", "lightbox:galleryId"],
	"required": true
}
```

### 3. Resolution model

Resolve references against the current content item only.

- Never climb above the current content item.
- `full` caps at the top-level `blocks`-shaped value for the current content item.
- `container` returns the nearest enclosing structured object that contains the matched source field.
- `self` returns the matched source value.
- Use the same reference system for preview and render, with per-surface scope chosen from `referenceScope`.
- For v1, a component resolves exactly one reference attribute into one `data` value.

Preview and render both receive the same top-level context shape:

```json
{
	"attributes": {
		"galleryId": "main-gallery",
		"variant": "compact"
	},
	"data": {
		"...": "scope-dependent result"
	}
}
```

Behavior of `data`:

- `self`: primitive matched value
- `container`: nearest enclosing structured object
- `full`: full current content-item structured value
- resolution miss: `null`

### 4. Preview and runtime rendering

Keep preview lightweight and runtime structured.

- `preview.njk` receives `attributes` and `data`.
- Do not inject extra ancestry/debug metadata into preview context.
- Do not pass synthetic summary abstractions; pass the actual resolved value for the chosen scope.
- Runtime render mappings use the same `attributes` and `data` contract as preview.
- Do not generate framework markup via ad hoc JS template strings.
- Runtime adapters should map semantic component context into framework-native component invocation with declarative prop mappings.

### 5. Editor and authoring UX

Ship v1 with placement-first flows and defer richer insertion ergonomics.

- Markdown editor component insertion remains the primary flow.
- If a component has a reference attribute, the component dialog should show a picker sourced from matching `referenceFor` fields.
- Picker entries should use an explicit configured label field for readability.
- Structured items should expose `Copy Marker`.
- `Copy Marker` copies the full semantic directive, including all already-specified attributes.
- Pasting a complete valid marker should work immediately.
- Pasting a recognized but incomplete marker should open the component dialog.
- If the user closes the dialog without fixing required fields, preserve the marker/component in a visibly invalid state.
- Defer `Insert at Cursor` from structured item panels to a later phase.

### 6. Validation and save policy

Use strict validation and block save on errors.

Config validation must fail when:

- `referenceFor` points to a missing component.
- `referenceFor` points to a missing attribute.
- `referenceFor` points to an attribute without `reference: true`.
- `reference: true` is missing `referenceScope`.
- object-form `referenceScope` is missing `preview` or `render`.
- `referenceFor` is used on an unsupported source field type.
- a component declares more than one reference attribute in v1.
- render mappings use invalid top-level roots outside `attributes.*` / `data.*`.

Content/reference validation must fail when:

- duplicate source values exist for the same `referenceFor` binding within the current content item.
- a stored marker refers to a token that does not resolve.
- a component instance is missing required attributes.
- a markdown field uses a component not enabled on that field.

UI behavior for broken states:

- show broken/incomplete instances as visible error-state components, not silent raw failures.
- editing a broken instance should reopen the component dialog.
- preview should preserve the underlying semantic marker and surface the error.
- save should be blocked while invalid component instances or unresolved references exist.

CLI and app behavior:

- CLI validation reports schema/config/reference errors directly.
- The web app should surface broken component/config states prominently, including in markdown preview/editor UI, with a strong visual error treatment.

## Tests and Scenarios

Cover at least these cases:

- Valid component with one reference attribute and one normal attribute.
- `referenceScope` string form for `self`, `container`, and `full`.
- `referenceScope` object form with different preview/render scopes.
- `referenceFor` single string and array forms.
- Resolution from top-level structured object and nested collection item.
- `container` and `full` collapsing to the same value on top-level references.
- Runtime prop mapping from both `attributes.*` and `data.*`.
- Preview receiving `data: null` on resolution miss.
- Duplicate content token values for the same `referenceFor` causing validation failure.
- Missing component/attribute target in `referenceFor`.
- Pasting a complete copied marker.
- Pasting an incomplete marker and reopening dialog.
- Broken marker remaining visibly invalid and blocking save.
- Markdown field containing a component not enabled for that field.
- `full` never returning collection-wide or project-wide data outside the current content item.

## Assumptions and Defaults

- No backward compatibility is required for old content-component schema shapes.
- v1 supports one reference attribute per component.
- `referenceFor`-driven uniqueness is implicit; no separate `unique` flag is added for this feature.
- `full` always stops at the current content item’s top-level `blocks` data.
- Render mappings remain declarative string paths in v1.
- `Copy Marker` is in scope for v1; `Insert at Cursor` is not.
- Explicit label metadata will be added for referenceable items rather than relying on Tentman
