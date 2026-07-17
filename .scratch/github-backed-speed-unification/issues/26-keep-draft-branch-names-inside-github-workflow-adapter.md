# 26 — Keep draft branch names inside GitHub workflow adapter

**What to build:** Page and editor callers use mode-neutral workflow state for draft/editing status, recovery identity, and user messaging instead of receiving raw GitHub draft branch names.

**Blocked by:** 25 — Key publish-to-pages warm return by repository identity.

**Status:** ready-for-agent

- [ ] Edit and route workflow payloads expose user-level draft/editability state without requiring callers to read a GitHub branch name.
- [ ] Editor recovery context uses opaque workflow identity rather than a raw draft branch string.
- [ ] Draft-status UI continues to tell users they are editing draft content without exposing adapter-private branch mechanics.
- [ ] Shared mutation results remain user-level outcomes such as redirect, refresh, changed paths, recovery cleanup, status, and message.
- [ ] Boundary coverage proves page and editor callers do not depend on raw draft branch names except where a GitHub adapter or documented mutation transport owns them.
