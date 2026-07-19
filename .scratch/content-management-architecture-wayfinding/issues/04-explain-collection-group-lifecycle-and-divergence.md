# Explain collection group lifecycle and divergence

Type: research
Status: resolved
Assignee: Codex
Blocked by: 01, 02

## Question

What is the intended lifecycle of a collection group, and where does the current implementation diverge across local and GitHub-backed modes?

## Evidence that counts as done

- Trace create, rename, reorder, membership change, save, reload, and cache refresh behavior for collection groups.
- Identify the Domain Core semantics, App Core state transitions, route/API calls, Content Source adapter behavior, and cache updates involved.
- Compare local folder mode and GitHub-backed mode for the same lifecycle steps.
- Connect observed bugs or suspicious complexity to concrete ownership or state-flow problems rather than broad architecture complaints.

## Resolution should decide

Which collection group bugs are symptoms of architecture boundary problems, and which are isolated implementation defects.

## Answer

Resolved in [Collection Group Lifecycle and Divergence](../research/04-collection-group-lifecycle-and-divergence.md).

Collection group lifecycle problems are partly isolated defects and partly architecture seam problems. The small direct defects are that new-item create paths in both local and GitHub-backed mode do not sync item group selection into the Navigation Manifest, unlike existing-item edits, and some GitHub inline group-creation/cache patches differ by surface. The broader architecture issue is that collection group editing has no single authoritative App Core interface: config mutation, Navigation Manifest mutation, item membership reconciliation, draft-branch persistence, local refresh, GitHub IndexedDB patching, warm/invalidate behavior, and visible post-save state are spread across UI routes, `navigation-manifest.ts`, GitHub endpoints, local route capabilities, and `githubRepositoryCache`.

This evidence supports fixing tiny defects in place, but favors a strangler-style App Core seam for broader stabilization: callers should submit source-independent collection group/order/membership intents and consume an authoritative mutation result/projection, while local and GitHub Content Source adapters own persistence, commits, cache warming, and freshness.
