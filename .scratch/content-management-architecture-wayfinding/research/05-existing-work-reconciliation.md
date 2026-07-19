# Existing Work Reconciliation

## Scope

This resolves [Reconcile existing work against the architecture](../issues/05-reconcile-existing-work-against-the-architecture.md) by classifying existing Tentman planning artifacts and current collection-management work against the Domain Core/App Core/Content Source architecture from this map.

No product code was changed.

## Decision

Treat the older work as mostly useful, but with different authority levels:

- **Preserve** completed Domain Core Navigation Manifest work. It remains the canonical schema/reference foundation.
- **Preserve** the GitHub speed/read-workflow work as performance evidence and implemented read-side workflow capability work.
- **Revise** any write/mutation planning that treats `WorkflowMutationIntent` and `WorkflowMutationResult` as the final App Core boundary. Those shapes are useful adapter-facing vocabulary, but they do not yet implement the durable Editing Source contract from [Define the intended editing mental model](../issues/02-define-intended-editing-mental-model.md).
- **Pause broad collection group stabilization** until [Decide the App Core and Content Source boundary](../issues/06-decide-app-core-and-content-source-boundary.md) and [Decide the implementation strategy](../issues/08-decide-implementation-strategy.md) are resolved. Small isolated defects may still be fixed directly when intentionally scoped.

The practical rule for future agents: do not start a new content-management implementation plan from an older spec alone. Start from this content-management architecture map, then use older artifacts as evidence or implementation history.

## Classification

| Artifact | Classification | How to treat it |
| --- | --- | --- |
| [GitHub-backed architecture and performance wayfinding](../../github-backed-architecture-wayfinding/map.md) | Still valid, with narrower authority | Keep as the source of GitHub speed/performance evidence, read-route cache/freshness findings, and the earlier route/workflow capability boundary. Do not use it as the final write/editing architecture, because it predates the durable Editing Source contract. |
| [GitHub-backed speed unification spec](../../github-backed-speed-unification-spec.md) | Needs revision for write-side architecture; read-side parts still valid | The instrumentation, freshness, cache, route-data, and pages-workspace read tranches remain valid and mostly appear implemented through the later issue set. The mutation tranche should be treated as provisional: useful vocabulary exists, but the next architecture plan must decide how it relates to Editing Source, Saved/Unsynced/Needs Attention states, and authoritative App Core projections. |
| [GitHub-backed speed unification issue set](../../github-backed-speed-unification/issues/13-add-shared-mutation-intent-and-result-vocabulary.md) | Mostly completed implementation history; partial bridge to current architecture | Completed issues such as workflow route data, pages workspace consumer, local workflow vocabulary, and shared mutation results should be reused where they help. They should not block a cleaner App Core seam if the boundary ticket decides the current surface is too shallow. |
| [Own navigation manifest semantics in core](../../../docs/adr/0001-own-navigation-manifest-semantics-in-core.md) | Still valid | Keep the ADR. Domain Core owns pure Navigation Manifest parsing, validation, normalization, serialization, reference extraction, and lookup helpers. It still should not own repository loading, config discovery, cache behavior, API workflows, or editing lifecycle orchestration. |
| [Navigation Manifest module issues](../../navigation-manifest-module/issues/01-add-canonical-navigation-manifest-contract-to-core.md) | Still valid and complete | Do not reopen the project as a parser/schema migration. Future work should preserve `@tentman/core/navigation-manifest` and focus only on active web paths that still bypass helpers or duplicate source-independent mutation projection. |
| [Codebase Health Architecture Review](../../codebase-health/spec.md) | Still useful as backlog, but superseded for content-management priority | The review was created before `CONTEXT.md` and the ADRs existed. Use it as historical architecture candidate discovery, not current prioritization. This wayfinding map now owns content-management sequencing. |
| [Unify the navigation manifest module](../../codebase-health/issues/01-unify-navigation-manifest-module.md) | Superseded by completed work | This is resolved by the Navigation Manifest module project and ADRs. Only the newer audit follow-ups remain relevant. |
| [Deepen repository route data](../../codebase-health/issues/02-deepen-repository-route-data.md) | Revised and absorbed | Its useful scope was absorbed into the GitHub speed/unification route-data and workflow-capability tranches. Do not run it as a standalone grill unless a later regression proves the current route-data boundary is still too shallow. |
| [Collapse the pages workspace state](../../codebase-health/issues/03-collapse-pages-workspace-state.md) | Revised and partly absorbed | The read/workspace consumer part was absorbed into the GitHub speed/unification work. The write/editing side still needs the App Core/Content Source boundary decision because current group and navigation mutations remain spread across UI, cache, endpoint, and helper layers. |
| [Hide content component reference state](../../codebase-health/issues/04-hide-content-component-reference-state.md) | Still valid, out of scope | Keep as a later codebase-health candidate. It does not decide this content-management architecture map. |
| [Deepen the mdsvex directive adapter](../../codebase-health/issues/05-deepen-mdsvex-directive-adapter.md) | Still valid, out of scope | Keep as a later codebase-health candidate. |
| [Give the CLI a command runner module](../../codebase-health/issues/06-give-cli-command-runner-module.md) | Still valid, out of scope | Keep as a later codebase-health candidate. |
| Current collection-groups bug work | Split: small defects still valid; broad fixes should pause | The new-item group membership sync gap can be fixed directly when scoped as an isolated defect. Broader group lifecycle stabilization should wait for the App Core boundary and implementation strategy because cache patching, manifest mutation, item membership projection, local refresh, and GitHub draft/cache behavior still lack one authoritative owner. |

