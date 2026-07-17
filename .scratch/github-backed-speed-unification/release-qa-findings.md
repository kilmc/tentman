# GitHub-backed speed unification release QA findings

Status: review findings captured for follow-up
Branch reviewed: `performance-improvement`
Fixed point: `origin/main`
Merge base: `1237a606e17aa6e9421a68e9e7635fdd4f38a32d`
Diff command: `git diff origin/main...HEAD`
Review date: 2026-07-17

## Context

This file preserves the release-candidate QA findings for the GitHub-backed speed and local/GitHub workflow unification effort before follow-up implementation begins.

Inputs used:

- `.scratch/github-backed-speed-unification/qa.md`
- `.scratch/github-backed-speed-unification-spec.md`
- Completed branch-wide `/code-review` summary: "Spec axis has 5 P1 findings; Standards axis has 2 boundary findings. Worst spec issue is background/cache work bypassing the queue/idle/rate-limit promises; worst standards issue is page/editor callers still depending on GitHub cache mechanics."
- Existing captured code-review findings in this file before reorganization.

Manual QA note status: user observations were added on 2026-07-17. The main observed gap is that app navigation feels faster, but cache progress can jump quickly and then appear stalled for minutes with no visible explanation.

Primary review axes:

- **Spec fit:** workflow targets, API budgets, acceptance criteria, shared workflow-data boundary, GitHub-specific responsibilities, and local-specific responsibilities.
- **Standards fit:** app-level workflow capability boundary stays deep and clear, without leaking GitHub tree/blob/ref/IndexedDB/draft mechanics into page/editor callers or forcing local mode through GitHub-shaped behavior.

No P0 data-loss/auth/publish-corruption issue was found in static review. The five P1 findings below should still be treated as release-blocking for this branch's stated acceptance criteria.

## 1. Release-blocking findings

### P1. Background projection hydration bypasses queue, idle, and cancellation controls

Why it blocks release:

The spec promises foreground work always outranks background work, background warming begins only after route readiness and idle conditions, and warming pauses on navigation, identity changes, foreground misses, rate-limit pressure, and visible errors. The implementation schedules remaining projection hydration directly, so it can compete with active navigation and bypass the cache task priority/cancellation model.

Key references:

- `apps/web/src/lib/features/content-management/pages-workspace-adapters.ts:401` schedules remaining projection hydration with `globalThis.setTimeout(..., 0)`.
- `apps/web/src/lib/features/content-management/pages-workspace-adapters.ts:403` calls `githubRepositoryCache.warmCollection(...)` from that timer.
- `apps/web/src/lib/stores/github-repository-cache.ts:2708` starts a direct `hydrateRemaining` loop.
- `apps/web/src/lib/stores/github-repository-cache.ts:2714` calls `hydrateProjectionBatch(...)` directly instead of enqueueing behind queue/idle controls.

Needed regression coverage:

- Desktop collection landing marks visible readiness before any remaining projection hydration runs.
- Remaining projection hydration runs through the cache queue, not a direct loop.
- A foreground item route request preempts queued background hydration.
- Remaining hydration is canceled or ignored after `siteWarmRunId` changes.

### P1. Draft-branch unchanged freshness performs an unnecessary main-ref identity read

Why it blocks release:

The unchanged freshness budget is identity-only and active-ref only. With a managed draft branch present, the code still resolves main-branch identity even though the unchanged decision does not use it. That adds repeated GitHub branch/commit work to the path the spec was trying to make cheap.

Key references:

- `apps/web/src/lib/server/repo-config-bootstrap.ts:206` loads repository context and draft branch.
- `apps/web/src/lib/server/repo-config-bootstrap.ts:207` creates `mainBackend` when `draftBranch` is present.
- `apps/web/src/lib/server/repo-config-bootstrap.ts:208` runs `getRepositoryRefIdentity(mainBackend)` in parallel whenever `draftBranch` exists.
- `apps/web/src/lib/server/repo-config-bootstrap.ts:213` sets `mainIdentityUnchanged` to `true` for draft branches, so the main identity read is not needed for unchanged freshness.
- `apps/web/src/lib/server/api-repo-freshness.spec.ts:112` only covers the unchanged path with `draftBranch: null`.

