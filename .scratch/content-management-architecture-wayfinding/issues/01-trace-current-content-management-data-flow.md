# Trace current content-management data flow

Type: research
Status: resolved
Blocked by: None

## Question

How does content-management data currently flow through Tentman for reads and writes across local folder mode and GitHub-backed mode?

## Evidence that counts as done

- Trace at least these paths in the current code:
  - route load/read path for pages, collection items, collection groups, and Navigation Manifest data
  - user edit path for content, Navigation Manifest ordering/grouping, and collection group mutations
  - persistence path from UI action to local files or GitHub draft branch changes
  - cache/freshness path after a mutation and after a reload
- Identify which modules currently act as UI state, App Core, Domain Core, Content Source adapter, route/API layer, cache layer, and commit/sync layer.
- Produce one or more diagrams as linked markdown assets under this effort, showing both the shared path and the local/GitHub-specific branches.
- Call out any places where the current code has parallel routes to the same outcome, hidden fallback paths, duplicated state, or unclear ownership.

## Resolution should decide

What the current system actually does today, and which specific areas need deeper boundary or regression investigation.

## Answer

Resolved in [Current Content-Management Data Flow](../research/01-current-content-management-data-flow.md).

The current system has App Core-shaped vocabulary but not a clean App Core seam yet. Local folder mode reads and writes mostly through browser stores, local route capabilities, and `LocalRepositoryBackend`; GitHub-backed mode reads through server bootstrap, browser `githubRepositoryCache`, route capabilities, route endpoints, and server repository-data helpers, then writes through draft-branch server actions/endpoints. Navigation Manifest and collection group flows still cross several layers directly.

Specific deeper investigations are already covered by existing follow-up tickets: the intended editing/reload contract, the Navigation Manifest Domain Core boundary, collection group lifecycle divergence, and the final App Core/Content Source boundary decision. No new frontier ticket is needed from this trace.
