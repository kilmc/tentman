# 07 — Move GitHub workspace bootstrap and config states behind workflow capabilities

**What to build:** GitHub workspace bootstrap and config-state callers consume normalized workflow outputs. Narrow route-data needs no longer re-enter broad bootstrap on normal paths, while compatibility fallbacks remain available behind the capability boundary and are logged with enough detail to retire later.

**Blocked by:** 06 — Introduce the app-level workflow-data contract for read routes.

**Status:** ready-for-agent

- [ ] GitHub workspace bootstrap returns normalized shell, root config, page list, Navigation Manifest, sidebar-ready state, and relevant status output through the workflow contract.
- [ ] Config-state loading is available as a scoped workflow capability without forcing broad bootstrap or config parsing on unchanged freshness paths.
- [ ] First repository open does not immediately repeat broad config/bootstrap work for freshness.
- [ ] Compatibility fallbacks remain behind the workflow capability boundary and log route, source, and reason whenever used.
- [ ] Tests cover normal bootstrap, config-state, fallback logging, and unchanged-freshness separation.
