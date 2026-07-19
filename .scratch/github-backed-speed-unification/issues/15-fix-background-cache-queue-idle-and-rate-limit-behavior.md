# 15 — Fix background cache queue, idle, and rate-limit behavior

**What to build:** Background GitHub cache work obeys the workflow promises from release QA: visible route work wins, remaining collection hydration waits for route readiness and idle time, stale background work is canceled or ignored after navigation or identity changes, and rate-limit pressure pauses background work instead of silently continuing.

**Blocked by:** None — can start immediately.

**Status:** complete

- [x] Remaining collection projection hydration is scheduled through the cache queue rather than a direct background loop.
- [x] Background projection hydration starts only after visible collection readiness and an idle gate.
- [x] Foreground route work can preempt queued background projection or document warming.
- [x] Background cache work is canceled or ignored after navigation, source identity changes, foreground misses, or visible route errors.
- [x] Low remaining GitHub quota and secondary/abuse limit signals pause background warming while allowing foreground work to surface visible status.
- [x] Retry and backoff behavior covers GitHub 403, 429, and 5xx responses, respects retry-after where present, and has regression coverage.

## Comments

- Completed with regressions in `github-repository-cache.svelte.spec.ts` for idle-queued remaining projection hydration, projection retry/backoff on 429 and secondary-limit 403 responses, and passive warm pause before document warming when quota is exhausted. Verified with targeted browser Vitest, `npm run check`, and `git diff --check`.
