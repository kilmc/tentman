# 24 — Enforce low-quota background cache pause threshold

**What to build:** Background GitHub cache work pauses before it can drain the core quota below the release safety budget, while foreground route work can still surface visible status and recovery.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Background and passive cache work pauses when GitHub reports remaining core quota below 500, not only when quota is exhausted.
- [ ] Foreground and intent-priority work remain allowed to complete or fail visibly when low quota is reported.
- [ ] Cache current-work UI and traces explain the low-quota pause reason without requiring devtools.
- [ ] Regression coverage proves the below-500 threshold, exhausted-quota behavior, and foreground allowance.
- [ ] Existing secondary-limit, retry-after, 429, and 5xx retry/backoff behavior remains covered.
