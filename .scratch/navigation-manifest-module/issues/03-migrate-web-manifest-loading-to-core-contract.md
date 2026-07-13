# 03 — Migrate web manifest loading to the core contract

**What to build:** The web app reads, validates, and represents Navigation Manifest files through the core contract while keeping repository loading, server state, cache behavior, and API workflows owned by the web app.

**Blocked by:** 01 — Add the canonical navigation manifest contract to core.

**Status:** resolved

- [x] Web manifest loading uses the core parser and canonical Navigation Manifest types.
- [x] Invalid manifest state is still reported through the existing web loading/API behavior.
- [x] Repository read behavior and server-side cache invalidation continue to work with canonical manifests.
- [x] Web code that only needs ids uses helper behavior rather than reintroducing shorthand manifest parsing.
- [x] Web loading and API tests cover web-owned behavior without duplicating core parser edge cases.

Implementation summary:

- `01855af` moved web manifest loading to `parseNavigationManifest` from `@tentman/core/navigation-manifest` while preserving web-owned repository reads, cache behavior, and invalid-manifest state.
- `6cbacaf` closed the remaining representation gap by making the web `NavigationManifest` type canonical, keeping shorthand compatibility at `NavigationManifestInput` write/request boundaries, and ensuring in-memory group sync constructs canonical Navigation References.
- Verification after `6cbacaf`: `pnpm --filter @tentman/web run check`, focused web manifest/navigation tests, `pnpm run test:core`, and `pnpm test`.
