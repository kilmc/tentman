# 05 — Convert changed freshness into stale or error route records

**What to build:** Changed GitHub freshness derives affected paths in the background and marks relevant route/cache records stale or error. Missing or deleted previous refs/trees no longer produce foreground 500s or leave collection UI stuck; they become recoverable freshness status.

**Blocked by:** 03 — Make GitHub freshness identity-only when unchanged; 04 — Make GitHub cache work prioritized, deduped, cancelable, and rate-limit-aware.

**Status:** complete

- [x] Changed freshness loads only the tree data needed to derive changed paths within the background freshness budget.
- [x] Affected collection, page, item, singleton, config-state, and block-support records are marked stale or error according to changed-path results.
- [x] Missing or deleted previous identity becomes freshness stale/error status with recovery guidance rather than a foreground route failure.
- [x] Active route readiness is not blocked while changed-path derivation runs.
- [x] Tests cover unchanged, changed, and missing/deleted identity freshness outcomes.
