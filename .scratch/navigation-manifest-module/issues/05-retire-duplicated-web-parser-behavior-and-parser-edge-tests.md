# 05 — Retire duplicated web parser behavior and parser edge tests

**What to build:** The web app no longer owns duplicate Navigation Manifest parsing/reference semantics, and its test suite focuses on web responsibilities now that core owns the manifest contract.

**Blocked by:** 04 — Make web manifest writes emit canonical references.

**Status:** resolved

- [x] Duplicate web parser and reference-normalization code is removed or delegated to the core manifest API.
- [x] Web parser edge-case tests that now belong to core are removed or rewritten as web behavior tests.
- [x] Web tests still cover repository loading, cache behavior, write flows, stable-id repair, group mutations, API behavior, and UI behavior.
- [x] No web code path produces new shorthand manifest references after cleanup.
- [x] The web test suite and type checks pass after the old parser behavior is retired.

Implementation summary:

- Completed in `2d7cf5e`, which retired duplicated web parser coverage and delegated manifest parsing/reference semantics to the core manifest API.
- Current verification found no web-owned Navigation Manifest parser/normalizer functions; parser edge cases live in `packages/core/src/manifest.test.js`.
- Web tests now focus on web-owned loading, caching, write flows, stable-id repair, group mutations, and API behavior.
