# 04 — Make web manifest writes emit canonical references

**What to build:** Web rebuild, save, repair, and group mutation flows write canonical Navigation Reference objects whenever Tentman persists a Navigation Manifest, while draft and interaction code may still use plain ids where that keeps app code ergonomic.

**Blocked by:** 03 — Migrate web manifest loading to the core contract.

**Status:** ready-for-agent

- [ ] Web manifest creation and rebuild flows persist canonical Navigation Reference objects.
- [ ] Web save and repair flows lazily normalize existing shorthand manifests on write.
- [ ] Group mutation and ordering flows preserve behavior while writing canonical manifest references.
- [ ] Draft or UI interaction types can continue to pass around string ids without leaking shorthand references into persisted manifests.
- [ ] Tests prove written manifests use the canonical shape across the main write paths.
