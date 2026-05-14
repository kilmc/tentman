# Close Out Reference-Based Content Component Placement

## Summary

Finish the feature as a full-system implementation, not just a working editor slice.

The feature should only be considered complete when:

- all real markdown render surfaces that can encounter content-component directives use the shared reference-aware runtime
- invalid `referenceFor` bindings are caught as hard project diagnostics in doctor/CI, not only via downstream editor/runtime failures
- test coverage proves config validation, reference resolution, preview/render parity, and at least one real runtime consumer path

## Key Changes

### 1. Add project-level cross-validation for reference bindings

Implement a shared validator that checks repo config blocks against discovered content components.

It must fail when:

- `referenceFor` points to a missing component id
- `referenceFor` points to a missing attribute id
- `referenceFor` points to an attribute that is not `reference: true`
- multiple source fields create duplicate tokens for the same binding within one content item
- component config is internally valid but incompatible with the binding contract declared in content config

Wire this into project diagnostics and CI so these become hard errors in `doctor` and `runTentmanCi`, not just UI/runtime issues.

Public surface change:

- add one shared project-level reference validation entrypoint in core that accepts discovered components plus parsed config block trees and returns diagnostics
- `doctorTentmanProject()` and CI should invoke it directly

### 2. Make all real render surfaces consume the shared runtime contract

Remove remaining ad hoc markdown/component rendering paths that bypass reference-aware resolution.

Required behavior:

- every runtime renderer that can encounter content components must resolve instances through the shared `{ attributes, data }` path
- render-time reference resolution must receive the current content item plus the computed reference index
- block and inline directives must both use the same policy path
- unresolved references must fail consistently rather than silently rendering with missing `data`

For the current repo, the known gap is the test app markdown renderer in `apps/test-app/src/lib/content/markdown.ts`, which currently parses directives itself and renders without reference context. Replace or adapt that path so it either:

- uses the mdsvex/shared pipeline directly, or
- builds and passes `contentItem` + `referenceIndex` into the shared render helpers for both block and inline directives

Decision:

- the test app counts as a real runtime surface and must be brought into parity now

### 3. Tighten validation and parity around the core contract

Keep the current shared runtime, but close the remaining spec gaps explicitly.

Add or verify behavior for:

- `referenceScope` string form for `self`, `container`, and `full`
- object-form `referenceScope` with differing preview/render values
- `referenceFor` single-string and array forms
- top-level primitive, sibling object, nested non-collection object, and collection-item sources
- required reference attributes vs defaulted reference attributes resolving through the same path
- `data: null` on unresolved preview resolution, with save still blocked
- render prop mappings limited to `attributes.*` and `data.*`

Do not add fallback behavior for invalid bindings. Invalid config should stay invalid.

### 4. Raise the test bar from focused slice to system confidence

Keep the current focused suites, but extend them where the audit found blind spots.

Add tests for:

- invalid `referenceFor` target: missing component
- invalid `referenceFor` target: missing attribute
- invalid `referenceFor` target: attribute exists but is not `reference: true`
- `referenceScope: "self"` resolution
- `referenceScope: "full"` string-form resolution
- doctor/CI surfacing reference-binding diagnostics as hard errors
- one real runtime consumer path rendering referenced components with actual `contentItem` + `referenceIndex` wiring
- one failure case in that runtime path for unresolved references

Acceptance criterion:

- core reference tests, mdsvex tests, web unit tests, and browser harness remain green
- new project-validation and runtime-consumer tests prove the remaining system seams are closed

## Important Interfaces

Additions or changes should stay minimal and shared-first:

- new core helper for validating `referenceFor` bindings against discovered components and config blocks
- `doctorTentmanProject()` and CI call that helper and surface its diagnostics
- any runtime adapter API must accept the current content item and reference index explicitly when rendering reference-aware components
- no new parallel reference policy should be added on the web side or in the test app

## Test Plan

Run and keep green:

- `packages/core` reference/content-component tests
- `packages/mdsvex` directive/render-target tests
- `apps/web` reference, preview, validation, and Playwright markdown-field tests

Add coverage for:

- project-level invalid binding diagnostics
- doctor/CI failure on invalid binding config
- `self`/`full` scope coverage
- real runtime consumer parity with reference-aware render context

## Assumptions and Defaults

- “Done” means all real render surfaces in this repo, including the test app, are aligned with the shared runtime
- invalid `referenceFor` bindings should be hard project errors now, not warnings
- no backward-compatibility layer is needed for pre-reference partial behavior
- the shared core runtime remains the only policy source; downstream code should adapt to it, not re-encode the rules
