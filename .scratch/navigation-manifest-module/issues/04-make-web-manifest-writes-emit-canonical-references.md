# 04 — Make web manifest writes emit canonical references

**What to build:** Web rebuild, save, repair, and group mutation flows write canonical Navigation Reference objects whenever Tentman persists a Navigation Manifest, while draft and interaction code may still use plain ids where that keeps app code ergonomic.

**Blocked by:** 03 — Migrate web manifest loading to the core contract.

**Status:** resolved

- [x] Web manifest creation and rebuild flows persist canonical Navigation Reference objects.
- [x] Web save and repair flows lazily normalize existing shorthand manifests on write.
- [x] Group mutation and ordering flows preserve behavior while writing canonical manifest references.
- [x] Draft or UI interaction types can continue to pass around string ids without leaking shorthand references into persisted manifests.
- [x] Tests prove written manifests use the canonical shape across the main write paths.

Implementation summary:

- Completed in `55c30ac`, which added web write-flow coverage proving manifests are persisted through canonical Navigation Reference objects.
- The current web write boundary funnels manifest persistence through `writeNavigationManifest`, which serializes with the core `serializeNavigationManifest` helper.
- Follow-up verification in `6cbacaf` confirmed `save-manifest` API payloads are parsed through the core parser before being written.
