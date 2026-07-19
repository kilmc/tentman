# 19 — Move local edit workflow assembly behind local capabilities

**What to build:** Local page and item edit flows satisfy the same workflow vocabulary as GitHub mode without page components assembling route workflow data from local repository stores and content services themselves.

**Blocked by:** None — can start immediately.

**Status:** complete

- [x] Local singleton page edit and item edit components consume local workflow capabilities rather than assembling workflow data in component state.
- [x] Local File System Access, discovery signatures, direct reads/writes, preview URL resolution, recovery cleanup, and rescan/remount behavior stay local-specific underneath the capability surface.
- [x] Existing local edit, save, recovery, and preview behavior is preserved.
- [x] Boundary coverage proves local edit components do not need local repository store, local content store, or local workflow view-data factory imports.
- [x] Shared workflow vocabulary remains mode-neutral and does not require local callers to inherit GitHub cache or draft-branch mechanics.
