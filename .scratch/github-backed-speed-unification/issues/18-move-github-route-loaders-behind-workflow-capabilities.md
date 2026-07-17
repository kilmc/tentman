# 18 — Move GitHub route loaders behind workflow capabilities

**What to build:** GitHub page and item route loaders consume app-level workflow capabilities instead of coordinating GitHub cache mechanics directly. Route callers ask for collection, page, item, block-support, and cache-miss workflow data without knowing about cache hydration internals.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Page and item route loaders no longer import the GitHub repository cache store directly.
- [ ] A workflow capability surface owns GitHub bootstrap hydration, route cache misses, and cache-backed page/item/collection workflow data assembly underneath.
- [ ] Existing collection, singleton page, item view, and item edit route payload behavior is preserved.
- [ ] Request-budget and route-data regression tests assert behavior through the workflow capability surface rather than cache-store method names.
- [ ] Compatibility fallback logging remains behind the workflow-data boundary and continues to report route, source, and reason when it fires.
