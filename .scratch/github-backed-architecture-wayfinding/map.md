# GitHub-backed architecture and performance wayfinding

## Destination

Reach an evidence-backed decision about whether Tentman should prioritize GitHub-backed speed and local/GitHub unification work, and what architecture boundary should guide that work if it is prioritized.

The map is complete when we know the current GitHub bottlenecks, the workflows they affect, what behavior belongs in a shared core, what must remain adapter-specific, and how this effort ranks against the existing codebase-health backlog.

## Notes

- Main repo: `/Users/kilmc/code/tentman/tentman`.
- Do not implement product changes while resolving this map unless a ticket explicitly says the work is instrumentation-only evidence gathering.
- Treat local folder mode and GitHub-backed mode as two delivery modes for the same content-management workflows, but do not assume they need identical caching, transport, or persistence mechanics.
- Relevant existing backlog:
  - [Deepen repository route data](../codebase-health/issues/02-deepen-repository-route-data.md)
  - [Collapse the pages workspace state](../codebase-health/issues/03-collapse-pages-workspace-state.md)
  - [Codebase Health Architecture Review](../codebase-health/spec.md)
- Initial code orientation:
  - Low-level repository adapters live in `apps/web/src/lib/repository/`.
  - Server snapshot/index helpers live in `apps/web/src/lib/server/repository-data/`.
  - GitHub browser cache orchestration lives in `apps/web/src/lib/stores/github-repository-cache.ts`.
  - Local browser repository state lives in `apps/web/src/lib/stores/local-content.ts` and `apps/web/src/lib/stores/local-repo.ts`.
  - The pages workspace composition point is `apps/web/src/routes/pages/+layout.svelte`.
- Useful follow-up skills while resolving tickets: `diagnosing-bugs` for performance diagnosis, `codebase-design` for the shared-core boundary, and `domain-modeling` if workflow terminology starts drifting.

## Decisions so far

- [Baseline current GitHub workflow performance](issues/01-baseline-current-github-workflow-performance.md) — Desktop/sidebar-present GitHub collection loading and freshness/cache coordination are slow enough to drive architecture; compact viewport timings understate the problem.
- [Attribute GitHub API and request fanout cost](issues/02-attribute-github-api-and-request-fanout-cost.md) — Preserve Git Data tree/blob identity reads, but treat Tentman request fanout and cache/route coordination as the dominant bottleneck over raw GitHub API choice.
- [Explain cache lifecycle and staleness cost](issues/03-explain-cache-lifecycle-and-staleness-cost.md) — Prioritize cache lifecycle/coherency and narrow server/client route-data boundaries before broader fallback removal.
- [Trace route-data assembly and legacy fallbacks](issues/04-trace-route-data-assembly-and-legacy-fallbacks.md) — Keep deep repository-data primitives, but put route-view assembly and browser-cache endpoint orchestration on the critical path for GitHub speed/unification.
- [Inventory local and GitHub workflow duplication](issues/05-inventory-local-and-github-workflow-duplication.md) — Unify pages/editor workflow contracts and route-view assembly, while keeping local browser handles and GitHub draft/cache/source mechanics adapter-specific.
- [Decide the shared core boundary](issues/06-decide-shared-core-boundary.md) — Use an app-level route/workflow data assembly core with adapter-specific source, cache, persistence, and route mechanics.
- [Decide adapter-specific responsibilities](issues/07-decide-adapter-specific-responsibilities.md) — Keep GitHub API safety, freshness, cache, IndexedDB, identity, and draft mechanics adapter-specific; keep local browser handles/discovery/direct writes local-specific; share only workflow contracts and fixtures.
- [Relate Deepen repository route data to this effort](issues/08-relate-deepen-repository-route-data-to-this-effort.md) — Revise and promote route-data deepening as the GitHub effort's route-read/cache-miss tranche, sequenced after cache/freshness guardrails and before pages-workspace collapse.
- [Relate Collapse the pages workspace state to this effort](issues/09-relate-collapse-pages-workspace-state-to-this-effort.md) — Revise and include pages-workspace collapse as the consumer/state-machine tranche after route-data/cache boundaries, while keeping source/cache mechanics adapter-specific.
- [Set GitHub speed targets and API safety budgets](issues/11-set-github-speed-targets-and-api-safety-budgets.md) — Constrain the spec with workflow readiness targets, foreground/background GitHub request budgets, rate-limit safety, warming limits, and required instrumentation.
- [Decide priority against the codebase-health backlog](issues/10-decide-priority-against-codebase-health-backlog.md) — Promote GitHub-backed speed/unification above the remaining health backlog and create a new implementation-ready spec next.

## Not yet specified

None. The next artifact is a new implementation-ready spec.

## Out of scope

- Implementing the GitHub speed/unification architecture.
- Reworking unrelated codebase-health candidates beyond comparing priority.
- Work in `/Users/kilmc/code/tentman/test-app` unless a later ticket explicitly asks for test-app evidence.
- Re-running the broad architecture review that produced `.scratch/codebase-health/spec.md`.
