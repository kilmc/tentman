# 14 — Retire or quarantine legacy route-data fallbacks and tighten budgets

**What to build:** Instrumentation from the earlier tickets is used to remove or quarantine legacy route-data fallback paths that no longer fire on normal GitHub workflows. Final workflow budgets are tightened around measured p75 behavior, server blob concurrency evidence, publish summary behavior, and the actual usefulness of full-document warming.

**Blocked by:** 05 — Convert changed freshness into stale or error route records; 07 — Move GitHub workspace bootstrap and config states behind workflow capabilities; 08 — Move GitHub collection navigation and projection hydration behind workflow capabilities; 09 — Move GitHub page, item, and block-support views behind workflow capabilities; 10 — Move publish and draft summary onto scoped compare workflow data; 13 — Add shared mutation intent and result vocabulary.

**Status:** complete

- [x] Normal GitHub collection, singleton, item, config-state, publish summary, and preview/draft filename workflows either avoid legacy fallbacks or log them as explicit compatibility behavior.
- [x] Fallback paths that are no longer needed on normal routes are removed or quarantined behind clear compatibility boundaries.
- [x] Budget assertions are tightened for collection landing, warm reload, item open, freshness, publish summary, background warming, and duplicate foreground calls.
- [x] Server blob concurrency, background warming caps, and rate-limit thresholds are adjusted based on measured evidence.
- [x] Full-document warming remains disabled or bounded on first open and collection landing unless instrumentation proves a user-facing benefit.
- [x] Final tests prove the desktop/sidebar `news` collection path reaches usable UI within target and never remains stuck after collection index and visible projections have returned.

## Comments

- Completed in follow-up commits after `dab48bf`. Normal route-data fallbacks remain logged compatibility behavior for local/non-indexable shapes, existing server blob concurrency stays at the stricter cap of 4 with coverage, freshness budgets now assert the one-call unchanged/deduped path, and idle full-document site warming is capped to 50 item documents or 10 MB per run after projections hydrate.
