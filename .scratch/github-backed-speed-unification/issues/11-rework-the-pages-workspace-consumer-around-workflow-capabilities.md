# 11 — Rework the pages workspace consumer around workflow capabilities

**What to build:** The pages workspace consumes normalized workflow capabilities, route outcomes, user intents, and adapter results. Layout and editor surfaces stop coordinating local/GitHub endpoint matrices, cache mechanics, freshness polling, and repository internals directly.

**Blocked by:** 07 — Move GitHub workspace bootstrap and config states behind workflow capabilities; 08 — Move GitHub collection navigation and projection hydration behind workflow capabilities; 09 — Move GitHub page, item, and block-support views behind workflow capabilities.

**Status:** complete

- [x] Workspace bootstrap, collection navigation status, config states, route outcomes, and user-facing ready/error/degraded states flow through a mode-neutral workspace consumer.
- [x] Navigation editing, collection ordering, group management, and refresh outcomes are represented as workspace user intents and adapter results.
- [x] GitHub cache mechanics, endpoint selection, freshness polling, IndexedDB inventory, draft lifecycle, and local file handles remain outside the shared workspace consumer.
- [x] Existing UI behavior for sidebar/header wiring, navigation editing, collection ordering, item editing, preview, and status presentation is preserved.
- [x] Browser tests move toward user-intent and workflow-provider assertions instead of stubbing the full GitHub endpoint matrix.
- [x] Local rescan and GitHub cache-clear command outcomes remain mode-specific adapter results surfaced through the workspace.

## Comments

- Completed in `cb2b14e` (`Rework pages workspace around workflow capabilities`). Added the mode-neutral pages workspace consumer and adapter boundary, moved local/GitHub workspace mechanics out of the pages layout, represented workspace commands as intents/results, and preserved the existing sidebar/navigation/order/refresh behavior. Verified with `npm run check`, `npm test`, focused workspace tests, and the affected browser sidebar spec.
