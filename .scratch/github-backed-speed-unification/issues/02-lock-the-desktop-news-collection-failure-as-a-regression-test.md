# 02 — Lock the desktop `news` collection failure as a regression test

**What to build:** The desktop/sidebar-present GitHub collection path that exposed the `news` loading failure is captured as a repeatable regression test. The test proves collection readiness is not hidden by compact viewport behavior, repeated config-state requests, or background warming competing with visible collection work.

**Blocked by:** 01 — Add GitHub workflow readiness and request budget instrumentation.

**Status:** resolved

- [x] A browser or integration test exercises a desktop GitHub collection landing with the sidebar/list path visible.
- [x] The test asserts that collection header/navigation and the first visible projection batch reach a usable state instead of remaining indefinitely on loading UI.
- [x] The test fails if config-state or equivalent bootstrap work loops repeatedly while the collection is loading.
- [x] The test fails if full-document warming competes with collection landing readiness on the foreground path.
- [x] The test records the workflow marks and request-budget evidence needed to diagnose failures.

## Comments

- Completed in `f45974f` (`test: lock GitHub news collection landing readiness`). Added a desktop GitHub `/pages/news` browser regression with workflow/request-budget evidence, traced `config-states`, and marked desktop collection readiness after the visible projection batch. Verified with `npm run check`, `node scripts/run-vitest.mjs run`, and the focused browser spec `manual-navigation-sidebar.svelte.spec.ts`.
