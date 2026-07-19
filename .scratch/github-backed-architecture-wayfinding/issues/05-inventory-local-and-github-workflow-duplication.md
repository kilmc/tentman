# Inventory local and GitHub workflow duplication

Type: research
Status: resolved
Blocked by: None

## Question

Where do local mode and GitHub-backed mode duplicate the same content-management behavior, and where are they necessarily different because of browser handles, remote APIs, drafts, or cache mechanics?

## Evidence that counts as done

- Audit the pages workspace path, especially `apps/web/src/routes/pages/+layout.svelte`, for paired local/GitHub state, loading, error, invalidation, navigation editing, config state, collection item, and rescan/cache-clear behavior.
- Compare local bootstrap in `local-content.ts` and `local-repo.ts` with GitHub bootstrap in `repo-config-bootstrap.ts`, `github-repository-cache.ts`, and route loads.
- Compare local and GitHub write paths for navigation manifest changes, collection ordering, item create/edit/delete, previews, and publish/draft-only operations.
- Classify each duplicated behavior as one of:
  - shared workflow logic candidate
  - adapter-specific source/cache behavior
  - UI presentation state
  - compatibility or legacy fallback
- Point to tests that currently encode the duplicate behavior or make it hard to move.

## Resolution should decide

Which duplicated behavior is real domain/workflow duplication worth unifying, and which duplication is acceptable because the two modes have different source, persistence, or browser constraints.

## Answer

Full research note: [Inventory local and GitHub workflow duplication](../research/05-inventory-local-and-github-workflow-duplication.md).

Decision: the duplication worth unifying is workflow-level, not source/cache-level. Tentman should unify pages workspace and editor workflow contracts around shared view models and mutation intents: workspace bootstrap output, collection navigation, config states, page/item view data, navigation editing, collection ordering, group management, content create/edit/delete, post-mutation refresh, and editor recovery/save status.

Keep local and GitHub mechanics adapter-specific. Local mode necessarily owns File System Access handles, permission checks, discovery signatures, browser-local config caching, local block-registry loading, and direct file writes. GitHub mode necessarily owns auth/session state, refs/head/tree/blob identity, managed draft branches and PRs, server actions, route-data fallback APIs, IndexedDB cache inventory, foreground/background warming, freshness checks, and changed-path invalidation.

The preferred boundary for the next ticket should therefore be either a shared route/workflow data assembly core with adapter-specific providers, or a shared pages-workspace state machine fed by local/GitHub providers. Do not prioritize a shared low-level repository source/snapshot/index core as the main unification move; the existing `RepositoryBackend`, content service, and navigation-manifest service already share the reusable low-level domain operations where that is cheap.

No new tickets were added. This resolution unblocks [Decide the shared core boundary](06-decide-shared-core-boundary.md) and gives [Relate Collapse the pages workspace state to this effort](09-relate-collapse-pages-workspace-state-to-this-effort.md) concrete duplication evidence.
