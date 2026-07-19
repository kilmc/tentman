# 23 — Optimize publish-to-pages warm return

**What to build:** Returning from Review Draft to the main Pages workspace feels like a warm navigation when the repository identity has not changed, instead of repeating enough bootstrap, config, freshness, and overview work to feel like reopening the repository.

**Blocked by:** 17 — Diagnose cache progress, Review Draft, and return timings.

**Status:** complete

- [x] Returning from publish/review to the Pages workspace has its own readiness mark and request-budget assertion, distinct from first repository open.
- [x] When repository identity is unchanged, the return path reuses already-known workspace bootstrap, config, overview, and freshness state where correctness allows.
- [x] Necessary validation work on return is explicit in traces and does not block the visible workspace shell or sidebar longer than needed.
- [x] The warm return behavior is covered for both a no-draft publish state and a draft-bearing Review Draft state.
- [x] The measured warm-return path is documented in release QA findings with request counts, readiness timing, and any remaining repeated work.

## Implementation notes

- Added the `return-to-pages` workflow with `warm-shell-ready`, `validation-deferred`, and `overview-ready` readiness marks.
- Warm return reuses the already loaded Pages layout bootstrap and overview summary when the selected GitHub repository and known repository identity are unchanged.
- Publish/discard/direct-publish result returns (`merged`, `cancelled`, `published`) bypass the warm cache and refresh bootstrap data because those mutations can change active draft or repository identity.
- Focused route-load regressions assert zero traced browser requests, zero traced GitHub requests, zero route-data fallbacks, and zero total traced requests for no-draft and draft-bearing warm returns.
