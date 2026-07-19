# 08 — Move GitHub collection navigation and projection hydration behind workflow capabilities

**What to build:** GitHub collection landing and warm reload run through workflow capabilities for collection navigation and visible projection hydration. Collection landing stays scoped to collection index plus one visible projection batch, and warm reload uses cached identities without foreground GitHub calls.

**Blocked by:** 04 — Make GitHub cache work prioritized, deduped, cancelable, and rate-limit-aware; 06 — Introduce the app-level workflow-data contract for read routes.

**Status:** complete

- [x] Collection landing loads collection header/navigation and first visible projections through the workflow contract.
- [x] Cold collection landing performs at most one collection-index request and one visible projection batch request on the foreground path.
- [x] Visible projection batches remain capped and do not trigger item-view, page-view, or full-document foreground calls for collection readiness.
- [x] Warm collection reload with matching route-data identities performs zero foreground index, projection, or blob calls.
- [x] Cache misses log exact reasons such as missing record, stale identity, schema mismatch, blob identity mismatch, or cache read failure.
- [x] Tests assert cold collection budget, warm reload zero-call behavior, and useful error/degraded status for failed route records.

## Comments

- Completed in commit `7edebc8`. Collection landing now returns normalized workflow navigation data with visible projection hydration, preserves the cold foreground budget, keeps warm reloads on cached route identities, and logs exact cache-miss/degraded route-record reasons.
