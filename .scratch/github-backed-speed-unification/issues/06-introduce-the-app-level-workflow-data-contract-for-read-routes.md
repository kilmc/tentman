# 06 — Introduce the app-level workflow-data contract for read routes

**What to build:** Page and editor callers get one mode-neutral vocabulary for read-route workflow data. The contract names workspace bootstrap, collection navigation, page view, item view, config states, block support, freshness status, route-data identity, and cache-miss results without exposing GitHub tree/blob/ref/cache mechanics or local browser handles.

**Blocked by:** 01 — Add GitHub workflow readiness and request budget instrumentation.

**Status:** ready-for-agent

- [ ] The workflow-data contract defines normalized outputs for bootstrap, collection navigation, page view, item view, config states, block support, freshness, route-data identity, and cache-miss outcomes.
- [ ] The contract keeps GitHub-only tree, blob, ref, IndexedDB, draft branch, and route fallback mechanics out of page/editor caller obligations.
- [ ] The contract keeps local File System Access handles, discovery signatures, and direct-write mechanics out of shared caller obligations.
- [ ] Mode-neutral test fixtures exist for representative root config, page config, Navigation Manifest, collection navigation, page/item view, config-state, block-support, freshness, and cache-miss results.
- [ ] Existing behavior can continue through adapter or compatibility implementations while callers begin migrating to the new vocabulary.
