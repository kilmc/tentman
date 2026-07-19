# 21 — Clean up workflow boundary smells and readiness names

**What to build:** Remaining release QA boundary smells are cleaned up after the primary blockers: local workflow identity stops relying on GitHub-shaped identity fields where possible, GitHub draft branch names stay adapter-private, and workflow readiness names accurately describe page, item, and editor readiness.

**Blocked by:** 18 — Move GitHub route loaders behind workflow capabilities; 19 — Move local edit workflow assembly behind local capabilities.

**Status:** complete

- [x] Local workflow identity can be expressed with local dataset/discovery vocabulary without exposing GitHub-shaped ref, head, or tree fields to callers.
- [x] Shared workflow identity remains opaque and sufficient for cache/readiness comparisons in both local and GitHub modes.
- [x] Draft branch names are kept inside the GitHub adapter unless there is a documented mode-neutral mutation outcome that requires them.
- [x] Shared mutation results expose user-level outcomes such as changed paths, redirects, refresh instructions, recovery cleanup, status, and message rather than GitHub draft mechanics.
- [x] Page route shell, item route shell, and rich editor readiness marks are named distinctly or intentionally unified under a documented broader name.
- [x] Singleton edit and new-item workflows emit rich editor readiness marks where the QA plan expects them.
