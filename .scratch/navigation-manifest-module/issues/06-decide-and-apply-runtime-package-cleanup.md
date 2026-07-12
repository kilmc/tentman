# 06 — Decide and apply the runtime package cleanup

**What to build:** `@tentman/runtime` is either reduced to a thin adapter around the core Navigation Manifest helpers or removed/justified as an internal package, without preserving its previous parser shape as an architectural constraint.

**Blocked by:** 01 — Add the canonical navigation manifest contract to core.

**Status:** done

- [x] The runtime package is evaluated against current repo usage and the core manifest contract.
- [x] If runtime remains, its manifest behavior delegates to the canonical core API and has only thin adapter tests. Not applicable: runtime was removed.
- [x] If runtime is removed or otherwise demoted, workspace metadata and tests are updated accordingly.
- [x] The old runtime parser shape is not treated as a compatibility contract.
- [x] The chosen outcome is reflected in tests and, if needed, a short note in the implementation summary.

Implementation summary:

- Confirmed `@tentman/runtime` had no repo consumers beyond its own package files and lockfile entry.
- Removed `packages/runtime` instead of preserving the old parser shape as an adapter contract.
