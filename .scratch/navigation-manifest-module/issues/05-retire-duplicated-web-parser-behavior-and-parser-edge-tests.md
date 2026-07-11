# 05 — Retire duplicated web parser behavior and parser edge tests

**What to build:** The web app no longer owns duplicate Navigation Manifest parsing/reference semantics, and its test suite focuses on web responsibilities now that core owns the manifest contract.

**Blocked by:** 04 — Make web manifest writes emit canonical references.

**Status:** ready-for-agent

- [ ] Duplicate web parser and reference-normalization code is removed or delegated to the core manifest API.
- [ ] Web parser edge-case tests that now belong to core are removed or rewritten as web behavior tests.
- [ ] Web tests still cover repository loading, cache behavior, write flows, stable-id repair, group mutations, API behavior, and UI behavior.
- [ ] No web code path produces new shorthand manifest references after cleanup.
- [ ] The web test suite and type checks pass after the old parser behavior is retired.
