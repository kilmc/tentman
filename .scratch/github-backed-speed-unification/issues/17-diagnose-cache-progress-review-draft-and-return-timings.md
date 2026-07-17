# 17 — Diagnose cache progress, Review Draft, and return timings

**What to build:** A diagnosis pass explains the remaining user-visible speed concerns with traces instead of guesses: cache progress jumping then stalling, Review Draft taking about 3 seconds, and returning from review to the main Tentman interface taking about 4 to 5 seconds.

**Blocked by:** 15 — Fix background cache queue, idle, and rate-limit behavior; 16 — Fix draft-branch unchanged freshness budget.

**Status:** ready-for-agent

- [ ] Capture traces for a Theresa-sized GitHub-backed repository where cache progress jumps quickly and then appears stalled around a value such as `31/116`.
- [ ] Identify what operation is active during stalled-looking cache progress: projection hydration, item-document warming, full-document warming, freshness, retry/backoff, rate-limit pause, queue wait, IndexedDB write, or no active work.
- [ ] Explain what the cache progress numerator and denominator count, and why totals can change after navigating into a collection.
- [ ] Confirm whether Review Draft follows the scoped compare path and whether the observed 3 second load is inside or outside the intended target.
- [ ] Explain why returning from review to the main interface takes 4 to 5 seconds, including whether bootstrap, config, freshness, or cache work is repeated unnecessarily.
- [ ] Update the release QA findings with measured request counts, readiness marks, cache hit/miss reasons, and recommended next fixes.
