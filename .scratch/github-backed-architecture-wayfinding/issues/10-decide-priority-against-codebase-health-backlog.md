# Decide priority against the codebase-health backlog

Type: grilling
Status: resolved
Assignee: Codex
Blocked by: 06, 07, 08, 09, 11

## Question

After the investigation, should GitHub-backed speed and local/GitHub unification outrank the existing codebase-health backlog?

## Evidence that counts as done

- Summarize the user-facing severity of the current GitHub-backed slow workflows from the baseline.
- Summarize the architectural leverage and risk of the selected shared-core/adapter boundary.
- Compare this effort against the current codebase-health candidates, especially route data and pages workspace state.
- State what decision artifact should come next if this outranks the backlog: a spec, revised health issue, new implementation map, or a narrow fix list.
- State what should happen if it does not outrank the backlog: which current issue should proceed first and what evidence should be retained for later.

## Resolution should decide

The priority call and the next planning artifact to create before implementation begins.

## Answer

Decision: GitHub-backed speed and local/GitHub workflow unification should outrank the remaining codebase-health backlog.

This is no longer just an architecture-health preference. The baseline found a desktop/sidebar-present GitHub collection workflow that failed to reach loaded item UI within a 90s wait, while showing `Loading items...`, repeated `/api/repo/config-states` calls around once per second, cache status around `2/450`, and an eventual GitHub tree 404 surfaced as a 500. Compact viewport timings made the same area look merely slow rather than broken, so the severity is tied to the real desktop workflow, not a synthetic worst case. Other workflows add weight: first repository open/config bootstrap is bounded but slow, item edit readiness has both route shell and rich-editor readiness delays, and publish/draft summary took about 8.8s before settle in the baseline. This is user-facing workflow risk, not background code cleanliness.

The architectural leverage is high because the selected boundary turns two existing health candidates into one coherent route/workflow effort. [Decide the shared core boundary](06-decide-shared-core-boundary.md) chose an app-level route/workflow data assembly core, not a shared low-level repository core. [Decide adapter-specific responsibilities](07-decide-adapter-specific-responsibilities.md) then made the risk manageable by keeping GitHub API safety, freshness polling, IndexedDB/cache inventory, draft branches, route transport, and local File System Access/discovery/direct-write behavior adapter-specific. The shared part is the workflow contract and view-model vocabulary that page/editor callers consume.

Against the current health backlog:

- [Unify the navigation manifest module](../../codebase-health/issues/01-unify-navigation-manifest-module.md) was the original top recommendation, but it is already resolved/complete enough in the health backlog. Its residual polish should not block the GitHub-backed speed effort.
- [Deepen repository route data](../../codebase-health/issues/02-deepen-repository-route-data.md) should be promoted from second-tier health work into the first tranche of this effort. The ticket should be revised around route/workflow capabilities, cache-miss route assembly, narrow freshness identity, route-data fallback logging, and the GitHub adapter budget constraints.
- [Collapse the pages workspace state](../../codebase-health/issues/03-collapse-pages-workspace-state.md) should also be included, but after route-data/cache producer boundaries. It is the consumer/state-machine tranche, not the first performance fix and not a place to centralize GitHub cache mechanics.
- [Hide content component reference state](../../codebase-health/issues/04-hide-content-component-reference-state.md), [Deepen the mdsvex directive adapter](../../codebase-health/issues/05-deepen-mdsvex-directive-adapter.md), and [Give the CLI a command runner module](../../codebase-health/issues/06-give-cli-command-runner-module.md) remain later health work. They may improve locality and test clarity, but this map has stronger evidence of a current product workflow failing or feeling slow.

The next artifact after this map should be a new spec, not a revised health issue, implementation map, or narrow fix list.

That spec should synthesize the map decisions into an implementation-ready plan for a GitHub-backed workflow-data speed and unification effort. It should include:

- workflow readiness marks and instrumentation gaps from [Set GitHub speed targets and API safety budgets](11-set-github-speed-targets-and-api-safety-budgets.md)
- cache/freshness guardrails before broad fallback removal
- the revised route-data producer tranche from [Relate Deepen repository route data to this effort](08-relate-deepen-repository-route-data-to-this-effort.md)
- the later pages-workspace consumer tranche from [Relate Collapse the pages workspace state to this effort](09-relate-collapse-pages-workspace-state-to-this-effort.md)
- adapter-specific responsibilities and tests that keep GitHub and local mechanics explicit
- acceptance budgets for first open, collection landing, warm reload, item open/edit, freshness, publish summary, and fallback logging

A revised health issue would be too small because this now spans multiple health candidates and performance guardrails. An implementation map would be premature until the spec locks scope, acceptance criteria, and tranche order. A narrow fix list would underfit the evidence: the stuck collection workflow involves route-data assembly, cache lifecycle, freshness, endpoint fanout, and pages-workspace consumption.

If product priorities later force this effort not to outrank the health backlog, proceed first with [Deepen repository route data](../../codebase-health/issues/02-deepen-repository-route-data.md), not [Collapse the pages workspace state](../../codebase-health/issues/03-collapse-pages-workspace-state.md). Retain this map's baseline timings, desktop/sidebar caveat, cache/freshness loop evidence, GitHub request budgets, adapter-specific responsibility decision, and revised route-data scope as evidence for revisiting GitHub speed later. In that fallback path, route-data work should still avoid becoming generic cleanup: it should preserve the performance-relevant route/cache/fallback findings even if the broader unification effort is deferred.

No new wayfinding tickets are needed. The remaining fog has resolved into a concrete next artifact: a new implementation-ready spec.
