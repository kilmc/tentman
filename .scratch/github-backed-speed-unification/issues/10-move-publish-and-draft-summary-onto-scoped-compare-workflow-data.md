# 10 — Move publish and draft summary onto scoped compare workflow data

**What to build:** Publish and draft summary use scoped compare workflow data. Small drafts show changed-page/item summary quickly, larger drafts surface progress, and broad full-site document comparison becomes an explicit degraded path instead of a silent normal fallback.

**Blocked by:** 06 — Introduce the app-level workflow-data contract for read routes; 07 — Move GitHub workspace bootstrap and config states behind workflow capabilities.

**Status:** ready-for-agent

- [ ] Publish/draft summary uses compare metadata plus changed documents on the normal path.
- [ ] Small draft summaries reach a useful changed-page/item status within the target budget.
- [ ] Larger drafts show progress or status early instead of leaving users waiting without explanation.
- [ ] Full-site document comparison is avoided on normal scoped paths and reported as degraded or unsupported when unavoidable.
- [ ] Fallbacks and degraded paths are logged with route/workflow identity, source, and reason.
- [ ] Tests cover scoped summary, progress/degraded status, and prevention of silent broad full-site review.
