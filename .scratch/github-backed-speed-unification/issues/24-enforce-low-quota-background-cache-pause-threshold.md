# 24 — Enforce low-quota background cache pause threshold

**What to build:** Background GitHub cache work pauses before it can drain the core quota below the release safety budget, while foreground route work can still surface visible status and recovery.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Background and passive cache work pauses when GitHub reports remaining core quota below 500, not only when quota is exhausted.
- [x] Foreground and intent-priority work remain allowed to complete or fail visibly when low quota is reported.
- [x] Cache current-work UI and traces explain the low-quota pause reason without requiring devtools.
- [x] Regression coverage proves the below-500 threshold, exhausted-quota behavior, and foreground allowance.
- [x] Existing secondary-limit, retry-after, 429, and 5xx retry/backoff behavior remains covered.

## Resolution

Implemented in commit `b669802` (`Pause background cache warming on low quota`).

Background/top-level/passive cache endpoint work now pauses when GitHub reports
`x-ratelimit-remaining` below `500`, while foreground and intent-priority route work can
still complete or fail through the visible route path. Exhausted quota continues to use the
existing exhausted-quota pause reason, including final `403` responses.

Verified with:

- `node /Users/kilmc/code/tentman/tentman/scripts/run-vitest.mjs --browser run --project client src/lib/stores/github-repository-cache.svelte.spec.ts`
- `pnpm run check`
- `pnpm test`
