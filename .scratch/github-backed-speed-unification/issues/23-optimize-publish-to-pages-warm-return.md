# 23 — Optimize publish-to-pages warm return

**What to build:** Returning from Review Draft to the main Pages workspace feels like a warm navigation when the repository identity has not changed, instead of repeating enough bootstrap, config, freshness, and overview work to feel like reopening the repository.

**Blocked by:** 17 — Diagnose cache progress, Review Draft, and return timings.

**Status:** ready-for-agent

- [ ] Returning from publish/review to the Pages workspace has its own readiness mark and request-budget assertion, distinct from first repository open.
- [ ] When repository identity is unchanged, the return path reuses already-known workspace bootstrap, config, overview, and freshness state where correctness allows.
- [ ] Necessary validation work on return is explicit in traces and does not block the visible workspace shell or sidebar longer than needed.
- [ ] The warm return behavior is covered for both a no-draft publish state and a draft-bearing Review Draft state.
- [ ] The measured warm-return path is documented in release QA findings with request counts, readiness timing, and any remaining repeated work.
