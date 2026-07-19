# Reconcile existing work against the architecture

Type: research
Status: resolved
Assignee: Codex
Blocked by: 01, 02, 03, 04

## Question

Which existing specs/issues still fit the Domain Core/App Core/Content Source architecture, which need revision, and which should be paused or superseded?

## Evidence that counts as done

- Review the GitHub-backed architecture/performance wayfinding map, GitHub-backed speed unification spec, Navigation Manifest module work, codebase-health backlog, and current collection-groups bug work.
- For each relevant artifact, classify it as still valid, needs revision, should pause, or should be superseded.
- Explain any conflict between earlier decisions and current code or current product intent.
- Prefer links to the source artifacts over copying their contents.

## Resolution should decide

How future work should treat the existing backlog so agents stop stacking new plans on top of stale or conflicting ones.

## Answer

Resolved in [Existing Work Reconciliation](../research/05-existing-work-reconciliation.md).

Older artifacts remain useful, but they should not all be treated as current implementation authority. Preserve the completed Domain Core Navigation Manifest work and the GitHub speed/read-workflow capability work. Revise write-side planning that treats the existing `WorkflowMutationIntent`/`WorkflowMutationResult` surface as the final App Core boundary, because it does not yet implement the durable Editing Source contract from the intended editing mental model. Pause broad collection group/navigation editing stabilization until the App Core/Content Source boundary and implementation strategy are decided, while allowing intentionally scoped isolated defects such as new-item group membership sync to be fixed directly.
