# Hide content component reference state

Status: needs-triage
Type: architecture-improvement
Strength: Worth exploring
Suggested order: Later
Source report: `/var/folders/l3/0q53d3812t3gvm4ytx3fp2680000gn/T/architecture-review-20260710-222036.html#content-component-references`

## Affected files

- `packages/core/src/content-components.js`
- `packages/core/src/content-component-reference-validation.js`
- `apps/web/src/lib/content-components/references.ts`

## Problem

The current reference index has leverage, but its nested map interface exposes too much implementation shape to callers and tests.

The report calls out callers and tests knowing details such as `Map<binding, Map<token, entry>>`, binding, token, self, container, and full reference shape.

## Proposed direction

Keep traversal and storage internal to a deeper content component reference module. Expose behavior rather than the nested map.

The deeper module should keep block traversal, marker bindings, selector bindings, duplicate detection, and option listing internal.

## Expected benefits

- Locality: reference bugs concentrate.
- Leverage: one traversal implementation serves core validation, web field options, and mdsvex usage.
- Test clarity: callers stop inspecting internal storage shape.

## Grill-with-docs prompt

Use this candidate as the focus for a `grill-with-docs` session. Do not re-run the architecture survey. Grill the behaviors callers actually need, the public query interface, duplicate-detection semantics, and how tests should assert behavior instead of map shape.

## Comments
