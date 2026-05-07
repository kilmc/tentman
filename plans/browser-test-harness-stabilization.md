# Browser Test Harness Stabilization

## Summary

Stabilize the `VITEST_BROWSER=1` harness for `/Users/kilmc/code/tentman/tentman/apps/web` before resuming content-components work. The goal is to make focused browser runs start reliably, exit cleanly, and produce actionable signal with minimal noise.

This is a harness-first pass, not a feature pass. The work should distinguish between real harness bugs, environment constraints, stale browser expectations, and harmless warning noise.

## Diagnosis

### 1. Real harness bugs

- `apps/web/vite.config.ts` currently runs `pnpm exec svelte-kit sync` at config-load time for browser-enabled runs.
- That makes every browser Vitest startup mutate shared `.svelte-kit` state and creates a race when multiple browser invocations start near each other.
- We reproduced this class of failure locally as intermittent `.svelte-kit` type generation errors such as `ENOENT ... .svelte-kit/types/src/routes/proxy+layout.ts`.
- Heavy `MarkdownField` browser runs often advance deep into execution, emit repeated `derived_inert` warnings, and then fail to exit cleanly, leaving `vitest` and Chromium/headless-shell processes behind.
- The most likely teardown hotspots are async `tick` / `queueMicrotask` continuations in `src/lib/components/form/MarkdownField.svelte` and async editor callbacks in `src/lib/features/markdown-editor/create-editor.ts` that can still fire after destroy.

### 2. Environment constraints

- In this Codex sandbox, browser Vitest requires unsandboxed local port binding.
- `listen EPERM ... 127.0.0.1:<ephemeral>` is an execution-environment limitation here, not a repo bug.
- Keeping browser API binding on `127.0.0.1` with an ephemeral port is still the right repo default for local unsandboxed runs and CI.

### 3. Stale tests

- Some recent “browser failures” were stale expectations rather than harness defects.
- Modifier-click tests should use provider-supported Playwright modifiers, not `{ metaKey: true }`.
- Link popover tests should follow the current popover flow rather than older prompt-based or older native-link expectations.

### 4. Harmless versus meaningful warning noise

- Compile-time Svelte warnings such as `state_referenced_locally` in unrelated form components are real cleanup candidates, but they are not the current browser blocker if runs still pass and exit.
- Repeated `derived_inert` warnings during `MarkdownField` browser tests are not safe to dismiss as harmless noise because they correlate with teardown instability and hanging runs.

## Decisions

- Keep the Vitest `projects` split between server/node and browser/client coverage.
- Keep `extends: true` in Vitest project config.
- Keep explicit browser API binding on `127.0.0.1` with `port: 0`.
- Do not use `browser.isolate`; it is deprecated upstream. Use project-level `isolate: true` instead.
- Keep browser file execution serialized with `fileParallelism: false`.
- Treat `svelte-kit sync` as an explicit pre-step, not a config-time side effect.
- Treat browser tests as a small, behavior-focused layer for real browser interactions, not as the primary home for parser/serialization assertions.

## Implementation Changes

### 1. Make startup deterministic

- Update `apps/web/vite.config.ts` to remove config-time `execFileSync('pnpm', ['exec', 'svelte-kit', 'sync'])`.
- Keep the browser project behind `VITEST_BROWSER=1`.
- Keep browser-specific `api.host` / `api.port` config.
- Add explicit client-project `isolate: true`.
- Keep `browser.fileParallelism: false`.
- Do not add `browser.isolate`; use top-level `isolate`.

Rationale:

- Vite/Vitest config loading should stay as close to pure as possible.
- Removing config-time sync eliminates a shared generated-state writer during startup and should remove the most obvious source of `.svelte-kit` race failures.

### 2. Move sync into scripts and workflow

- Add dedicated browser-test scripts in `apps/web/package.json` that run `svelte-kit sync` before browser Vitest.
- Provide at least:
  - one focused browser-file runner for local use
  - one full browser-project runner for CI
- Keep these scripts harness-focused and avoid mixing them with unrelated `check` commands.

Rationale:

- Upstream SvelteKit expects `svelte-kit sync` to be run explicitly via `prepare`/tooling, but not on every config evaluation.
- An explicit pre-step is easier to reason about and easier to reproduce in CI.

### 3. Harden browser cleanup

- Expand `apps/web/vitest-setup-client.ts` from basic style reset/mocks into a stricter browser cleanup layer.
- Preserve the current:
  - `document.body.style.overflow = ''`
  - `document.documentElement.style.overflow = ''`
  - `vi.restoreAllMocks()`
- Add minimal additional cleanup only if it directly reduces observed leakage:
  - clear any overlay/popover DOM leftovers that survive test teardown
  - clear registry/plugin caches if real modules, rather than mocks, are involved in browser specs

Rationale:

- The setup file should be the first place to centralize browser-test cleanup rather than repeating test-local teardown.

### 4. Fix `MarkdownField` teardown and post-destroy callbacks

