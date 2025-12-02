# Single Draft Branch Refactor - Progress Report

## ✅ Completed (Phases 1-2)

### Phase 1: Core Store & Branch Management
1. ✅ Created `src/lib/stores/draft-branch.ts`
   - Global store with localStorage persistence
   - Automatic GitHub branch discovery on app load
   - Methods: `initialize()`, `setBranch()`, `clear()`, `createBranchName()`

2. ✅ Updated `src/lib/github/branch.ts`
   - Updated `PreviewBranch` interface for new format
   - Updated `listPreviewBranches()` to match `preview-{yyyy-mm-dd}` pattern
   - Removed `findOrphanedDrafts()` (no longer needed)

3. ✅ Updated `src/routes/+layout.svelte`
   - Added draft branch store initialization in `onMount()`
   - Added "Publish Changes" button to header (visible when draft exists)

### Phase 2: Updated Existing Flows
4. ✅ Updated `src/routes/pages/[page]/preview-changes/+page.server.ts`
   - Removed preview session logic
   - Added branch name handling from form data
   - Auto-creates branch with `preview-{yyyy-mm-dd}` format
   - Appends sequence number if branch exists (-2, -3, etc.)
   - Redirects to index page with `?saved=true&branch=` query params

5. ✅ Updated `src/routes/pages/[page]/[itemId]/preview-changes/+page.server.ts`
   - Same changes as above for item-level edits
   - Removed session logic, added branch handling

6. ✅ Updated `src/routes/pages/[page]/preview-changes/+page.svelte`
   - Added draft branch store import
   - Added hidden input for `branchName` if draft exists
   - Enhanced form callback to update store from redirect URL

7. ✅ Updated `src/routes/pages/[page]/[itemId]/preview-changes/+page.svelte`
   - Same changes as singleton preview-changes page

## 🔄 In Progress (Phase 3)

### Remaining Tasks

8. ⏳ Update `src/routes/pages/[page]/+page.server.ts`
   - Remove orphaned drafts logic
   - Simplify to use single draft branch from client
   - Check if draft exists and compare changes

9. ⏳ Update `src/routes/pages/[page]/+page.svelte`
   - Remove orphaned drafts UI
   - Update to show draft changes banner when draft exists
   - Add toast message handling for `?saved=true`

10. ⏳ Create `/publish` route
    - `src/routes/publish/+page.server.ts` - Load all configs with changes, commits
    - `src/routes/publish/+page.svelte` - Summary UI with publish action

11. ⏳ Remove old files
    - Delete `src/routes/pages/[page]/draft/` (entire directory)
    - Delete `src/routes/pages/[page]/resume-draft/` (entire directory)
    - Delete `src/lib/stores/preview-session.ts`

12. ⏳ Test full flow
    - Create edit → save to draft → verify branch created
    - Make another edit → verify same branch used
    - Navigate away and back → verify draft persists
    - Publish → verify merge and cleanup

## Key Implementation Details

### Branch Naming Convention
- Format: `preview-{yyyy-mm-dd}` (e.g., `preview-2024-11-30`)
- If exists: `preview-{yyyy-mm-dd}-2`, `preview-{yyyy-mm-dd}-3`, etc.
- One active draft branch per repo at a time

### Storage Strategy
- **Primary**: Client-side Svelte store (reactive, in-memory)
- **Backup**: localStorage (`tentman_draft_branch` key)
- **On load**: Check localStorage → verify on GitHub → populate store
- **On save**: Update both store and localStorage
- **On publish**: Clear both store and localStorage

### User Flow
1. User edits content → clicks "Save to Draft"
2. System creates/uses `preview-{date}` branch
3. Redirects to index with `?saved=true&branch=...`
4. Client updates draft store from URL params
5. Index page automatically shows draft changes (no resume needed)
6. Header shows "Publish Changes" button
7. Click publish → summary page → confirm → merge + delete branch

## Next Steps

Continue with Phase 3:
1. Update index page (server + client)
2. Create publish route
3. Clean up old files
4. End-to-end testing

## Notes
- Build succeeded with warnings (existing a11y issues, unrelated to refactor)
- TypeScript compilation successful
- All changes maintain backward compatibility during transition
