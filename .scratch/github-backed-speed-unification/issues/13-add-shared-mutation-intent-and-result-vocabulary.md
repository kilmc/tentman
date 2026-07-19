# 13 — Add shared mutation intent and result vocabulary

**What to build:** Save, create, delete, Navigation Manifest edits, publish/discard outcomes, redirect targets, recovery cleanup, and refresh instructions share a mode-neutral intent/result vocabulary. GitHub draft/publish mechanics and local direct-write mechanics remain separate implementations behind that contract.

**Blocked by:** 11 — Rework the pages workspace consumer around workflow capabilities; 12 — Preserve local mode behind the same workflow vocabulary.

**Status:** complete

- [x] Shared mutation intents exist for saving content, creating items, deleting items, saving Navigation Manifest order/groups, and requesting publish/discard style outcomes.
- [x] Shared mutation results describe changed paths, redirect targets, recovery cleanup signals, refresh instructions, success, degraded, and error outcomes.
- [x] GitHub mutations continue to use draft branch, PR, publish/discard, compare, and server-action mechanics underneath the shared result shape.
- [x] Local mutations continue to use direct browser-backed writes, local refresh, and local recovery cleanup underneath the shared result shape.
- [x] Existing local and GitHub mutation workflows retain user-visible behavior while tests can assert shared intents and outcomes.

## Comments

- Completed in `8c2ada0`. Added the shared `WorkflowMutationIntent` and `WorkflowMutationResult` vocabulary, then wired save/create/delete, Navigation Manifest save/order/group edits, publish/discard, redirect targets, recovery cleanup, changed paths, and refresh instructions through that shape.
- GitHub draft branch, pull request, publish/discard, compare, server-action, and cache invalidation mechanics remain behind the shared result contract. Local browser direct writes, local refresh, local route redirects, and local recovery cleanup remain local mechanics behind the same vocabulary.
- Verified with `npm run check`, `npm run test`, focused server/unit specs, sequential browser specs for page edit, item edit, new item, and collection groups, and Prettier checks on touched files.
