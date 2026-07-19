# Unify the navigation manifest module

Status: resolved
Type: architecture-improvement
Strength: Strong
Suggested order: Start here
Source report: `/var/folders/l3/0q53d3812t3gvm4ytx3fp2680000gn/T/architecture-review-20260710-222036.html#navigation-manifest`

## Affected files

- `packages/runtime/src/index.js`
- `packages/core/src/manifest.js`
- `apps/web/src/lib/features/content-management/navigation-manifest.ts`

## Problem

Tentman's navigation manifest schema leaks across runtime, core, and web modules with different validation depth.

The report describes manifest schema knowledge crossing three seams:

- runtime has loose items/groups and group lookup logic
- core has reference objects and format/check logic
- web has a typed parser and manual mutations

## Proposed direction

Deepen one browser-safe navigation manifest module. Put schema parsing, reference normalization, serialization, and shared diagnostics behind one interface, then leave package-specific adapters thin.

## Agreed scope

The shared module should own pure navigation manifest semantics:

- `NAVIGATION_MANIFEST_PATH`
- manifest schema types
- parsing and strict structural validation
- reference normalization
- serialization
- collection/group lookup helpers
- shared reference helpers
- pure semantic helpers for diagnostics

It should not own repository I/O, Svelte state, API routes, cache behavior, config discovery, stable-id generation, config-file mutation, item/group workflow orchestration, or web UI behavior.

## Canonical module boundary

The canonical implementation belongs in `@tentman/core`, not a new package. Expose the focused API through an intention-revealing subpath export such as `@tentman/core/navigation-manifest`, while keeping root re-exports where useful for compatibility.

Treat `@tentman/runtime` as optional cleanup territory rather than a design constraint. It currently appears to be an internal workspace package with no observed repo consumers. Keep runtime tests passing only as needed, but do not preserve its current parser shape as an architectural contract.

## Public manifest shape

Expose one canonical parsed manifest shape. Navigation references should be normalized to objects:

```ts
type NavigationReference = {
	id: string;
	label?: string;
	slug?: string;
	href?: string;
};
```

The parser may accept shorthand string references for compatibility, but parsed manifests and newly serialized manifests should use reference objects. Workflow-specific app types may still pass around string ids where that makes UI or mutation code easier to write.

Existing shorthand manifests should be normalized lazily when Tentman next writes them. Do not add a dedicated migration command unless real projects show a need for one.

## Validation invariants

The core parser should be strict about the structure it owns:

- Require `version: 1`.
- If `content` exists, require it to be an object.
- If `content.items` exists, require an array of valid navigation references.
- If `collections` exists, require it to be an object.
- For each collection/group, require arrays where arrays are present.
- Accept reference strings as input and normalize them to `{ id }`.
- Reject empty strings and malformed reference objects.
- Preserve optional reference metadata only when it is a non-empty string.

## Migration slices

Slice 1 should stop after core plus internal core consumers:

- Create the canonical manifest module in `packages/core`.
- Add the dedicated subpath export and type declarations.
- Move/expand parser, serializer, reference, lookup, and helper tests into core.
- Update existing core modules such as diagnostics, nav refresh, nav print, and nav explain to use the canonical helpers.

Slice 2 should migrate `apps/web` to import core parsing/types/helpers, while leaving repository loading, cache behavior, stable-id repair, group mutations, and UI/API workflows in web. Web should produce canonical reference objects for persisted `NavigationManifest` values, but draft/interaction types can keep string ids.

Slice 3 should handle `@tentman/runtime`: either keep it as a thin adapter around core helpers or delete/justify the package in a separate cleanup.

## Test strategy

Put exhaustive manifest contract tests in `packages/core`:

- parser normalization
- strict validation errors
- serialization
- reference helpers
- collection/group lookup
- pure diagnostics helpers

Reduce runtime/web tests to the responsibilities those packages still own:

- runtime: thin delegation or adapter tests while the package exists
- web: repository loading/cache behavior, write flows, stable-id repair, group mutations, API behavior, and UI behavior

Do not keep separate parser edge-case suites in web after core owns parsing.

## ADR and domain notes

Domain glossary:

- `CONTEXT.md`

ADRs created from the grill-with-docs session:

- `docs/adr/0001-own-navigation-manifest-semantics-in-core.md`
- `docs/adr/0002-normalize-navigation-references-to-objects.md`
- `docs/adr/0003-strictly-validate-navigation-manifest-structure.md`
- `docs/adr/0004-demote-runtime-package-from-navigation-manifest-design.md`

## Expected benefits

- Locality: schema bugs concentrate in one module.
- Leverage: one manifest test surface covers the shared behavior.
- Interface shrinkage: fewer package boundaries expose manifest internals.

## Why this is the top recommendation

The review calls this the cleanest deletion-test signal: one domain schema is already copied across runtime, core, and web, so deepening it gives immediate locality and a shared test surface without fighting Svelte UI state or GitHub caching complexity first.

## Grill-with-docs prompt

Use this candidate as the focus for a `grill-with-docs` session. Do not re-run the architecture survey. Grill the scope, invariants, public interface, migration path, tests, and ADR/domain notes needed to turn this into a concrete implementation plan.

## Comments

### Completion audit — 2026-07-13

Navigation Manifest architecture work is complete enough to close this architecture-improvement ticket.

Evidence from the audit:

- Core owns Navigation Manifest parsing, strict validation, normalization, canonical serialization, lookup helpers, and contract tests through `@tentman/core/navigation-manifest`.
- Web repository loading, cache/API state, user-facing invalid-manifest errors, and persistence orchestration remain in web.
- Repository-loaded manifests pass through the core parser.
- Main web write paths funnel persistence through `writeNavigationManifest`, which serializes with the core serializer and emits canonical Navigation Reference objects.
- Commit `6cbacaf` was necessary leftover representation work, not accidental churn: it made web read-state manifest types canonical while preserving shorthand only at input/write boundaries.
- The six implementation tickets under `.scratch/navigation-manifest-module/issues/01-*.md` through `06-*.md` are already marked `resolved`.

Residual polish is tracked separately in `.scratch/navigation-manifest-module/issues/07-polish-navigation-manifest-seams.md` and does not block closing this architecture project.
