# 12 — Preserve local mode behind the same workflow vocabulary

**What to build:** Local mode satisfies the same workflow vocabulary as GitHub mode while keeping browser and filesystem mechanics local-specific. Local repository reads/writes, discovery signatures, handle persistence, rescan/remount behavior, preview URL handling, and local block limitations remain independent from GitHub polling, caches, draft branches, and server route fallbacks.

**Blocked by:** 06 — Introduce the app-level workflow-data contract for read routes; 11 — Rework the pages workspace consumer around workflow capabilities.

**Status:** complete

- [x] Local bootstrap, collection navigation, page view, item view, config states, block support, freshness-like status, and preview URL output satisfy the shared workflow contract.
- [x] File System Access handles, permission prompts, `.git` validation, persisted handles, discovery signatures, local config caches, direct writes, and rescan/remount behavior remain local adapter mechanics.
- [x] Local mode does not inherit GitHub polling, GitHub cache inventory, GitHub request queues, draft branches, PR lifecycle, publish/discard mechanics, or server fallback APIs.
- [x] Existing local workflows for navigation editing, collection ordering, item edit, item create/delete, preview, and local rescan retain behavior.
- [x] Tests cover local adapter workflow outputs and local-specific rescan/direct-write behavior through the shared workspace consumer.

## Comments

- Completed in this implementation. Local content discovery now derives a normalized workflow bootstrap from local adapter state, the pages workspace consumer reads local workflow data through the same vocabulary as GitHub while preserving local capabilities, and adapter tests pin local rescan/direct-write behavior away from GitHub cache, polling, and draft branch mechanics.
