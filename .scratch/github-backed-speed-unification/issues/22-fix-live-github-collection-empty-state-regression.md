# 22 — Fix live GitHub collection empty-state regression

**What to build:** GitHub-backed collection pages render their indexed items on live Theresa-sized repositories instead of showing an empty collection state when the server has already returned collection index and projection data.

**Blocked by:** 17 — Diagnose cache progress, Review Draft, and return timings.

**Status:** complete

- [x] A repeatable regression covers the live failure shape where a collection has returned index/projection data but the UI renders an empty state.
- [x] Desktop/sidebar GitHub collection pages render item navigation or item cards after indexed projection data is available.
- [x] Empty collection messaging appears only when the loaded collection data genuinely contains no items, not while usable indexed data exists.
- [x] Degraded or mismatched collection data states surface a clear route-data or workflow trace reason instead of silently falling through to an empty state.
- [x] The fix is verified against projects/news-sized collection data, including a collection with about 25 items and one with about 222 items.

## Comments

- Implemented in `/Users/kilmc/code/tentman/tentman/apps/web/src/routes/pages/+layout.svelte`: the collection panel now uses active GitHub route `collectionNavigation` while client collection refreshes are still pending, and route `contentError` is surfaced as the panel error state.
- Regression coverage added in `/Users/kilmc/code/tentman/tentman/apps/web/src/lib/test/browser/manual-navigation-sidebar.svelte.spec.ts` for 25-item and 222-item hydrated route data, plus a degraded route-data error case.
- Verified with:
  - `node /Users/kilmc/code/tentman/tentman/scripts/run-vitest.mjs --browser run --project client src/lib/test/browser/manual-navigation-sidebar.svelte.spec.ts`
  - `node /Users/kilmc/code/tentman/tentman/scripts/run-vitest.mjs --browser run --project client src/lib/test/browser/github-collection-route-cache.svelte.spec.ts`
  - `npm run check`
- 2026-07-17 live QA against `kilmc/theresagrieben` passed the release-risk checks: `/pages/projects` loaded usable collection navigation and showed loading instead of `No items yet`; `/pages/news` was slow but loaded without showing `No items yet`; cache progress jumped as expected when larger collection inventory was discovered.
