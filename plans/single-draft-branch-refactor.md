# Single Draft Branch Refactor Plan

## Problem Statement

The current draft system is overly complex:
- Cookie-based sessions that expire after 24 hours
- Multiple draft branches possible (one per config per user)
- "Orphaned drafts" require manual resume action
- User loses draft state if they close browser and cookies expire

This creates a poor UX where users might lose their work or have to manually resume drafts.

## Solution Overview

Simplify to a single-draft-branch model:
- **One draft branch per repo**: `preview-{yyyy-mm-dd}` (e.g., `preview-2024-11-30`)
- **Automatic detection**: Check GitHub for branch existence on app load
- **Persistent storage**: Store branch name in localStorage + memory
- **Global publish flow**: One publish page shows all changes across all configs
- **No manual resume**: Draft changes appear automatically if branch exists

## Key Changes

### Branch Naming
- **Old**: `preview/{configSlug}/{userId}-{timestamp}`
- **New**: `preview-{yyyy-mm-dd}` (e.g., `preview-2024-11-30`)
- **Rationale**: Human-readable, one branch per repo, unique per day

### Storage Strategy
- **Primary**: Client-side Svelte store (memory)
- **Backup**: localStorage (persists across browser sessions)
- **On load**: Check localStorage → verify branch exists on GitHub → load into store
- **On publish**: Clear both localStorage and memory store

### Route Changes
- **Remove**: `/pages/[page]/draft` (per-config draft review)
- **Add**: `/publish` (global draft summary)
- **Keep**: `/pages/[page]/preview-changes` (per-item preview before saving)

### UI Changes
- **Header**: Add "Publish Changes" button (visible when draft exists)
- **Index pages**: Show draft changes automatically (no resume button)
- **Publish page**: Show all configs with changes, commits, and diffs

## Technical Implementation

### 1. Create Global Draft Store

**New file**: `src/lib/stores/draft-branch.ts`

```typescript
import { writable } from 'svelte/store';
import type { Octokit } from 'octokit';

const DRAFT_BRANCH_KEY = 'tentman_draft_branch';

interface DraftBranchState {
  branchName: string | null;
  repoFullName: string | null; // owner/name
}

function createDraftBranchStore() {
  const { subscribe, set, update } = writable<DraftBranchState>({
    branchName: null,
    repoFullName: null
  });

  return {
    subscribe,

    // Initialize from localStorage and verify on GitHub
    async initialize(octokit: Octokit, owner: string, repo: string) {
      const repoFullName = `${owner}/${repo}`;
      const stored = localStorage.getItem(DRAFT_BRANCH_KEY);

      if (stored) {
        try {
          const state = JSON.parse(stored) as DraftBranchState;

          // Only use if it's for the current repo
          if (state.repoFullName === repoFullName && state.branchName) {
            // Verify branch still exists on GitHub
            const { branchExists } = await import('$lib/github/branch');
            const exists = await branchExists(octokit, owner, repo, state.branchName);

            if (exists) {
              set(state);
              return state.branchName;
            }
          }
        } catch (err) {
          console.error('Failed to initialize draft branch from storage:', err);
        }
      }

      // No valid stored branch, check GitHub for any preview-* branches
      const { listPreviewBranches } = await import('$lib/github/branch');
      const branches = await listPreviewBranches(octokit, owner, repo);

      if (branches.length > 0) {
        // Use the most recent one
        const branchName = branches[0].name;
        this.set(branchName, repoFullName);
        return branchName;
      }

      return null;
    },

    // Set draft branch and persist
    set(branchName: string, repoFullName: string) {
      const state = { branchName, repoFullName };
      set(state);
      localStorage.setItem(DRAFT_BRANCH_KEY, JSON.stringify(state));
    },

    // Clear draft branch
    clear() {
      set({ branchName: null, repoFullName: null });
      localStorage.removeItem(DRAFT_BRANCH_KEY);
    },

    // Create new draft branch with today's date
    createBranchName(): string {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      return `preview-${yyyy}-${mm}-${dd}`;
    }
  };
}

export const draftBranch = createDraftBranchStore();
```

### 2. Update Branch Discovery

**File**: `src/lib/github/branch.ts`

Update `listPreviewBranches()` to match new naming pattern:
- Old pattern: `preview/{configSlug}/{userId}-{timestamp}` or `preview/{userId}-{timestamp}`
- New pattern: `preview-{yyyy-mm-dd}`

```typescript
// Update regex to match new format
const newPattern = /^preview-(\d{4}-\d{2}-\d{2})$/;
```

Remove `findOrphanedDrafts()` - no longer needed with single branch model.

### 3. Update Layout to Initialize Store

**File**: `src/routes/+layout.svelte`

Add draft branch initialization on mount:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { draftBranch } from '$lib/stores/draft-branch';

  let { data } = $props();

  onMount(async () => {
    if (data.isAuthenticated && data.selectedRepo && data.octokit) {
      const { owner, name } = data.selectedRepo;
      await draftBranch.initialize(data.octokit, owner, name);
    }
  });
