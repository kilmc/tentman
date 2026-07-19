# Decide adapter-specific responsibilities

Type: grilling
Status: resolved
Blocked by: 06

## Question

Given the selected shared-core boundary from [Decide the shared core boundary](06-decide-shared-core-boundary.md), what must remain adapter-specific for local folder mode and GitHub-backed mode?

## Evidence that counts as done

- Identify responsibilities that should remain GitHub-specific, including API choice, auth/session handling, branch/ref identity, draft branch behavior, request batching, freshness polling, IndexedDB persistence, and GitHub cache inventory.
- Identify responsibilities that should remain local-specific, including File System Access handles, persisted local discovery signatures, local rescan, local preview URL, local block package limitations, and browser-only reads/writes.
- Identify responsibilities that should be shared only as contracts or test fixtures rather than shared runtime code.
- State where the adapter seam should live in the current package/module layout.

## Resolution should decide

The adapter contract shape that prevents local and GitHub mode from drifting while keeping unavoidable mode-specific behavior explicit.

## Answer

Decision: keep the adapter seam explicit at the app-level route/workflow capability layer. The shared module should define view-model contracts and workflow capabilities that pages/editor callers consume; local and GitHub adapters should own source access, cache lifecycle, persistence, freshness, route transport, and mutation mechanics.

The contract should be capability-shaped, not repository-shaped. A caller should ask for workspace bootstrap data, collection navigation, config states, page view data, item view data, block-support readiness, freshness status, and post-mutation refresh effects. It should not ask for a Git tree, blob SHA batch, IndexedDB record, File System Access handle, Octokit client, draft branch, or legacy `content-cache` fallback. Those are adapter implementation details.

GitHub-specific responsibilities:

- API choice and request batching stay GitHub-specific. GitHub mode should continue to choose Git Data API reads for branch/commit/tree/blob identity, Contents API path operations where useful for writes/simple reads, and compare-commits for draft scope. The shared contract may say "hydrate these missing route records" or "return this page/item view"; the GitHub adapter decides whether that becomes one collection-index request, a projection blob batch, an item document miss, a block-support miss, or a server route fallback.
- Request batching, concurrency, inflight dedupe, retry/backoff, queue priority, and visible-versus-background warming are GitHub adapter safety concerns. They are tied to GitHub latency and rate-limit risk, so they should live with `githubRepositoryCache`, GitHub route endpoints, and server `repository-data` helpers, not inside a shared local/GitHub core.
- Freshness polling stays GitHub-specific. The scheduler, 5/15/30/60 minute backoff, `previousRef`/`previousHeadSha`/`previousTreeSha` protocol, changed-path derivation, draft/main identity comparison, deleted-ref/tree 404 handling, and path invalidation are all GitHub mechanics. The shared contract should only expose a small freshness result such as unchanged, changed paths, stale, error, or last-checked status.
- Cache inventory and IndexedDB persistence stay GitHub-specific. Stores for snapshots, collection indexes, projections, documents, singleton documents, block support, and inventory records; schema versioning; cache clear; full-document budget limits; status counts; foreground/idle warming; and cache page/debug surfaces belong to the GitHub adapter.
- Branch/ref/blob identity stays GitHub-specific as mechanics. `headSha`, `treeSha`, blob SHA, schema identity, base/draft identities, and compare metadata are essential for GitHub correctness and speed, but callers should receive opaque route-data identities and changed-path outcomes rather than manipulate those low-level identities directly.
- Managed draft branch behavior stays GitHub-specific. Draft branch creation, PR lifecycle, publish/discard, draft status, compare caches, branch-specific backend creation, cache invalidation after server actions, and asset fallback between draft/default refs are not local-mode concerns.
- Auth/session and SvelteKit route transport stay GitHub-specific or route-edge-specific. GitHub auth redirects, session repository selection, server-only Octokit access, `depends`, invalidation, load timing, and endpoint status handling should wrap the adapter; they should not become shared runtime logic.

Local-specific responsibilities:

