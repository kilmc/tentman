# Attribute GitHub API and request fanout cost

Type: research
Status: resolved
Blocked by: 01

## Question

For the slow workflows identified by [Baseline current GitHub workflow performance](01-baseline-current-github-workflow-performance.md), how much of the cost is GitHub API latency, request count, duplicate request fanout, or GitHub-specific API choice?

## Evidence that counts as done

- For each slow workflow, list the API endpoints/routes hit by the browser and the GitHub operations triggered underneath.
- Use `apps/web/src/lib/repository/github.ts` request stats and server timing logs where available, and identify gaps where instrumentation cannot currently attribute cost.
- Distinguish GitHub Contents API reads from Git Data API tree/blob/ref/commit operations.
- Identify repeated reads of the same root config, tree, config files, navigation manifest, blob, block support, draft comparison, or item document within a single workflow.
- Compare request fanout against what should be theoretically necessary from the available tree/blob identities.

## Resolution should decide

Whether GitHub API usage itself is the dominant bottleneck, and which specific request patterns must be preserved, eliminated, batched, moved to cache, or left adapter-specific.

## Answer

Full research note: [Attribute GitHub API and request fanout cost](../research/02-attribute-github-api-and-request-fanout-cost.md).

Decision: GitHub API latency is a real floor, especially for recursive tree loads and visible projection blob batches, but it is not the dominant architecture problem by itself. The bigger bottleneck is request fanout and route/cache coordination inside Tentman: bootstrap/freshness/config-state routes can reload snapshot context, collection landing can repeat projection hydration even when identities should make it cacheable, and publish/item routes sometimes broaden a narrow workflow into block support, navigation, config states, or fallback document reads.

Preserve:

- Git Data API branch/commit/tree/blob reads for GitHub mode.
- Recursive tree snapshots as the basis for directory collection indexes.
- Blob-SHA-keyed projection and document identity.
- Compare-commits draft scoping for publish and draft status.
- Contents API writes and simple path operations as GitHub-adapter-specific mechanics.

Eliminate or contain:

- Repeated `/api/repo/configs` and `/api/repo/config-states` bootstrap-style work for unchanged ref/tree identity.
- Warm-reload projection calls for `blobSha + schemaIdentity` records already held in IndexedDB.
- Duplicate collection index/navigation assembly between route loaders and layout cache warming.
- Publish/review fallbacks that rediscover configs or fetch whole content documents when changed-file scope is sufficient.

Instrumentation gap: `github.repository.request` stats currently cover generic repository backend methods, but the newer GitHub source layer calls Octokit directly for `repos.getBranch`, `git.getCommit`, `git.getTree`, and `git.getBlob`. The existing route timing logs and `repository-data.github-blob.load` logs are enough for this decision, but not enough for exact per-workflow request accounting without a browser fetch trace or source-layer request stats.

No new tickets were added. The follow-up work is already represented by [Explain cache lifecycle and staleness cost](03-explain-cache-lifecycle-and-staleness-cost.md) and [Trace route data assembly and legacy fallbacks](04-trace-route-data-assembly-and-legacy-fallbacks.md).
