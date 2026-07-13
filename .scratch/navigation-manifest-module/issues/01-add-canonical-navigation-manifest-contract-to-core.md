# 01 — Add the canonical navigation manifest contract to core

**What to build:** `@tentman/core` exposes one browser-safe Navigation Manifest API that accepts existing shorthand references, returns canonical Navigation Reference objects, serializes the canonical shape, and has the exhaustive contract tests for parsing, validation, serialization, lookup, and reference helpers.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] The core Navigation Manifest API parses valid manifests into canonical reference objects while accepting shorthand string references for compatibility.
- [x] The core parser strictly rejects malformed manifest structure and malformed references with useful errors.
- [x] The core serializer emits canonical Navigation Reference objects so existing shorthand manifests normalize lazily on write.
- [x] The core API includes collection/group lookup and reference helper behavior covered by contract tests.
- [x] The focused manifest API is available through an intention-revealing core export while compatibility re-exports remain where needed.

Implementation summary:

- Completed in `c50989c` with the core Navigation Manifest API exported from `@tentman/core/navigation-manifest`.
- Verified the core contract accepts shorthand input, returns canonical `{ id }` references, serializes canonical references, and covers lookup/reference helpers in core tests.
