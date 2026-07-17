# 09 — Move GitHub page, item, and block-support views behind workflow capabilities

**What to build:** GitHub page view, item view, and block-support readiness load through route-sized workflow capabilities. Item open/edit stays within the foreground request budget, route/form shell readiness is measured separately from rich editor interactivity, and supporting data such as tag suggestions avoids whole-collection foreground reads.

**Blocked by:** 06 — Introduce the app-level workflow-data contract for read routes; 08 — Move GitHub collection navigation and projection hydration behind workflow capabilities.

**Status:** complete

- [x] Page and item route shells consume normalized page/item workflow payloads.
- [x] Item open performs at most one missing collection-index request, one item-document route miss, and one block-support miss where needed.
- [x] Rich editor interactive readiness is measured separately from route/form shell readiness.
- [x] Block-support misses are scoped and cacheable through the workflow capability.
- [x] Tag suggestions and existing-item hydration do not read every collection item in the foreground.
- [x] Tests cover cold and warm item open budgets, page view fallback logging, block-support misses, and route-record error states.

## Comments

- Completed in commit `dc22f52`. GitHub page, item, edit, and block-support route shells now consume normalized workflow data; item open/edit budgets are covered by focused browser tests; route-record failures expose structured workflow cache-miss status. Verified with `pnpm run check`, `node scripts/run-vitest.mjs run`, and `node scripts/run-vitest.mjs --browser run --project client src/lib/test/browser/github-collection-route-cache.svelte.spec.ts`.
