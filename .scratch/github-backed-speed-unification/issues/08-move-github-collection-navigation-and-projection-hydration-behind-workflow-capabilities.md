# 08 — Move GitHub collection navigation and projection hydration behind workflow capabilities

**What to build:** GitHub collection landing and warm reload run through workflow capabilities for collection navigation and visible projection hydration. Collection landing stays scoped to collection index plus one visible projection batch, and warm reload uses cached identities without foreground GitHub calls.

**Blocked by:** 04 — Make GitHub cache work prioritized, deduped, cancelable, and rate-limit-aware; 06 — Introduce the app-level workflow-data contract for read routes.

**Status:** ready-for-agent

- [ ] Collection landing loads collection header/navigation and first visible projections through the workflow contract.
- [ ] Cold collection landing performs at most one collection-index request and one visible projection batch request on the foreground path.
- [ ] Visible projection batches remain capped and do not trigger item-view, page-view, or full-document foreground calls for collection readiness.
- [ ] Warm collection reload with matching route-data identities performs zero foreground index, projection, or blob calls.
- [ ] Cache misses log exact reasons such as missing record, stale identity, schema mismatch, blob identity mismatch, or cache read failure.
- [ ] Tests assert cold collection budget, warm reload zero-call behavior, and useful error/degraded status for failed route records.