Needed regression coverage:

- Add an unchanged freshness test with `draftBranch: 'tentman-preview'`.
- Assert exactly one branch identity read and one commit identity read for the active draft ref.
- Assert no main/default branch identity call happens when the active draft identity matches the previous freshness identity.

### P1. Rate-limit safety records signals but does not enforce stop/pause behavior

Why it blocks release:

The branch records rate-limit headers and retries some failures, but the spec requires these signals to actively stop background warming and constrain retries. Without enforcement, background/cache work can still create the GitHub API pressure this effort is meant to prevent.

Key references:

- `apps/web/src/lib/repository/github.ts:128` records GitHub request stats.
- `apps/web/src/lib/repository/github.ts:155` stores `lastRateLimit`.
- `apps/web/src/lib/repository/github.ts:292` captures rate-limit headers for successful repository-backend requests.
- `apps/web/src/lib/repository/github.ts:311` captures rate-limit headers for failed repository-backend requests.
- `apps/web/src/lib/stores/github-repository-cache.ts:1186` retries 429, 408, and 5xx, but not 403.
- `apps/web/src/lib/stores/github-repository-cache.ts:1212` does not consult remaining quota or secondary-limit signals.
- `apps/web/src/lib/stores/github-repository-cache.svelte.spec.ts:2165` covers retrying 429 only.

Needed regression coverage:

- Background/passive request with `x-ratelimit-remaining: 499` pauses passive warming while foreground work remains possible.
- 403 secondary-rate-limit or abuse-style response with `retry-after` stops background work and respects retry-after.
- Foreground retries for GitHub 403, 429, and 5xx use capped backoff and visible failure states.

### P1. Page loaders still coordinate GitHub cache mechanics directly

Why it blocks release:

The selected boundary says page/editor callers should ask for app-level workflow capabilities, not GitHub cache mechanics, IndexedDB-backed route loaders, or endpoint details. Several route loaders still import and coordinate `githubRepositoryCache` directly. This is both a spec miss and the worst standards-axis boundary issue.

Key references:

- `apps/web/src/routes/pages/[page]/+page.ts:6` imports `githubRepositoryCache`.
- `apps/web/src/routes/pages/[page]/+page.ts:37` and `:97` call `hydrateFromBootstrap(...)`.
- `apps/web/src/routes/pages/[page]/+page.ts:41` calls `loadCollectionNavigationWorkflowData(...)`.
- `apps/web/src/routes/pages/[page]/+page.ts:101` calls `loadPageViewWorkflowData(...)`.
- `apps/web/src/routes/pages/[page]/[itemId]/+page.ts:5` imports `githubRepositoryCache`.
- `apps/web/src/routes/pages/[page]/[itemId]/+page.ts:81` calls `hydrateFromBootstrap(...)`.
- `apps/web/src/routes/pages/[page]/[itemId]/+page.ts:88` calls `loadItemViewWorkflowData(...)`.
- `apps/web/src/routes/pages/[page]/[itemId]/edit/+page.ts:6` imports `githubRepositoryCache`.
- `apps/web/src/routes/pages/[page]/[itemId]/edit/+page.ts:86` calls `hydrateFromBootstrap(...)`.
- `apps/web/src/routes/pages/[page]/[itemId]/edit/+page.ts:93` calls `loadItemViewWorkflowData(...)`.

Needed regression coverage:

- Page route loaders consume a workflow route capability module rather than importing `githubRepositoryCache`.
- Capability wrapper returns the same page/item/collection workflow payloads while hiding cache hydration and cache-miss implementation.
- Existing budget tests stay intact but assert through the capability surface.

### P1. Local route workflow data is still assembled inside page/editor components

Why it blocks release:

Local mode should satisfy the same workflow vocabulary while keeping File System Access handles, discovery signatures, direct reads/writes, preview URL resolution, rescan/remount, and recovery local-specific. Some local page/editor components still coordinate `localRepo`, `localContent`, content fetches, and workflow view-data creation directly.

Key references:

