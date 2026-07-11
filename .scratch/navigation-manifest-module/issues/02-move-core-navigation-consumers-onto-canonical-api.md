# 02 — Move core navigation consumers onto the canonical manifest API

**What to build:** Core navigation diagnostics, refresh, print, explain, and related behavior use the canonical Navigation Manifest helpers instead of carrying separate schema/reference logic, while existing core behavior remains compatible for callers.

**Blocked by:** 01 — Add the canonical navigation manifest contract to core.

**Status:** ready-for-agent

- [ ] Core navigation diagnostics use the canonical manifest helpers for reference ids, lookup, and semantic checks.
- [ ] Core navigation refresh/rebuild behavior preserves user-facing behavior while working from canonical Navigation Reference objects.
- [ ] Core navigation print/explain behavior continues to report the same meaningful ordering and reference information.
- [ ] Existing core tests pass after duplicated manifest semantics are removed or delegated to the canonical API.
- [ ] Any new helper behavior needed by diagnostics is pure and does not take on repository loading or discovery responsibilities.
