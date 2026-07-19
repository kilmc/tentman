# 01 — Add GitHub workflow readiness and request budget instrumentation

**What to build:** Tentman can observe GitHub-backed workflow readiness and request cost as first-class signals. First repository open, desktop collection landing, warm collection reload, item open/edit, freshness, and publish summary each produce timing marks, request traces, cache hit/miss reasons, GitHub request stats, fallback logs, and budget-test hooks that later tickets can rely on.

**Blocked by:** None — can start immediately.

**Status:** complete

- [x] Workflow readiness marks exist for first repository open, desktop collection landing, warm collection reload, item route shell, rich editor interactive, freshness start/end, publish summary first status, and publish summary complete.
- [x] Browser request traces identify workflow, route, foreground/background priority, cache task key, duplicate/deduped state, endpoint duration, and result status.
- [x] GitHub request instrumentation covers direct source-layer branch, commit, tree, blob, compare, and contents calls, including response status, rate-limit headers, retry-after, and dedupe/cache result where applicable.
- [x] Cache hit/miss logs explain snapshot, collection index, projection, item document, singleton document, and block-support outcomes.
- [x] Route-data fallback logs include route, slug or equivalent route identity, source, and reason.
- [x] Budget assertion scaffolding is available to later tests without changing user-visible behavior.

## Comments

- Completed in `53585ae` (`Add GitHub workflow instrumentation`). Added workflow readiness marks, browser/GitHub request tracing, cache outcome and route-data fallback events, and request-budget test helpers used by the later GitHub-backed speed tickets.