## Conflicts Found

### 1. The older speed spec treats mutation vocabulary as a later tranche, not an Editing Source contract

[GitHub-backed speed unification spec](../../github-backed-speed-unification-spec.md) correctly says shared mutation vocabulary should describe intents and outcomes while local and GitHub mechanics stay separate. The later [Add shared mutation intent and result vocabulary](../../github-backed-speed-unification/issues/13-add-shared-mutation-intent-and-result-vocabulary.md) ticket completed that bridge.

The current map is stricter: all Web App edits should update a durable Editing Source first and then sync to the Content Source in the background. Existing `WorkflowMutationResult` shapes describe outcomes after source-specific persistence or refresh work; they do not by themselves define durable Saved, Syncing, Synced, Unsynced, Offline, Needs Attention, or Published state transitions.

So the existing mutation vocabulary should be reviewed as an input to App Core, not accepted as the final App Core.

### 2. Completed Navigation Manifest schema work does not solve active web lifecycle duplication

The Navigation Manifest module project successfully moved pure schema/reference semantics into Domain Core. The newer [Audit the Navigation Manifest Domain Core boundary](../issues/03-audit-navigation-manifest-domain-core-boundary.md) found that active web paths still directly read manifest collection keys or duplicate group/order mutation projection.

That is not a reason to reopen the Domain Core parser work. It is evidence for the App Core seam: web editing workflows need a source-independent place to apply navigation/group/order intents and return authoritative projections.

### 3. Read-workflow unification does not settle write-workflow ownership

The GitHub speed/unification work appears to have completed useful read-route and workspace capability work. That reduces some UI/cache leakage, but collection group lifecycle evidence still shows writes crossing route components, endpoint actions, `navigation-manifest.ts`, local capabilities, GitHub cache patching, and SvelteKit invalidation differently.

Future planning should preserve the existing read/workspace capability modules where they work, but the write path still needs a fresh boundary decision.

### 4. Codebase-health priority is stale for this domain

The original codebase-health review recommended starting with Navigation Manifest unification. That has happened. It also listed route-data and pages-workspace work before the current Editing Source language and content-management wayfinding existed.

For content-management architecture, this map now supersedes the old candidate order.

## Guidance for Future Work

- Use [Decide the App Core and Content Source boundary](../issues/06-decide-app-core-and-content-source-boundary.md) as the next architectural decision. It should explicitly evaluate whether existing `WorkflowMutationIntent` and `WorkflowMutationResult` are enough, should be wrapped by a richer Editing Source/App Core state model, or should be split into adapter result shapes plus App Core editing-state shapes.
- Use [Decide the implementation strategy](../issues/08-decide-implementation-strategy.md) after the boundary decision. It should compare direct retrofit, full parallel rebuild, and strangler migration using the fact that older read-workflow work exists but write-workflow ownership remains muddy.
- Allow small direct bug fixes only when they are intentionally scoped as isolated defects. The clearest example is syncing new-item group membership into the Navigation Manifest in both local and GitHub create paths.
- Pause broad collection group, navigation editing, or cache-patching rewrites until the boundary and strategy tickets are resolved.
- Keep out-of-scope codebase-health candidates in the backlog rather than mixing them into this content-management plan.

## Follow-Up

No new ticket is needed from this reconciliation.

The existing [Decide the App Core and Content Source boundary](../issues/06-decide-app-core-and-content-source-boundary.md) ticket should absorb the mutation-vocabulary and Editing Source question. The existing [Decide the implementation strategy](../issues/08-decide-implementation-strategy.md) ticket should use this classification when choosing retrofit, parallel rebuild, or strangler migration.
