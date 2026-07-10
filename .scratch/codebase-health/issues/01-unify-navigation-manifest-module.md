# Unify the navigation manifest module

Status: needs-triage
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

## Expected benefits

- Locality: schema bugs concentrate in one module.
- Leverage: one manifest test surface covers the shared behavior.
- Interface shrinkage: fewer package boundaries expose manifest internals.

## Why this is the top recommendation

The review calls this the cleanest deletion-test signal: one domain schema is already copied across runtime, core, and web, so deepening it gives immediate locality and a shared test surface without fighting Svelte UI state or GitHub caching complexity first.

## Grill-with-docs prompt

Use this candidate as the focus for a `grill-with-docs` session. Do not re-run the architecture survey. Grill the scope, invariants, public interface, migration path, tests, and ADR/domain notes needed to turn this into a concrete implementation plan.

## Comments
