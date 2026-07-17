# 16 — Fix draft-branch unchanged freshness budget

**What to build:** Unchanged freshness on a managed draft branch is cheap and active-ref-only. When the active draft identity matches the previous freshness identity, Tentman should not spend extra main/default branch identity reads.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] Unchanged freshness with a draft branch performs only the active-ref identity calls needed to prove the active ref is unchanged.
- [x] Main/default branch identity is not read on the unchanged draft-branch path when the result is not used.
- [x] The existing no-draft unchanged freshness behavior remains covered.
- [x] Request-count regression tests distinguish draft-branch unchanged freshness from changed freshness and publish/draft comparison paths.
- [x] The freshness result still exposes enough identity/status data for downstream cache records without re-entering bootstrap/config work.

Completed with:

- `pnpm --filter @tentman/web exec vitest run src/lib/server/api-repo-freshness.spec.ts`
- `pnpm --filter @tentman/web run check`
