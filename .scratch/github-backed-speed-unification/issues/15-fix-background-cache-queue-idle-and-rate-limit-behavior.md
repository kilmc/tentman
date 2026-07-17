# 15 — Fix background cache queue, idle, and rate-limit behavior

**What to build:** Background GitHub cache work obeys the workflow promises from release QA: visible route work wins, remaining collection hydration waits for route readiness and idle time, stale background work is canceled or ignored after navigation or identity changes, and rate-limit pressure pauses background work instead of silently continuing.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Remaining collection projection hydration is scheduled through the cache queue rather than a direct background loop.
- [ ] Background projection hydration starts only after visible collection readiness and an idle gate.
- [ ] Foreground route work can preempt queued background projection or document warming.
- [ ] Background cache work is canceled or ignored after navigation, source identity changes, foreground misses, or visible route errors.
- [ ] Low remaining GitHub quota and secondary/abuse limit signals pause background warming while allowing foreground work to surface visible status.
- [ ] Retry and backoff behavior covers GitHub 403, 429, and 5xx responses, respects retry-after where present, and has regression coverage.
