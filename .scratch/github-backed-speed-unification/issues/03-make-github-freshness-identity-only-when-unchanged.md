# 03 — Make GitHub freshness identity-only when unchanged

**What to build:** Unchanged GitHub freshness checks become cheap identity checks. They no longer re-enter broad bootstrap/config loading, rebuild config states, parse configs, or block the active route before the current page or collection can become ready.

**Blocked by:** 01 — Add GitHub workflow readiness and request budget instrumentation.

**Status:** complete

- [x] An unchanged freshness check uses only active-ref identity work and performs no tree, blob, config parsing, config-state rebuild, or broad bootstrap loading.
- [x] Freshness checks are tracked as their own workflow and do not gate first repository open, collection landing, or item route readiness when unchanged.
- [x] Duplicate foreground freshness work for the same identity is deduped or reported as a budget failure.
- [x] Tests assert that unchanged freshness does not call broad config/bootstrap endpoints or equivalent route-data assembly paths.
- [x] User-facing freshness status still updates clearly after a successful unchanged check.

## Comments

- Completed in `1139934` (`Make unchanged GitHub freshness identity-only`). Added the `/api/repo/freshness` identity endpoint, freshness tests, unchanged-check dedupe, and cache-store behavior that updates freshness status without broad config/bootstrap reloads.