- `apps/web/src/routes/pages/[page]/edit/+page.svelte:20` imports `localContent`.
- `apps/web/src/routes/pages/[page]/edit/+page.svelte:21` imports `localRepo`.
- `apps/web/src/routes/pages/[page]/edit/+page.svelte:23` imports `fetchContentDocument`.
- `apps/web/src/routes/pages/[page]/edit/+page.svelte:39` imports `createLocalWorkflowPageViewData`.
- `apps/web/src/routes/pages/[page]/edit/+page.svelte:229`, `:243`, `:277`, and `:288` perform local loading/refresh/document fetch/workflow assembly in component state.
- `apps/web/src/routes/pages/[page]/[itemId]/edit/+page.svelte:34` imports `localContent`.
- `apps/web/src/routes/pages/[page]/[itemId]/edit/+page.svelte:35` imports `localRepo`.
- `apps/web/src/routes/pages/[page]/[itemId]/edit/+page.svelte:38` imports `fetchContentDocument`.
- `apps/web/src/routes/pages/[page]/[itemId]/edit/+page.svelte:71` imports `createLocalWorkflowItemViewData`.
- `apps/web/src/routes/pages/[page]/[itemId]/edit/+page.svelte:313`, `:328`, `:363`, and `:377` perform local loading/refresh/document fetch/workflow assembly in component state.

Needed regression coverage:

- Page edit and item edit use a local route-workflow adapter/capability that returns workflow data without component-level `localRepo`/`localContent` access.
- Boundary test confirms local edit components no longer import `localRepo`, `localContent`, or `createLocalWorkflow*Data` directly.
- Existing local recovery/direct-write behavior remains covered at the capability boundary.

## 2. Performance/speed questions needing diagnosis

These are the questions the next diagnosis/QA session should answer with traces, request counts, and readiness marks before or alongside fixes.

- Does desktop/sidebar-present GitHub `/pages/news` against a Theresa-sized repository still ever remain on `Loading items...` after collection index and visible projections return?
- On first repository open, are `/api/repo/configs` or `/api/repo/config-states` repeated after bootstrap, especially during freshness?
- During cold desktop collection landing, is foreground work limited to one collection-index call and one visible projection batch capped at 30 blob SHAs?
- On warm collection reload with matching identities, are foreground GitHub index/projection/blob calls truly zero, and are miss reasons explicit when not?
- Does remaining projection hydration start only after route readiness and an idle gate, or can it fire immediately from the `setTimeout(..., 0)` path?
- Can foreground navigation/item-open work preempt any background projection or full-document warming already queued?
- Are background cache tasks canceled or ignored on navigation, identity change, foreground miss, visible route error, and rate-limit pressure?
- Does unchanged freshness on a draft branch perform only active-ref identity calls, or does it still resolve main/default branch identity?
- Do GitHub 403 secondary-limit responses, 429s, 5xx responses, and low remaining quota actually pause background warming and respect retry-after/backoff behavior?
- Does item open avoid foreground whole-collection document reads for tag suggestions and existing-item hydration?
- Does publish/draft summary use compare scope and changed before/after documents on small drafts, instead of broad full-site document comparison?
- Are normal GitHub route-data fallbacks to legacy `content-cache` zero, or at least logged with route, slug, source, and reason?
- Do route readiness marks distinguish page route shell, item route shell, and rich-editor interactivity clearly enough to support budget assertions?

Manual QA observations from 2026-07-17:

- Cache progress appears bursty: it can jump quickly at first, for example from `1/6`, and then on Theresa's project collection jump to about `31/116`.
- After the initial jump, cache progress can sit at the same count for several minutes. In the observed run it stayed at `31/116` for a couple of minutes, moved to `32/116`, and then did not add another completed item while the note was being written.
- No console errors were observed during the stalled-looking cache progress.
- Moving around the app feels faster in general, which suggests foreground navigation may have improved even while background/cache behavior still feels slow or out of sync.
- This cache behavior is the user's biggest remaining performance concern because it does not feel like caching performance has improved and there is not enough UI insight to tell whether work is slow, paused, blocked, retrying, rate-limited, or waiting behind other tasks.
- Clicking `Review Draft` still feels slower than desired. Observed timing: about 3 seconds to load the review page.
- Clicking the site title to return to the main Tentman interface from review takes about 4 to 5 seconds.
- It is unclear whether `Review Draft` and return-to-main timings were scoped by this project or whether the user's expectation is stricter than the current benchmarks.