- In `src/lib/components/form/MarkdownField.svelte`, add a destroyed or mounted guard that all async continuations respect.
- Guard every `queueMicrotask` / `tick` continuation that can mutate state or focus DOM after unmount.
- Ensure popover and dialog state is dismissed during destroy rather than relying on later effects.
- Avoid focus-return or selection-follow-up work after destroy.
- In `src/lib/features/markdown-editor/create-editor.ts`, add a destroyed guard so:
  - `onLinkClick`
  - `onUiChange`
  - `onMarkdownChange`
  - image insert follow-up callbacks
  become no-ops after `destroy()`.

Rationale:

- The repeated `derived_inert` warnings strongly suggest derived/effect reads are still happening after the owning effect tree has been torn down.
- The harness is noisy because the component lifecycle is currently leaking work past teardown.

### 5. Reduce browser-test surface area

- Keep browser tests for real browser behavior only:
  - focus and keyboard behavior
  - modifier clicks
  - popovers/dialogs
  - rich editor interaction smoke coverage
  - upload / drag-drop behavior if provider-specific
- Move or keep pure content-shape assertions in node/unit tests where possible:
  - markdown/content-component parsing
  - serialization canonicalization
  - content transformation logic
- If `MarkdownField.svelte.spec.ts` is carrying too many mixed concerns, split it into smaller browser-focused specs by behavior area instead of one very large file.

Rationale:

- Browser mode is recommended upstream for component behavior in real browsers, but it should stay targeted at user-facing interactions rather than becoming the heaviest assertion layer in the suite.

## Command Strategy

### Local developer workflow

- Use explicit sync before browser runs.
- Prefer single-file or single-test-name runs while debugging harness issues.
- Do not run multiple browser Vitest commands in parallel against the same workspace.
- If a run hangs, kill lingering `vitest` and `headless_shell` processes before rerunning.

Recommended local pattern:

```bash
pnpm exec svelte-kit sync
VITEST_BROWSER=1 pnpm exec vitest run --project client src/lib/components/form/SelectField.svelte.spec.ts
```

Recommended focused-debug pattern:

```bash
pnpm exec svelte-kit sync
VITEST_BROWSER=1 pnpm exec vitest run --project client src/lib/components/form/MarkdownField.svelte.spec.ts -t "opens native links on modifier click"
```

### CI workflow

- Put browser tests in a dedicated job separate from general node/server tests.
- Run `pnpm exec svelte-kit sync` once before the browser suite.
- Run the browser project with serialized file execution.
- Add a timeout and cleanup step so failed or hung Playwright children do not poison the job.

### Known execution-environment limitation

- Browser Vitest will continue to fail in this Codex sandbox without unsandboxed local binding permissions.
- Treat sandbox `EPERM` browser startup failures as non-actionable environment constraints, not repo regressions.

## Must Fix Now

- Remove config-time `svelte-kit sync` from `apps/web/vite.config.ts`.
- Add explicit browser scripts/workflow that sync before running.
- Keep explicit browser API host/port config.
- Make client-project isolation explicit with `isolate: true`.
- Keep `fileParallelism: false`.
- Harden `MarkdownField` and editor destroy paths so focused browser runs exit cleanly.

## Acceptable Known Limitations

- Browser tests require unsandboxed local binding in this execution environment.
- Some compile-time Svelte warnings outside the failing editor path may remain temporarily if runs are otherwise stable and cleanly exiting.
- Full browser coverage can remain narrow while the browser layer is stabilized; node/unit tests should continue carrying most serialization and content-shape coverage.

## Verification

### Small control runs

- `SelectField.svelte.spec.ts` browser run passes cleanly.
- One focused `MarkdownField` browser test starts cleanly and exits cleanly.

### Harness reliability checks

- Repeated reruns of the same focused browser file do not require manual `.svelte-kit` cleanup.
- No `.svelte-kit` `ENOENT` startup failure after removing config-time sync.
- No lingering Vitest/Chromium processes after a passing focused `MarkdownField` run.

### Scope checks

- Browser tests still cover modifier-click and popover behavior with provider-supported interactions.
- Parser and serialization assertions remain covered by node/unit tests.

## Implementation Prompt

Use this prompt to implement the work:

```text
Stabilize the browser test harness in `/Users/kilmc/code/tentman/tentman/apps/web` using the plan in:
`/Users/kilmc/code/tentman/tentman/plans/browser-test-harness-stabilization.md`

Constraints:
- Keep changes minimal and harness-focused.
- Do not revert unrelated dirty worktree changes.
- Do not treat this as content-components feature work.
- Preserve the current Vitest projects split and keep `extends: true`.
- Remove config-time `svelte-kit sync` from `apps/web/vite.config.ts` and replace it with explicit script/workflow support.
- Use top-level/project `isolate: true`, not `browser.isolate`.
- Keep explicit browser API binding on localhost with an ephemeral port.
- Keep browser file execution serialized.
- Harden `MarkdownField` and `create-editor` teardown so focused browser runs exit cleanly without lingering processes or repeated `derived_inert` teardown noise.
- Keep browser tests focused on real browser behavior; do not expand browser coverage unnecessarily.

Required verification:
- Run the smallest focused browser commands that prove the startup and teardown fixes.
- Report clearly which failures were harness bugs, which were environment constraints, and which were stale tests or warning noise.
```
