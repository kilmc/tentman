# 04 — Make GitHub cache work prioritized, deduped, cancelable, and rate-limit-aware

**What to build:** GitHub cache work respects visible user intent. Foreground collection and item route work outranks idle warming, duplicate route/cache/GitHub requests collapse into one in-flight operation, identity changes cancel stale work, and rate-limit/backoff pressure becomes visible status instead of hidden repeated retries.

**Blocked by:** 01 — Add GitHub workflow readiness and request budget instrumentation.

**Status:** complete

- [x] Cache work has priority lanes that keep active route readiness ahead of hover, top-level warm, and passive warm work.
- [x] Duplicate foreground endpoint/cache/GitHub work for the same route-data identity is deduped and observable.
- [x] Background warming pauses or cancels on navigation, identity changes, foreground misses, visible errors, and rate-limit pressure.
- [x] Server-side GitHub blob hydration has conservative concurrency control and in-flight dedupe.
- [x] Retry/backoff respects retry-after signals where present and uses capped backoff for rate-limit or transient failure responses.
- [x] Foreground failures become visible error or degraded states with manual retry where appropriate.

## Comments

- Completed in `f88a9a6` (`Make GitHub cache work rate-limit aware`). Added prioritized foreground cache work, stale identity guards, endpoint retry/backoff visibility, and server-side GitHub text blob concurrency limiting while preserving in-flight dedupe.
