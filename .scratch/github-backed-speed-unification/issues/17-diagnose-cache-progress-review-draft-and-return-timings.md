# 17 — Diagnose cache progress, Review Draft, and return timings

**What to build:** A diagnosis pass explains the remaining user-visible speed concerns with traces instead of guesses: cache progress jumping then stalling, Review Draft taking about 3 seconds, and returning from review to the main Tentman interface taking about 4 to 5 seconds.

**Blocked by:** 15 — Fix background cache queue, idle, and rate-limit behavior; 16 — Fix draft-branch unchanged freshness budget.

**Status:** complete

- [x] Capture traces for a Theresa-sized GitHub-backed repository where cache progress jumps quickly and then appears stalled around a value such as `31/116`.
- [x] Identify what operation is active during stalled-looking cache progress: projection hydration, item-document warming, full-document warming, freshness, retry/backoff, rate-limit pause, queue wait, IndexedDB write, or no active work.
- [x] Explain what the cache progress numerator and denominator count, and why totals can change after navigating into a collection.
- [x] Confirm whether Review Draft follows the scoped compare path and whether the observed 3 second load is inside or outside the intended target.
- [x] Explain why returning from review to the main interface takes 4 to 5 seconds, including whether bootstrap, config, freshness, or cache work is repeated unnecessarily.
- [x] Update the release QA findings with measured request counts, readiness marks, cache hit/miss reasons, and recommended next fixes.

## Comments

- 2026-07-17 TDD pass added first-class `cache-work` instrumentation so stalled-looking progress can now be diagnosed from public traces. Regression coverage records queued passive projection hydration, queue-wait state, and retry/backoff events with inventory progress, task kind, route, repo/ref, priority, queued/running counts, and reason.
- Updated `release-qa-findings.md` with the cache progress model, Review Draft scoped compare path, the 4s small-draft target comparison, and the return-to-`/pages` bootstrap/overview explanation.
- 2026-07-17 live authenticated in-app browser run captured the Theresa-sized timing shape against `kilmc/theresagrieben`: first repo open to `/pages` took about 3.6s, `/pages/projects` rendered in about 1.3s, `/pages/news` rendered in about 4.0s, `/publish` no-draft state rendered in about 1.4s, and returning from `/publish` to `/pages` took about 2.5s.
- Live cache progress reproduced the jump/stall pattern with larger collection-aware totals: after projects it sat at `57/116` for 15s, and after news it jumped to `280/560` and stayed there for another 15s. The denominator growth matches the newly documented inventory-progress model.
- The live repository did not have a managed draft branch, so the browser could only measure the `/publish` no-draft 404 path. The scoped Review Draft content-summary path remains confirmed by code and regression coverage; a separate draft-bearing run is still useful for measuring a real content summary.
- New follow-up risk discovered during the live trace: `/pages/projects` and `/pages/news` rendered empty collection states even though the server returned projection/index data for 25 projects and 222 news posts. That should be handled as a separate release QA follow-up.