Manual QA questions to answer:

- When cache progress stalls at a count such as `31/116`, what exact operation is active: projection hydration, item-document warming, full-document warming, freshness, retry/backoff, rate-limit pause, queue wait, IndexedDB write, or nothing?
- Is the cache progress numerator based on completed documents, completed projections, cache inventory records, or a mixed set of record types?
- Does navigation to Theresa's project collection change the cache denominator or the work queue, and is the jump from small totals to `31/116` expected?
- During the apparent stall, are background tasks paused because foreground work is active, because the route is not marked ready/idle, because rate-limit pressure is detected, or because a request is slow?
- Are cache tasks still running when no progress is shown, or has the queue stopped without surfacing an error?
- Is `Review Draft` following the scoped compare path promised by the spec, and are the observed 3 seconds within the intended p75 target for a small draft?
- Why does returning from review to the main Tentman interface take 4 to 5 seconds, and is that path repeating bootstrap/config/freshness/cache work unnecessarily?

Diagnosis update from 2026-07-17 TDD pass:

- Cache progress is inventory progress, not queue progress. The numerator is `cachedTargets + skippedBudgetTargets`; the denominator is `totalTargets` from active IndexedDB inventory records. Inventory records include the active snapshot, block support, singleton documents, collection indexes, collection projections, and full item documents. Once a collection index is known, Tentman can add projection and item-document targets for every indexed item, so navigation into a collection can legitimately grow the denominator and make progress jump from a small startup total to a much larger collection-aware total.
- A stalled-looking count is now traceable through `cache-work` instrumentation. Cache work events record phase, operation, workflow, route, repo/ref, task key/kind, priority, progress completed/total, queued/running task counts, and reason. Operations distinguish projection hydration, item-document warming, full-document warming, block/singleton/index warming, retry/backoff, rate-limit pause, queue wait, and no-active-work style states.
- Regression trace evidence: the idle-gated remaining projection hydration test now records one queued passive `projection-hydration` task for `/pages/posts` after visible readiness, with `progressCompleted: 4`, `progressTotal: 12`, `queuedTasks: 1`, `runningTasks: 0`, and reason `queued cache task`. The matching `queue-wait` event explains that passive background work is waiting for route readiness and browser idle before it runs.
- Regression request-count evidence: the same collection route path performs one foreground collection-index request and one foreground visible projection request before queuing remaining passive projection hydration. The route emits the desktop collection readiness mark before the passive background projection task runs.
- Retry/backoff evidence: a 429 projection response now records both the failed browser request trace and a `cache-work` event with phase `backoff`, operation `retry-backoff`, task kind `collectionProjectionBatch`, and reason `GitHub rate limit reached; retrying cache work`; the regression then succeeds on the second projection request.
- Review Draft client path is scoped to one browser request: `/publish` calls only `/api/repo/publish-view` from the page load, records `publish-summary:first-status`, and then records `publish-summary:complete`. The existing page-load budget test asserts at most one browser request, zero browser-side GitHub request events, zero route-data fallbacks, and one total request for the client workflow.
- Review Draft server path follows the scoped compare design: `/api/repo/publish-view` resolves the managed draft branch, loads the base repository snapshot, builds a draft change index, applies the review cost guard, and passes the changed file list into `buildPublishReviewModel`. For small directory-backed content drafts, the review model uses changed before/after documents instead of a broad collection/site comparison; unsupported scopes are surfaced as degraded review status and route-data fallback events rather than silently doing unbounded work.
- The observed about-3s Review Draft load is inside the current p75 target for a small draft. The speed target says publish/draft summary should show the scoped changed-page/item summary within 4s for small drafts such as the baseline one-item draft.
- Returning from Review Draft by clicking the site title is a normal navigation from `/publish` to `/pages`, not a special lightweight restore path. That re-enters the pages workspace layout and overview load path, including pages bootstrap (`/api/repo/configs` through `loadRepoConfigsBootstrap`), instruction discovery, pages overview summary/config-state work, and any freshness/cache work triggered by the workspace. The observed 4 to 5 seconds is therefore plausibly repeated workspace/bootstrap/overview work rather than Review Draft teardown. It is outside the 3s first-repository-open target if the return is judged as a repository-shell/sidebar-ready workflow.
- Implementation update for issue 23: returning from Review Draft to `/pages` now has a separate `return-to-pages` workflow. The warm layout path emits `warm-shell-ready` and `validation-deferred`; the overview path emits `overview-ready`. Focused route-load regressions cover both no-draft and draft-bearing Review Draft states and assert a zero-request warm-return budget: 0 browser request traces, 0 GitHub request traces, 0 route-data fallbacks, and 0 total traced requests for the layout/bootstrap shell and overview summary when the repository identity is unchanged.
- Remaining repeated-work note: mutation-result returns such as `/pages?merged=true`, `/pages?cancelled=true`, and `/pages?published=true` intentionally bypass the warm cache and refresh bootstrap data, because publish/discard/direct-publish can change active draft or repository identity. Manual QA should rerun the live Review Draft return timing to capture the new wall-clock readiness after this automated zero-request path.

