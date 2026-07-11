# 06 — Decide and apply the runtime package cleanup

**What to build:** `@tentman/runtime` is either reduced to a thin adapter around the core Navigation Manifest helpers or removed/justified as an internal package, without preserving its previous parser shape as an architectural constraint.

**Blocked by:** 01 — Add the canonical navigation manifest contract to core.

**Status:** ready-for-agent

- [ ] The runtime package is evaluated against current repo usage and the core manifest contract.
- [ ] If runtime remains, its manifest behavior delegates to the canonical core API and has only thin adapter tests.
- [ ] If runtime is removed or otherwise demoted, workspace metadata and tests are updated accordingly.
- [ ] The old runtime parser shape is not treated as a compatibility contract.
- [ ] The chosen outcome is reflected in tests and, if needed, a short note in the implementation summary.