</script>
```

### 4. Update Preview-Changes Actions

**Files**:
- `src/routes/pages/[page]/preview-changes/+page.server.ts`
- `src/routes/pages/[page]/[itemId]/preview-changes/+page.server.ts`

Update to use/create single draft branch:

```typescript
// Get or create draft branch
const formBranchName = formData.get('branchName') as string | null;
let branchName: string;

if (formBranchName) {
  // Use existing draft branch from client
  branchName = formBranchName;
} else {
  // Create new draft branch with today's date
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  branchName = `preview-${yyyy}-${mm}-${dd}`;

  // Create the branch
  const { createBranch } = await import('$lib/github/branch');
  await createBranch(octokit, owner, name, branchName);
}
```

### 5. Update Preview-Changes Pages to Pass Branch

**Files**:
- `src/routes/pages/[page]/preview-changes/+page.svelte`
- `src/routes/pages/[page]/[itemId]/preview-changes/+page.svelte`

Add hidden input with current draft branch name from store:

```svelte
<script lang="ts">
  import { draftBranch } from '$lib/stores/draft-branch';

  // ...
</script>

<form method="POST">
  {#if $draftBranch.branchName}
    <input type="hidden" name="branchName" value={$draftBranch.branchName} />
  {/if}

  <!-- rest of form -->
</form>
```

### 6. Update Index Pages

**File**: `src/routes/pages/[page]/+page.server.ts`

Remove orphaned drafts logic, simplify to check single draft branch:

```typescript
// Check for draft changes on the global draft branch
let draftChanges = null;
const draftBranchName = cookies.get('draft_branch_name'); // Or get from request

if (draftBranchName) {
  try {
    const { compareDraftToBranch } = await import('$lib/utils/draft-comparison');
    draftChanges = await compareDraftToBranch(
      locals.octokit,
      owner,
      name,
      discoveredConfig.config,
      discoveredConfig.type,
      discoveredConfig.path,
      draftBranchName
    );
  } catch (err) {
    console.error('Failed to compare draft:', err);
  }
}
```

**File**: `src/routes/pages/[page]/+page.svelte`

Remove orphaned drafts UI, keep draft changes display.

### 7. Create Global Publish Page

**New file**: `src/routes/publish/+page.server.ts`

```typescript
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
  if (!locals.isAuthenticated || !locals.octokit || !locals.selectedRepo) {
    throw redirect(302, '/auth/login?redirect=/publish');
  }

  // Get draft branch name from cookie/header
  const draftBranchName = cookies.get('draft_branch_name');

  if (!draftBranchName) {
    throw error(404, 'No draft branch found');
  }

  const { owner, name } = locals.selectedRepo;

  // Get all configs
  const { getCachedConfigs } = await import('$lib/stores/config-cache');
  const configs = await getCachedConfigs(locals.octokit, owner, name);

  // For each config, check if it has draft changes
  const configsWithChanges = [];

  for (const config of configs) {
    const { compareDraftToBranch } = await import('$lib/utils/draft-comparison');
    const changes = await compareDraftToBranch(
      locals.octokit,
      owner,
      name,
      config.config,
      config.type,
      config.path,
      draftBranchName
    );

    if (changes && (
      changes.modified.length > 0 ||
      changes.created.length > 0 ||
      changes.deleted.length > 0
    )) {
      configsWithChanges.push({
        config,
        changes
      });
    }
  }

  // Get commit history
  const { getCommitsSince } = await import('$lib/github/branch');
  const commits = await getCommitsSince(
    locals.octokit,
    owner,
    name,
    'main',
    draftBranchName
  );

  return {
    draftBranchName,
    configsWithChanges,
    commits
  };
};

export const actions = {
  publish: async ({ locals, cookies }) => {
    if (!locals.isAuthenticated || !locals.octokit || !locals.selectedRepo) {
      throw error(401, 'Not authenticated');
    }

    const draftBranchName = cookies.get('draft_branch_name');
    if (!draftBranchName) {
      throw error(400, 'No draft branch to publish');
    }

    const { owner, name } = locals.selectedRepo;

    try {
      // Merge to main
      const { mergeBranch } = await import('$lib/github/branch');
      await mergeBranch(
        locals.octokit,
        owner,
        name,
        draftBranchName,
        'main',
        `Publish draft changes from ${draftBranchName}`
      );

      // Delete branch
      const { deleteBranch } = await import('$lib/github/branch');
      await deleteBranch(locals.octokit, owner, name, draftBranchName);

      // Clear cookie
      cookies.delete('draft_branch_name', { path: '/' });

      throw redirect(303, '/pages?published=true');
    } catch (err) {
      console.error('Failed to publish draft:', err);
      throw error(500, 'Failed to publish changes');
    }
  }
} satisfies Actions;
```

**New file**: `src/routes/publish/+page.svelte`

```svelte
<script lang="ts">
  import type { PageData } from './$types';
  import { enhance } from '$app/forms';
  import { draftBranch } from '$lib/stores/draft-branch';

  let { data }: { data: PageData } = $props();
  let publishing = $state(false);