Live in-app browser trace from 2026-07-17:

- Environment: local dev server at `http://localhost:5176`, authenticated in the in-app browser, repository `kilmc/theresagrieben`, active ref `main`.
- First repository open to `/pages` took about 3.6s from repo click to bootstrap-ready. The cold `/api/repo/configs` request took 3153.4ms, including snapshot discovery over 2022 tree entries and 4 discovered config files; the repository snapshot load took 2239.6ms.
- Direct `/pages/projects` navigation rendered in about 1.3s, but the collection UI showed an empty-state message even though the server returned a `projects` projection result with `requestedBlobCount: 25` and `itemCount: 25`.
- After returning to `/pages`, sidebar cache progress showed `57/116` and remained there for a 15s observation window. The new terminal trace for that window showed pages bootstrap/config/freshness work, but no detailed `cache-work` explanation surfaced in the visible terminal output for the stalled-looking count.
- Direct `/pages/news` navigation rendered in about 4.0s, but the collection UI again showed an empty-state message even though the server loaded the `news` collection index with `itemCount: 222` and then hydrated projection batches for the indexed news items.
- After visiting `news`, cache progress jumped to `280/560` and stayed there for another 15s observation window. The denominator expansion matches the inventory-progress model: once the 222-item collection index is known, projection and document targets are added for the collection.
- `/publish` could not measure a real Review Draft content summary because the live repository had no managed draft branch. The page returned the expected "No draft branch found" 404 state in about 1.4s; the `/api/repo/publish-view` request took 321.4ms and emitted `publish-summary:first-status`.
- Returning from `/publish` to `/pages` by clicking the site title took about 2.5s in this live run before issue 23. The trace showed a fresh pages/config path: `/api/repo/configs` took 657.3ms, instruction discovery probed `tentman/instructions` and got a 404, pages summary took 0.2ms, config states took 533.8ms, and freshness took 599.4ms.
- New release-risk finding from the live trace: the projects and news routes rendered empty collection states while the backend returned indexed/projection data for 25 projects and 222 news posts. That is separate from cache progress visibility and should be treated as a follow-up before release QA can call collection navigation healthy.

Recommended next fixes:

- Surface the latest `cache-work` event in the cache UI so users can see current operation, queue/idle/backoff/rate-limit state, and task counts without opening devtools.
- Rerun the issue 23 return-to-pages path in the live browser to record post-fix wall-clock timing for the new `return-to-pages` readiness marks.
- Add a focused follow-up for the collection route empty-state regression found in the live trace: `/pages/projects` and `/pages/news` should render indexed items when the server returns collection index/projection data. Tracked by issue 22.
- Rerun `/publish` against a repository state with an actual managed draft branch to capture the real Review Draft content-summary timing; the current live repository only exercised the no-draft branch.

## 3. Architecture boundary findings

### Boundary blocker. Page/editor callers still depend on GitHub cache mechanics

This is both P1 release-blocking and the highest-risk standards finding. Route loaders still know about `githubRepositoryCache`, bootstrap hydration, and cache-backed workflow-data methods. The intended boundary is app-level, capability-shaped, and view-model-shaped; page/editor callers should request page view data, item view data, collection navigation, block support, cache-miss results, and freshness status without naming GitHub cache mechanics.

Decision needed:

