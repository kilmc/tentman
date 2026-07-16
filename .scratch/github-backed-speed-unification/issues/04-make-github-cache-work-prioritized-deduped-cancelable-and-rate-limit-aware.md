# 04 — Make GitHub cache work prioritized, deduped, cancelable, and rate-limit-aware

**What to build:** GitHub cache work respects visible user intent. Foreground collection and item route work outranks idle warming, duplicate route/cache/GitHub requests collapse into one in-flight operation, identity changes cancel stale work, and rate-limit/backoff pressure becomes visible status instead of hidden repeated retries.

**Blocked by:** 01 — Add GitHub workflow readiness and request budget instrumentation.

**Status:** ready-for-agent

- [ ] Cache work has priority lanes that keep active route readiness ahead of hover, top-level warm, and passive warm work.
- [ ] Duplicate foreground endpoint/cache/GitHub work for the same route-data identity is deduped and observable.
- [ ] Background warming pauses or cancels on navigation, identity changes, foreground misses, visible errors, and rate-limit pressure.
- [ ] Server-side GitHub blob hydration has conservative concurrency control and in-flight dedupe.
- [ ] Retry/backoff respects retry-after signals where present and uses capped backoff for rate-limit or transient failure responses.
- [ ] Foreground failures become visible error or degraded states with manual retry where appropriate.
