# 09 — Move GitHub page, item, and block-support views behind workflow capabilities

**What to build:** GitHub page view, item view, and block-support readiness load through route-sized workflow capabilities. Item open/edit stays within the foreground request budget, route/form shell readiness is measured separately from rich editor interactivity, and supporting data such as tag suggestions avoids whole-collection foreground reads.

**Blocked by:** 06 — Introduce the app-level workflow-data contract for read routes; 08 — Move GitHub collection navigation and projection hydration behind workflow capabilities.

**Status:** ready-for-agent

- [ ] Page and item route shells consume normalized page/item workflow payloads.
- [ ] Item open performs at most one missing collection-index request, one item-document route miss, and one block-support miss where needed.
- [ ] Rich editor interactive readiness is measured separately from route/form shell readiness.
- [ ] Block-support misses are scoped and cacheable through the workflow capability.
- [ ] Tag suggestions and existing-item hydration do not read every collection item in the foreground.
- [ ] Tests cover cold and warm item open budgets, page view fallback logging, block-support misses, and route-record error states.