- Introduce or finish a route workflow capability module that owns GitHub cache hydration/cache-miss details underneath.
- Move route loaders to that module first, then keep budget tests at the workflow capability surface.

### Boundary blocker. Local workflow data is not fully behind the shared workflow vocabulary

This is also P1 release-blocking. Local edit components still assemble route data by reading local stores and content services directly. Local-specific mechanics should stay local, but the page/editor surface should consume the same workflow vocabulary as GitHub mode.

Decision needed:

- Add local workflow capability functions for singleton page edit and item edit.
- Preserve local direct-write, recovery cleanup, preview URL, rescan/remount, and File System Access behavior inside local-specific code.

### P2. Local workflow identity is forced through GitHub-shaped fields

Why it matters:

The local implementation manufactures `ref`, `headSha`, and `treeSha` from a local discovery signature to fit `RepoBootstrapIdentity`. This is an understandable bridge, but it leaks GitHub vocabulary into shared identity and makes local behavior easier to accidentally couple to GitHub cache semantics.

Key references:

- `apps/web/src/lib/repository/local-workflow-data.ts:46` starts `createLocalRepositoryIdentity(...)`.
- `apps/web/src/lib/repository/local-workflow-data.ts:56` sets `ref: dataSetKey`.
- `apps/web/src/lib/repository/local-workflow-data.ts:57` sets `headSha: dataSetKey`.
- `apps/web/src/lib/repository/local-workflow-data.ts:58` sets `treeSha: dataSetKey`.
- `apps/web/src/lib/repository/workflow-data.ts:117` hashes `identity.ref`, `identity.headSha`, and `identity.treeSha`.
- `apps/web/src/lib/repository/workflow-data.ts:135` consumes `RepoBootstrapIdentity`.

Open question:

- Is this an intentional temporary compatibility bridge, or should release split `WorkflowSourceIdentity` from GitHub repository identity?

### P2. Shared workspace adapter results expose draft branch names

Why it matters:

Draft branch names are GitHub-specific mechanics. Shared mutation results should describe user-level outcomes: changed paths, redirects, refresh instructions, recovery cleanup, message/status. Exposing `branchName` on mode-neutral adapter results keeps GitHub draft mechanics visible above the boundary.

Key references:

- `apps/web/src/lib/features/content-management/pages-workspace-consumer.ts:113` includes `branchName?: string | null` on `navigation-saved`.
- `apps/web/src/lib/features/content-management/pages-workspace-consumer.ts:122` includes `branchName?: string | null` on `collection-order-saved`.
- `apps/web/src/lib/features/content-management/pages-workspace-adapters.ts:541`, `:546`, and `:565` parse, store, and return navigation save branch names.
- `apps/web/src/lib/features/content-management/pages-workspace-adapters.ts:639`, `:643`, and `:674` parse, store, and return collection order save branch names.

Open question:

- Can `branchName` be fully adapter-private because `setDraftBranch(...)` already happens inside the GitHub adapter?

## 4. Non-blocking follow-ups

### P2. Singleton page route readiness is marked as item route shell

Why it matters:

The QA plan asks for separate readiness points for page/item route shells and editor interactivity. Singleton page view currently emits `item-route-shell`, which can make request budget assertions and readiness timelines misleading.

Key references:

- `apps/web/src/routes/pages/[page]/+page.ts:115` calls `markWorkflowReadiness(...)`.
- `apps/web/src/routes/pages/[page]/+page.ts:116` uses `workflow: 'item-route-shell'` for a page route.

Follow-up:

- Add or rename workflow instrumentation vocabulary for page route shell versus item route shell, or intentionally broaden the name to `route-form-shell`.

### P2. Rich editor readiness is only marked for item edit

Why it matters:

The QA plan asks for rich editor interactivity marks. Item edit marks rich-editor readiness, but singleton edit and new-item workflows appear uncovered.

Key references:

- `apps/web/src/routes/pages/[page]/[itemId]/edit/+page.svelte:249` marks `rich-editor-interactive` on item edit mount.
- `apps/web/src/routes/pages/[page]/edit/+page.svelte:1` has no matching mark found.
- `apps/web/src/routes/pages/[page]/new/+page.svelte:1` has no matching mark found.

Follow-up:

