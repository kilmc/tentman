# Local Repository Options for Faster Tentman Development

Date: 2026-03-18

## Problem

Today Tentman depends heavily on GitHub APIs and remote branches:

- config discovery uses the GitHub Trees API
- content reads use GitHub Contents API
- writes create commits through GitHub
- preview flow depends on preview branches
- publish merges branches through GitHub

That means testing a content change against a real site often requires pushing to GitHub before the target site can render it.

## What Sveltia Is Actually Doing

Sveltia's Chromium-only local workflow is lighter than it first appears:

- it uses the browser File System Access API to let the user pick a local project directory
- it checks that a `.git` directory exists
- it edits local files directly
- it does not currently perform Git operations itself
- commit/push/pull are still done in a normal Git client

So the important part is not "browser Git". The important part is "browser can edit a user-picked local directory in Chromium".

## Browser/Platform Facts

### 1. File System Access API is real and usable

This is the enabling technology behind Sveltia's local mode. In Chromium-based browsers, a web app can ask the user to pick a directory and then read/write files inside it.

Implication for Tentman:

- a local-only editing mode in the browser is feasible
- it can work without pushing anything to GitHub first
- it will be Chromium-only unless you build a native/local helper instead

### 2. File System Observer is not something to rely on yet

Sveltia mentions using File System Observer in the future to avoid reloads. Chrome's own documentation describes it as an origin-trial/flagged feature rather than a safe baseline.

Implication for Tentman:

- don't plan the first version around automatic file watching from the browser
- assume manual refresh or app-driven polling at first

### 3. Browser Git is possible, but not necessary for the first win

Libraries like `isomorphic-git` can read and write `.git` data in browser environments. But Sveltia's current local mode avoids this complexity and still gets most of the DX benefit.

Implication for Tentman:

- the fastest improvement is local file editing, not in-browser commits
- built-in commit/push can be deferred or delegated to a helper tool later

## Realistic Options for Tentman

### Option A: Add a Chromium-only "Local Repository Mode"

Add a second backend alongside the current GitHub mode:

- user clicks "Open local repo"
- browser asks for a directory via File System Access API
- Tentman discovers `*.tentman.json` locally instead of via GitHub Trees API
- Tentman reads/writes content files directly on disk
- preview happens against the user's local site/dev server instead of a remote preview branch
- git commit/push remain manual in terminal, GitHub Desktop, or similar

Benefits:

- fastest path to removing the push-to-test loop
- closest to Sveltia's proven model
- avoids server-side GitHub round-trips during local development
- probably the best UX improvement per unit of work

Costs:

- Chromium-only
- requires introducing a filesystem abstraction so content/config code can work against GitHub or local files
- current branch-based draft/publish flow would need a local equivalent or a local-only simplification

Best fit:

- local development and QA
- content model testing
- fast iteration on forms/config/templates

### Option B: Build a small local helper daemon/CLI

Instead of relying on browser-only APIs, run a tiny local process that:

- opens a local repo path
- exposes file read/write and maybe git status/commit on `localhost`
- lets Tentman stay mostly browser/server-driven

Benefits:

- works across browsers
- can use real native git
- can support file watching more reliably

Costs:

- adds installation and process-management overhead
- weaker "just open the app" story
- more operational complexity than Option A

Best fit:

- if cross-browser support matters
- if you want native git operations and filesystem watching early

### Option C: Add browser Git with `isomorphic-git`

Tentman could attempt to:

- open a local directory in Chromium
- read/write files
- inspect status
- create commits locally
- maybe even push to origin

Benefits:

- ambitious all-in-one browser workflow
- fewer context switches

Costs:

- much more engineering risk
- more edge cases around credentials, repo compatibility, large repos, and existing git state
- not required to achieve the core speedup

Best fit:

- a later enhancement after local file editing already works

### Option D: Keep GitHub as source of truth but improve preview strategy

If you want to avoid a local-filesystem feature for now, you can still shrink the feedback loop by changing how previewing works:

- run the target site locally against a local checkout instead of waiting for remote deploy previews
- have Tentman write into that local checkout
- or add a lightweight sync/export step from Tentman to a local checkout

Benefits:

- preserves current GitHub-backed production model
- may reduce architectural changes inside Tentman

Costs:

- still needs either local file access or a helper
- doesn't solve the root issue on its own

## Recommended Path

The best next move is **Option A: a local repository mode for Chromium browsers, without built-in Git operations in v1**.

Reasoning:

- it directly addresses the slowest part of the loop: pushing to GitHub before testing
- it follows a model that already works in Sveltia
- it avoids overbuilding around browser Git too early
- it can coexist with the current GitHub-backed draft/publish workflow instead of replacing it

## Suggested Product Shape

Treat local mode as a distinct workflow, not a transparent rewrite of the current one.

### Local mode

- open local repo
- edit files directly
- preview against local site/dev server
- manual git commit/push outside Tentman

### GitHub mode

- current OAuth/repo picker flow
- remote draft branch workflow
- remote publish/discard flow

This split keeps the UX honest and reduces complexity.

## Implementation Notes

The key technical move is introducing a repository adapter boundary. Tentman's current code talks directly to Octokit in discovery, reads, writes, branch handling, and publish logic.

A good refactor target would be an interface roughly shaped like:

- `discoverConfigs()`
- `readFile()`
- `writeFile()`
- `listDirectory()`
- `fileExists()`
- optional draft/publish methods depending on backend capabilities

Then provide:

- `GitHubRepositoryAdapter`
- `LocalFilesystemRepositoryAdapter`

Likely first slice:

1. Make config discovery work against either GitHub or local filesystem.
2. Make content read/write work against either backend.
3. Skip branch publishing in local mode.
4. Add a local preview URL setting instead of Netlify preview branch generation.

## Risks

- Chromium-only browser support may be fine for developers, but not for all end users.
- Directory permission handling and reconnect flows need careful UX.
- Local mode should be clearly labeled so users understand that Tentman is editing real files on disk.
- Existing server-side auth/session assumptions will need some route-level separation.

## Bottom Line

Yes, there is a practical way to speed this up.

The shortest path is not "teach Tentman full Git in the browser". It is:

- let Tentman open a local repo directory in Chromium
- edit files directly
- preview against the local site
- leave commit/push to normal Git tools

That should remove the push-to-GitHub bottleneck while keeping the implementation scope manageable.

## Sources

- Sveltia local workflow docs: https://sveltiacms.app/en/docs/workflows/local
- Sveltia features docs: https://sveltiacms.app/en/docs/features
- Chrome File System Observer article: https://developer.chrome.com/blog/file-system-observer
- isomorphic-git overview: https://isomorphic-git.org/en/
