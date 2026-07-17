# 20 — Improve cache UI current-work observability

**What to build:** The cache UI explains what is happening while cache progress appears slow or stalled, so a user can tell whether background work is running, paused, queued, backing off, rate-limited, or stopped.

**Blocked by:** 17 — Diagnose cache progress, Review Draft, and return timings.

**Status:** ready-for-agent

- [ ] Cache UI shows the current cache task or item when work is active.
- [ ] Cache UI shows the current operation type, such as projection hydration, item-document warming, full-document warming, freshness, retry/backoff, rate-limit pause, queue wait, or IndexedDB write.
- [ ] Cache UI distinguishes running, paused, waiting for idle, blocked behind foreground work, backing off after an error, stopped by rate-limit policy, and idle/no-work states.
- [ ] Recent cache task history exposes duration, result, and miss/error reason for slow or failed records without requiring devtools.
- [ ] The progress numerator and denominator are explained clearly, especially when the total changes after navigating into a collection.
- [ ] Tests or story coverage verify the visible states for running, paused, backoff, rate-limit, and completed cache work.
