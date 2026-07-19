# Decide the App Core and Content Source boundary

Type: grilling
Status: open
Blocked by: 01, 02, 03, 04

## Question

What behavior belongs in App Core, what behavior belongs in Content Source adapters, and what behavior should remain in Domain Core?

## Evidence that counts as done

- Use the current-flow trace, intended editing mental model, Navigation Manifest audit, and collection group lifecycle findings.
- Evaluate at least these boundaries:
  - App Core owns mutation intents/results and source-independent optimistic state; adapters own persistence/cache/commit mechanics.
  - App Core owns only read/workflow assembly; mutation orchestration stays source-specific for now.
  - More behavior graduates into Domain Core because CLI/future surfaces need it.
- Explicitly place commits/sync, cache freshness, reload guarantees, route invalidation, optimistic UI state, and error recovery.
- Evaluate whether the existing `WorkflowMutationIntent` and `WorkflowMutationResult` vocabulary is enough for App Core, should be wrapped by a richer Editing Source state model, or should remain adapter-facing result vocabulary beneath App Core.
- Record any domain terms that crystallise in `CONTEXT.md`, and offer an ADR only if the decision is hard to reverse, surprising, and trade-off driven.

## Resolution should decide

The preferred boundary for edits and collection groups before implementation tickets are written.