- File System Access handles, permission prompts, `.git` validation, handle persistence in IndexedDB, and browser-only direct reads/writes stay local-specific.
- Local discovery signatures, discovery-cache invalidation, local config-cache persistence in `localStorage`, content-component registry clearing, local rescan/remount behavior, and local block-registry loading stay local-specific.
- The local block package limitation stays local-specific: package-distributed blocks are currently unsupported in browser-backed local mode, while GitHub/server mode can load server-side package blocks.
- Local preview URL resolution stays local-specific. It is a root-config/browser setting, not part of GitHub route-data freshness.
- Local mutation mechanics stay local-specific. Local saves write directly through the browser `RepositoryBackend`, refresh local content, clear staged/recovery state, and do not create draft branches, PRs, publish/discard state, or server-side compare caches.
- Local mode should not inherit GitHub polling, GitHub cache inventory, GitHub request queueing, or route fallback APIs. It can satisfy the same workflow contract from local stores and direct browser repository reads.

Shared only as contracts or fixtures:

- Shared runtime code should cover stable content-management view models: workspace bootstrap output, normalized collection navigation, config-state maps, page/item view payloads, block-support capability/status, navigation manifest state, instruction discovery summaries, preview URL shape, adapter status, and user-facing error/status categories.
- Shared runtime code may define mutation intents later, but writes should remain out of the first read-route boundary. When writes are added, the shared part should be intent/result shape: save content, create item, delete item, save navigation manifest/order/groups, changed paths, redirect target, recovery cleanup signal, and refresh instruction.
- Shared contracts should include an opaque identity/freshness vocabulary. They can name concepts like active workspace identity, route-data identity, changed paths, and stale/fresh/error states, but they should not expose GitHub-only `headSha`/`treeSha`/blob batching as caller obligations.
- Shared test fixtures should cover mode-neutral outputs: sample configs/root config/navigation manifest, collection navigation results, singleton/item page views, config-state maps, block-support statuses, changed-path examples, cache-miss result shapes, and mutation result fixtures. These fixtures should let page/layout tests assert the common workflow once while adapter tests separately exercise GitHub cache/freshness/draft behavior and local handle/discovery behavior.
- Do not share runtime implementations for cache inventory, IndexedDB schemas, request queues, freshness polling, draft branch lifecycle, local discovery signatures, local rescan, local handle persistence, or server route fallback ordering. Those can have fixtures and contract tests, but they should remain adapter code.

Adapter seam placement:

- Put the external seam inside `apps/web`, near the existing content-management feature modules, for example under `apps/web/src/lib/features/content-management/workflow-data/` or an equivalent app-level route/workflow module. Do not put it in `@tentman/core` and do not make it a lower-level `RepositoryBackend` replacement.
- The seam should sit between pages routes/components and mode-specific workflow adapters. `apps/web/src/routes/pages/+layout.svelte`, page/item route loaders, and editor surfaces should consume the shared capability/view-model interface. Local and GitHub adapters should compose the existing stores/endpoints underneath.
- The local adapter should compose `apps/web/src/lib/stores/local-repo.ts`, `apps/web/src/lib/stores/local-content.ts`, the local `RepositoryBackend`, and shared content/navigation domain functions.
- The GitHub browser adapter should compose `apps/web/src/lib/stores/github-repository-cache.ts`, cache-miss endpoints such as collection index/projections/page-view/item-view/config-states/form-config, and the SvelteKit fetch/invalidation edge. The GitHub server adapter/protocol should continue to compose `apps/web/src/lib/server/repository-data/`, `apps/web/src/lib/server/repo-config-bootstrap.ts`, GitHub auth, and draft/publish helpers.
- SvelteKit mechanics remain at the route edge. Redirects, `depends`, invalidation, route params, and endpoint HTTP status handling should be wrappers around the adapter, not part of the shared core's interface.

This shape prevents drift because the page/editor layer has one workflow vocabulary, but it keeps the speed-critical and API-safety-critical GitHub machinery local to the GitHub adapter where it can be budgeted, batched, and rate-limit-aware.
