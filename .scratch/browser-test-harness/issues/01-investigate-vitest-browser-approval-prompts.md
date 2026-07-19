# Investigate Vitest Browser Approval Prompts

Status: ready-for-human
Type: research

## Problem

During collection group debugging on July 18, 2026, ordinary server/unit Vitest commands and `pnpm --filter @tentman/web run check` ran without approval, but `VITEST_BROWSER=1 pnpm exec vitest run --project client ...` repeatedly required approval because the browser runner binds to localhost.

This makes browser regression work noisy and slow. Running tests should not require repeated approval when the command is a repo-local test command.

## Commands That Required Approval

These commands were run from `/Users/kilmc/code/tentman/tentman/apps/web` and required escalation/approval:

```sh
VITEST_BROWSER=1 pnpm exec vitest run --project client src/lib/test/browser/collection-groups-page.svelte.spec.ts
```

```sh
VITEST_BROWSER=1 pnpm exec vitest run --project client src/lib/test/browser/manual-navigation-sidebar.svelte.spec.ts
```

```sh
VITEST_BROWSER=1 pnpm exec vitest run --project client src/lib/test/browser/item-edit-page.svelte.spec.ts src/lib/test/browser/new-item-page.svelte.spec.ts
```

```sh
VITEST_BROWSER=1 pnpm exec vitest run --project client src/lib/test/browser/item-edit-page.svelte.spec.ts -t "syncs local item group selection"
```

```sh
VITEST_BROWSER=1 pnpm exec vitest run --project client src/lib/stores/github-repository-cache.svelte.spec.ts -t "patches"
```

```sh
VITEST_BROWSER=1 pnpm exec vitest run --project client src/lib/stores/github-repository-cache.svelte.spec.ts src/lib/test/browser/collection-groups-page.svelte.spec.ts src/lib/test/browser/manual-navigation-sidebar.svelte.spec.ts
```

```sh
VITEST_BROWSER=1 pnpm exec vitest run --project client src/lib/stores/github-repository-cache.svelte.spec.ts src/lib/test/browser/collection-groups-page.svelte.spec.ts src/lib/test/browser/manual-navigation-sidebar.svelte.spec.ts src/lib/test/browser/item-edit-page.svelte.spec.ts
```

The initial sandboxed failure mode looked like:

```text
Error: listen EPERM: operation not permitted 127.0.0.1:<port>
```

## Commands That Did Not Need Approval

These similar non-browser commands ran without approval:

```sh
pnpm exec vitest run src/lib/features/content-management/navigation.spec.ts src/lib/features/content-management/navigation-group-options.spec.ts
```

```sh
pnpm exec vitest run src/lib/features/content-management/pages-workspace-adapters.spec.ts src/lib/features/content-management/navigation.spec.ts src/lib/features/content-management/navigation-group-options.spec.ts
```

```sh
pnpm --filter @tentman/web run check
```

## Investigation Questions

- Can the approval policy allow repo-local `VITEST_BROWSER=1 pnpm exec vitest run --project client ...` commands without broadly allowing arbitrary network/server processes?
- Is the approval caused specifically by binding `127.0.0.1` with Vitest browser API ports?
- Would using an already-approved wrapper script such as `scripts/run-vitest.mjs` avoid prompts for browser tests?
- Should the repo add a stable script like `pnpm --filter @tentman/web run test:browser:file -- <spec>` and request approval for that narrower prefix?
- Can Vitest browser be configured to use a fixed approved host/port pattern, or does the dynamic port make the sandbox treat every run as new?

## Desired Outcome

Codex should be able to run focused browser regression tests in this repo without asking for approval every time, while still preserving the safety boundary for arbitrary local servers or network access.

## Comments

