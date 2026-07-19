# Deepen the mdsvex directive adapter

Status: needs-triage
Type: architecture-improvement
Strength: Worth exploring
Suggested order: Later
Source report: `/var/folders/l3/0q53d3812t3gvm4ytx3fp2680000gn/T/architecture-review-20260710-222036.html#mdsvex-adapter`

## Affected files

- `packages/mdsvex/src/index.js`
- `packages/mdsvex/src/index.d.ts`
- `packages/mdsvex/src/index.test.js`

## Problem

The external mdsvex module is valuable, but the adapter mixes directive parsing, AST editing, render context, and option validation.

The report also notes that the package interface and implementation options have drifted.

## Proposed direction

Put directive-to-render behavior behind a deeper internal module and make the published interface match the implementation.

The deeper module should own option validation, directive parsing, mdast traversal, Svelte import injection, and render context loading behind a coherent operation interface.

## Expected benefits

- Locality: directive rules concentrate.
- Leverage: fewer integration tests need to cover every internal step.
- Interface stability: type declarations and implementation describe the same contract.

## Grill-with-docs prompt

Use this candidate as the focus for a `grill-with-docs` session. Do not re-run the architecture survey. Grill the published mdsvex contract, internal operation boundary, compatibility risks, fixture strategy, and how to prove the type declaration matches runtime behavior.

## Comments
