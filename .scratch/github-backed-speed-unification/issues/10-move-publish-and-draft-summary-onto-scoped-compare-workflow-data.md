# 10 — Move publish and draft summary onto scoped compare workflow data

**What to build:** Publish and draft summary use scoped compare workflow data. Small drafts show changed-page/item summary quickly, larger drafts surface progress, and broad full-site document comparison becomes an explicit degraded path instead of a silent normal fallback.

**Blocked by:** 06 — Introduce the app-level workflow-data contract for read routes; 07 — Move GitHub workspace bootstrap and config states behind workflow capabilities.

**Status:** complete

- [x] Publish/draft summary uses compare metadata plus changed documents on the normal path.
- [x] Small draft summaries reach a useful changed-page/item status within the target budget.
- [x] Larger drafts show progress or status early instead of leaving users waiting without explanation.
- [x] Full-site document comparison is avoided on normal scoped paths and reported as degraded or unsupported when unavoidable.
- [x] Fallbacks and degraded paths are logged with route/workflow identity, source, and reason.
- [x] Tests cover scoped summary, progress/degraded status, and prevention of silent broad full-site review.

## Comments

- Completed in commit `c9212eb`. Publish review and pages overview now use scoped compare metadata and changed-document review on the normal path, avoid broad collection/site comparison, surface degraded status in `/publish` and `/pages`, and log degraded paths with route, source, slug, and reason.
- Verified with `npm run check`, focused server/model tests, focused browser specs for the changed UI, and the full server Vitest suite. The full browser Vitest project was also run; it failed in unrelated pre-existing specs outside this ticket scope.