- Add rich editor readiness assertions for singleton edit and new item routes.
- Verify route/form shell and rich editor marks remain separate in each editor workflow.

### P2. Cache UI does not explain current work or stalled-looking progress

Why it matters:

Manual QA found cache progress can jump quickly and then sit at a value such as `31/116` for minutes with no console errors and no user-visible explanation. Even if this is caused by correct queueing, idle gating, backoff, rate-limit pause, or slow item-document warming, the current UI does not make that legible.

Follow-up:

- Add cache UI detail showing the current cache task or item being processed.
- Show the current operation type, such as projection hydration, item-document warming, full-document warming, freshness, retry/backoff, rate-limit pause, queue wait, or IndexedDB write.
- Show whether background cache work is running, paused, waiting for idle, blocked behind foreground work, backing off after an error, or stopped by rate-limit policy.
- Consider exposing recent cache task history with duration, result, and miss/error reason so slow records can be identified without opening devtools.
- Clarify what the progress numerator and denominator count, especially when totals change after navigating into a collection.

### QA documentation follow-ups

- Record exact route, mode, viewport, cold/warm cache state, draft branch state, and observed request traces for every P1.
- After fixes, rerun `pnpm run check` and `pnpm run verify:baseline`.
- Finish manual QA on desktop/sidebar-present GitHub `/pages/news`, warm reload, freshness unchanged/changed, publish summary, item open/edit, and local folder mode.

## 5. Recommended next sessions/prompts

### Session 1: Fix runtime/API-pressure blockers

Suggested prompt:

```text
Use /tdd in /Users/kilmc/code/tentman/tentman. Fix the release-blocking runtime/API-pressure findings in .scratch/github-backed-speed-unification/release-qa-findings.md section 1: background projection hydration must go through queue/idle/cancel controls, draft-branch unchanged freshness must avoid main-ref identity reads, and rate-limit safety must pause/stop background warming on low quota and secondary-limit signals. Write failing regressions first. Do not address boundary refactors in this session unless required by these fixes.
```

### Session 2: Diagnose speed questions with traces

Suggested prompt:

```text
Use /diagnosing-bugs in /Users/kilmc/code/tentman/tentman. Answer the performance questions in .scratch/github-backed-speed-unification/release-qa-findings.md section 2 with request traces, workflow readiness marks, and cache hit/miss reasons. Focus on desktop/sidebar GitHub /pages/news against a Theresa-sized repository, warm reload, draft-branch unchanged freshness, background warming/rate-limit behavior, cache progress stalling around values like 31/116, Review Draft taking about 3s, and return-to-main taking about 4-5s. Produce a short findings update before code changes.
```

### Session 3: Move page/editor callers behind workflow capabilities

Suggested prompt:

```text
Use /implement in /Users/kilmc/code/tentman/tentman. Address the architecture boundary blockers in .scratch/github-backed-speed-unification/release-qa-findings.md section 3. Page/item route loaders should stop importing githubRepositoryCache directly and consume a workflow route capability module. Local page/item edit components should stop assembling local workflow data directly and consume local workflow capabilities. Preserve behavior and add boundary/regression tests.
```

### Session 4: Clean up boundary smells and instrumentation naming

Suggested prompt:

```text
Use /implement in /Users/kilmc/code/tentman/tentman. Address non-blocking follow-ups in .scratch/github-backed-speed-unification/release-qa-findings.md sections 3 and 4: split local workflow identity away from GitHub-shaped ref/headSha/treeSha if appropriate, keep draft branch names adapter-private, distinguish page/item route readiness naming, add missing rich-editor readiness marks for singleton edit and new item workflows, and improve the cache UI so it shows current item/current operation/pause or backoff reason.
```

### Session 5: Final release QA pass

Suggested prompt:

```text
Use /code-review in /Users/kilmc/code/tentman/tentman after the follow-up fixes. Review the performance-improvement branch against .scratch/github-backed-speed-unification/qa.md, .scratch/github-backed-speed-unification-spec.md, and .scratch/github-backed-speed-unification/release-qa-findings.md. Confirm all P1 findings are fixed, rerun pnpm run check and pnpm run verify:baseline, then perform the manual QA matrix for desktop GitHub /pages/news, warm reload, freshness, publish summary, item open/edit, and local mode.
```
