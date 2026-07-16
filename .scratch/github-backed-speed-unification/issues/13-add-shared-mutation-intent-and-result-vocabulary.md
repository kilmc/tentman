# 13 — Add shared mutation intent and result vocabulary

**What to build:** Save, create, delete, Navigation Manifest edits, publish/discard outcomes, redirect targets, recovery cleanup, and refresh instructions share a mode-neutral intent/result vocabulary. GitHub draft/publish mechanics and local direct-write mechanics remain separate implementations behind that contract.

**Blocked by:** 11 — Rework the pages workspace consumer around workflow capabilities; 12 — Preserve local mode behind the same workflow vocabulary.

**Status:** ready-for-agent

- [ ] Shared mutation intents exist for saving content, creating items, deleting items, saving Navigation Manifest order/groups, and requesting publish/discard style outcomes.
- [ ] Shared mutation results describe changed paths, redirect targets, recovery cleanup signals, refresh instructions, success, degraded, and error outcomes.
- [ ] GitHub mutations continue to use draft branch, PR, publish/discard, compare, and server-action mechanics underneath the shared result shape.
- [ ] Local mutations continue to use direct browser-backed writes, local refresh, and local recovery cleanup underneath the shared result shape.
- [ ] Existing local and GitHub mutation workflows retain user-visible behavior while tests can assert shared intents and outcomes.
