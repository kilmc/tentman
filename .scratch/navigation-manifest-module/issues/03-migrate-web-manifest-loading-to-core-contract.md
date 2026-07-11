# 03 — Migrate web manifest loading to the core contract

**What to build:** The web app reads, validates, and represents Navigation Manifest files through the core contract while keeping repository loading, server state, cache behavior, and API workflows owned by the web app.

**Blocked by:** 01 — Add the canonical navigation manifest contract to core.

**Status:** ready-for-agent

- [ ] Web manifest loading uses the core parser and canonical Navigation Manifest types.
- [ ] Invalid manifest state is still reported through the existing web loading/API behavior.
- [ ] Repository read behavior and server-side cache invalidation continue to work with canonical manifests.
- [ ] Web code that only needs ids uses helper behavior rather than reintroducing shorthand manifest parsing.
- [ ] Web loading and API tests cover web-owned behavior without duplicating core parser edge cases.