</script>

<div class="container mx-auto p-6">
  <h1 class="text-3xl font-bold mb-6">Publish Changes</h1>

  <div class="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
    <p class="text-sm text-blue-800">
      Branch: <code class="font-mono">{data.draftBranchName}</code>
    </p>
    <p class="text-sm text-blue-700 mt-1">
      {data.commits.length} commit{data.commits.length === 1 ? '' : 's'} ready to publish
    </p>
  </div>

  <!-- Configs with changes -->
  <div class="mb-8">
    <h2 class="text-xl font-semibold mb-4">Changed Content</h2>
    <div class="space-y-4">
      {#each data.configsWithChanges as { config, changes }}
        <div class="rounded-lg border border-gray-200 bg-white p-4">
          <h3 class="font-medium mb-2">{config.config.label}</h3>
          <div class="text-sm text-gray-600">
            {#if changes.modified.length > 0}
              <span>{changes.modified.length} modified</span>
            {/if}
            {#if changes.created.length > 0}
              <span class="ml-3">{changes.created.length} created</span>
            {/if}
            {#if changes.deleted.length > 0}
              <span class="ml-3">{changes.deleted.length} deleted</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>

  <!-- Commits -->
  <div class="mb-8">
    <h2 class="text-xl font-semibold mb-4">Commits</h2>
    <div class="space-y-2">
      {#each data.commits as commit}
        <div class="rounded border border-gray-200 bg-white p-3">
          <p class="text-sm font-medium">{commit.message}</p>
          <p class="text-xs text-gray-500 mt-1">
            {commit.author.name} • {new Date(commit.author.date).toLocaleString()}
          </p>
        </div>
      {/each}
    </div>
  </div>

  <!-- Actions -->
  <form
    method="POST"
    action="?/publish"
    use:enhance={() => {
      publishing = true;
      return async ({ update }) => {
        await update();
        draftBranch.clear();
        publishing = false;
      };
    }}
  >
    <div class="flex gap-3">
      <button
        type="submit"
        disabled={publishing}
        class="rounded bg-green-600 px-6 py-2 font-medium text-white hover:bg-green-700 disabled:bg-gray-400"
      >
        {publishing ? 'Publishing...' : 'Publish to Main'}
      </button>
      <a
        href="/pages"
        class="rounded border border-gray-300 bg-white px-6 py-2 font-medium text-gray-700 hover:bg-gray-50"
      >
        Cancel
      </a>
    </div>
  </form>
</div>
```

### 8. Update Header with Publish Button

**File**: `src/routes/+layout.svelte`

Add "Publish Changes" button when draft exists:

```svelte
<script lang="ts">
  import { draftBranch } from '$lib/stores/draft-branch';

  let { data } = $props();
</script>

<header>
  <!-- existing header content -->

  {#if $draftBranch.branchName}
    <a
      href="/publish"
      class="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
    >
      Publish Changes
    </a>
  {/if}
</header>
```

### 9. Remove Old Files

**Delete**:
- `src/routes/pages/[page]/draft/+page.server.ts`
- `src/routes/pages/[page]/draft/+page.svelte`
- `src/routes/pages/[page]/resume-draft/+page.server.ts`
- `src/lib/stores/preview-session.ts` (replaced by draft-branch store)

### 10. Update Cookie/Storage Strategy

Instead of cookies for session tracking, use:
- Client-side: `draftBranch` store + localStorage
- Server-side: Accept `X-Draft-Branch` header from client, or check GitHub directly

## Implementation Sequence

### Phase 1: Core Store & Branch Management
1. ✅ Create `src/lib/stores/draft-branch.ts`
2. ✅ Update `src/lib/github/branch.ts` for new pattern
3. ✅ Update layout to initialize store on mount

### Phase 2: Update Existing Flows
4. ✅ Update preview-changes server actions (both routes)
5. ✅ Update preview-changes pages (both routes)
6. ✅ Update index page server load
7. ✅ Update index page UI (remove orphaned drafts)

### Phase 3: Global Publish Flow
8. ✅ Create `/publish` route (server + page)
9. ✅ Add publish button to header
10. ✅ Update publish flow to clear localStorage

### Phase 4: Cleanup
11. ✅ Remove old draft routes
12. ✅ Remove preview-session store
13. ✅ Test full flow end-to-end

## Success Criteria

✅ User can make edits across multiple configs, all go to same `preview-{date}` branch
✅ Closing browser and reopening shows draft changes automatically (no resume)
✅ `/publish` page shows all changes across all configs
✅ Publishing merges all changes and deletes branch
✅ localStorage is cleared on publish
✅ Multiple users can work on same repo with separate draft branches (if we add user to branch name later)

## Edge Cases to Handle

- **Same-day branch exists**: Append `-2`, `-3`, etc. to branch name if `preview-{date}` exists
- **Branch deleted externally**: Store should detect and clear if branch doesn't exist
- **Multiple repos**: Store tracks repo, clears when switching repos
- **Concurrent edits**: Last write wins (GitHub API handles this)
