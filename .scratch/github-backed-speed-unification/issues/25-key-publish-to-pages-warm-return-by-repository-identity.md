# 25 — Key publish-to-pages warm return by repository identity

**What to build:** Returning from Review Draft to Pages stays warm only when the selected repository identity is unchanged, and falls back to normal validation/bootstrap when the same repository has moved to a different ref, head, or tree.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Warm-return cache entries record the repository identity used to build the cached workspace data.
- [ ] The warm-return fast path reuses cached workspace data only when the current repository identity matches the cached identity.
- [ ] A same-repository identity change bypasses the warm cache and records an explicit trace reason.
- [ ] No-draft and draft-bearing warm-return regressions still prove the zero-request path when identity is unchanged.
- [ ] A new regression proves stale bootstrap data is not reused after an identity change.
