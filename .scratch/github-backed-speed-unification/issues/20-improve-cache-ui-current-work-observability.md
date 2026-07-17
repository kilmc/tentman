# 20 — Improve cache UI current-work observability

**What to build:** The cache UI explains what is happening while cache progress appears slow or stalled, so a user can tell whether background work is running, paused, queued, backing off, rate-limited, or stopped.

**Blocked by:** 17 — Diagnose cache progress, Review Draft, and return timings.

**Status:** complete

- [x] Cache UI shows the current cache task or item when work is active.
- [x] Cache UI shows the current operation type, such as projection hydration, item-document warming, full-document warming, freshness, retry/backoff, rate-limit pause, queue wait, or IndexedDB write.
- [x] Cache UI distinguishes running, paused, waiting for idle, blocked behind foreground work, backing off after an error, stopped by rate-limit policy, and idle/no-work states.
- [x] Recent cache task history exposes duration, result, and miss/error reason for slow or failed records without requiring devtools.
- [x] The progress numerator and denominator are explained clearly, especially when the total changes after navigating into a collection.
- [x] Tests or story coverage verify the visible states for running, paused, backoff, rate-limit, and completed cache work.

## Comments

- 2026-07-18 tracker correction: issue was implemented by the cache-work observability pass and should not remain `ready-for-agent`. The implementation adds cache current-work state, recent work history, progress explanation, browser cache-page coverage, and cache-store regression coverage. Remaining review follow-ups are tracked separately by issues 24-26.
