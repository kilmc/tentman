# Content management architecture wayfinding

## Destination

Produce a shared architecture map of Tentman's content-management data flow across local folder mode and GitHub-backed mode, especially Navigation Manifest, collection groups, App Core state, Domain Core semantics, Content Source persistence, commits/sync, and cache freshness.

The map is complete when we understand the current read/write flow, have decided the intended editing mental model and core boundaries, have chosen whether implementation should proceed as retrofit, parallel rebuild, or strangler migration, and know which existing specs/issues remain valid, need revision, or should be paused before more implementation work continues.

## Notes

- Main repo: `/Users/kilmc/code/tentman/tentman`.
- This effort is planning and diagnosis only. Do not implement product fixes while resolving this map unless a ticket explicitly says the work is instrumentation-only evidence gathering or minimal reproduction.
- Cover both local folder mode and GitHub-backed mode. Model the shared content-management workflow once, then mark which steps are Content Source-specific.
- Use the glossary terms in `CONTEXT.md`: Domain Core, App Core, Content Source, Navigation Manifest, and Navigation Reference.
- Treat Domain Core as the shared package-level domain layer used by the web app, CLI, and future surfaces for portable content rules and semantics.
- Treat App Core as the web app's source-independent workflow layer where UI actions become mutation intents and results before Content Source adapters persist them.
- Treat Content Source adapters as responsible for local filesystem/GitHub/future-provider mechanics, including transport, persistence, commits/sync, draft branch behavior, IndexedDB, cache warming, and freshness checks.
- Do not assume the stabilization plan is an in-place retrofit. Use the evidence gathered here to compare retrofit, parallel rebuild, and strangler migration before implementation tickets are written.
- Relevant existing artifacts:
  - [GitHub-backed architecture and performance wayfinding](../github-backed-architecture-wayfinding/map.md)
  - [GitHub-backed speed unification spec](../github-backed-speed-unification-spec.md)
  - [Codebase Health Architecture Review](../codebase-health/spec.md)
  - [Own navigation manifest semantics in core](../../docs/adr/0001-own-navigation-manifest-semantics-in-core.md)
  - [Navigation Manifest module issues](../navigation-manifest-module/issues/01-add-canonical-navigation-manifest-contract-to-core.md)
- Useful skills while resolving tickets: `diagnosing-bugs` for current-flow tracing and regressions, `domain-modeling` for vocabulary, `codebase-design` for boundaries, and `grilling` for product contracts.

## Decisions so far

- [Trace current content-management data flow](issues/01-trace-current-content-management-data-flow.md) — current reads/writes are split across UI state, App Core-shaped workflow vocabulary, Content Source adapters, browser/server caches, and GitHub draft persistence; the existing follow-up tickets cover the deeper boundary decisions this trace surfaced.
- [Define the intended editing mental model](issues/02-define-intended-editing-mental-model.md) — all Web App edits update a durable Editing Source first, then sync to the Content Source in the background using product-facing Saved/Syncing/Synced/Unsynced/Offline/Needs Attention/Published states.
- [Audit the Navigation Manifest Domain Core boundary](issues/03-audit-navigation-manifest-domain-core-boundary.md) — the canonical Domain Core parser/serializer contract still holds, but active web navigation/group flows duplicate reference lookup and source-independent mutation projection, so follow-up should preserve core semantics while moving edits toward an Editing Source/App Core seam.
- [Explain collection group lifecycle and divergence](issues/04-explain-collection-group-lifecycle-and-divergence.md) — group lifecycle bugs split between small implementation defects such as new-item membership sync gaps and a broader missing App Core seam for authoritative group/order/membership mutation results across local and GitHub Content Source adapters.
- [Reconcile existing work against the architecture](issues/05-reconcile-existing-work-against-the-architecture.md) — preserve completed Domain Core Navigation Manifest work and GitHub read-workflow/speed work, but revise write-side mutation planning around the newer Editing Source/App Core contract before broad collection-management fixes continue.

## Not yet specified

- Whether mutation intent/result vocabulary should live entirely in App Core or partly graduate into Domain Core once it hardens.
- Which tests should become contract tests for Domain Core, App Core, and Content Source adapters once the boundary decisions are made.
- Whether current names in code and packages should be changed to reflect Domain Core/App Core/Content Source terminology.

## Out of scope

- Implementing architecture fixes during wayfinding.
- Reworking unrelated codebase-health candidates beyond reconciling whether they still fit this effort.
- Work in `/Users/kilmc/code/tentman/test-app` unless a later ticket explicitly asks for test-app evidence.
