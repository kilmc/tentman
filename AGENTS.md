# Tentman Agent Notes

- Use the workspace root at `/Users/kilmc/code/tentman/tentman`.
- Repository scope is strictly limited to `kilmc/tentman`.
- Do not view, inspect, edit, create, comment on, or otherwise interact with any other GitHub repository unless the user explicitly changes that instruction in this repo or in the active conversation.
- Node is pinned in `.nvmrc` and `.node-version`.
- pnpm is pinned via the root `package.json` `packageManager` field.
- Prefer `corepack pnpm` for installs, removes, execs, and lockfile updates.
- Before using plain `pnpm`, verify `pnpm -v` matches the pinned version in `package.json`.
- If `pnpm` resolves to the wrong version, run `corepack enable pnpm` and retry.

## 0.1.0 Workflow

- Work through `0.1.0` issues one at a time.
- Do not use sub-agents unless the user explicitly requests them.
- Prefer a single active implementation track at a time.
- If worktrees are used, prefer one active issue worktree unless the user explicitly approves more.
- Start each issue by clarifying the exact problem, confirming scope, and restating what done means.
- Reproduce the issue before fixing it whenever practical.
- For regressions, prefer restoring or adding test coverage close to the broken behavior.
- Prefer the smallest real fix that satisfies the issue over broad opportunistic refactors.
- Run targeted verification first, then broader baseline checks as appropriate.
- Run Vitest through the stable wrapper command so the user's persisted approval rule applies:
  `node /Users/kilmc/code/tentman/tentman/scripts/run-vitest.mjs ...`
- For browser Vitest, use the same wrapper with `--browser`, for example:
  `node /Users/kilmc/code/tentman/tentman/scripts/run-vitest.mjs --browser run --project client src/lib/test/browser/example.svelte.spec.ts`
- Do not run browser Vitest directly with `VITEST_BROWSER=1 pnpm ...`; it binds a local test server and will repeatedly prompt for sandbox escalation instead of reusing the wrapper approval.
- If new work appears during implementation, create or update a follow-up issue instead of silently expanding scope.
- End each completed issue with a short verification summary and any remaining risks or follow-ups.

## Per-Issue Checklist

- Clarify the user-facing problem and acceptance criteria.
- Reproduce the current behavior or identify the relevant failing test.
- Confirm what is in scope and what is deferred.
- Implement the fix with minimal necessary surface area.
- Verify with the most relevant tests and checks.
- Document any follow-up work in GitHub issues rather than folding it into the current fix.
