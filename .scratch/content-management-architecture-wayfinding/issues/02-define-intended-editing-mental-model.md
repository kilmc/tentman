# Define the intended editing mental model

Type: grilling
Status: resolved
Blocked by: None

## Question

When a user edits content, navigation, or collection groups, what should they believe happened immediately, what can still be pending, and what guarantees should hold after reload?

## Evidence that counts as done

- Ask the human one question at a time until the product contract is clear.
- Cover content edits, Navigation Manifest ordering/grouping edits, collection group edits, failed saves, pending commits/sync, reload behavior, and visible cache states.
- Distinguish what must be source-independent from what may differ by Content Source.
- Update `CONTEXT.md` immediately if new domain terms crystallise.

## Resolution should decide

The intended editing contract that App Core and Content Source adapters must satisfy.

## Answer

All Web App edits should share one source-independent editing contract. This includes ordinary content edits, Navigation Manifest ordering and grouping edits, and collection group edits, even when their underlying representations differ.

The Web App presents an **Editing Source**: the durable user-facing editing space where non-technical administrators experience themselves as editing their website. Edits update the Editing Source optimistically. An edit is **Saved** once it is durably recorded in the Editing Source and should survive reload, even if it has not yet reached the Content Source.

Background sync reconciles Saved Editing Source changes with the **Content Source**. While that reconciliation is in progress the UI may show **Syncing**; if changes are durably saved locally but not confirmed by the Content Source, they are **Unsynced**. If the Content Source is unreachable, the Web App should remain editable in an **Offline** state and sync later when connectivity returns.

Failed Content Source sync must not roll back Saved Editing Source changes. The app should preserve the user's work, continue accepting further edits where possible, and enter **Needs Attention** when Tentman cannot automatically sync or reconcile the Editing Source with the Content Source. If the Content Source has changed elsewhere while local changes remain Unsynced, the Web App should keep showing the Editing Source and surface a conflict/needs-attention state rather than overwriting, auto-merging, or hiding the user's local work.

Reload should restore the latest Saved Editing Source state first, including Unsynced edits and sync statuses, even when the Content Source is unreachable. Content Source freshness checks can run after the Editing Source is visible. Those checks may update the visible Editing Source automatically only when there are no Unsynced local changes; otherwise external changes become a reconciliation problem.

Pending sync may be batched. The product contract is source-independent: the user sees changes being synced, not individual commits. The mechanics are Content Source-specific: GitHub-backed mode may batch changes into draft-branch commits, local folder mode may write files directly, and future sources may choose different persistence strategies.

**Synced** means Editing Source changes have been confirmed by the Content Source. In GitHub-backed mode, that means the changes have reached Tentman's managed draft branch or repository state. **Published** is separate and means synced changes have been promoted into the site's live branch or deployment path, such as merging a draft branch into main.

User-facing UI should avoid cache, Git, GitHub, commit, push, and technical provider language except in developer-oriented or diagnostic surfaces. The states the Web App exposes should be product states such as Saved, Syncing, Synced, Unsynced, Offline, Needs Attention, and Published where applicable.

App Core should own the source-independent Editing Source contract and state vocabulary. Content Source adapters should own the mechanics that make those states true for local folders, GitHub draft branches, and future sources, including files, IndexedDB/browser persistence, commits, retries, freshness checks, and provider APIs.
