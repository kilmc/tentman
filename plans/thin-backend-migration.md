# Thin Backend Migration Plan

**Status:** In cleanup / mostly complete
**Priority:** High
**Goal:** Make Tentman static-first and client-led, with a thin trusted backend that only handles secrets, privileged GitHub actions, and other server-required work.

## Summary

Tentman has moved away from route-server-driven GitHub reads and toward universal route loads backed by a thin `/api/*` layer.

The original broader client-owned data model and cache layer remains an optional later optimization, not active migration scope.

The target architecture is:

- Browser owns navigation, page state, previews, data caching, and most content/config fetching behavior
- Netlify functions are limited to trusted concerns: OAuth callback/session handling, GitHub API proxying with server-held tokens, publish/merge actions, and other privileged GitHub-backed writes
- GitHub-backed reads move out of `+page.server` and `+layout.server` route loads into a thin `/api/*` layer consumed by client stores
- The repo gets a permanent "thin backend principle" plus CI enforcement so future work does not quietly drift back toward server-heavy patterns

## Current Implementation State

### Completed

- Session bootstrap now comes from `GET /api/session`
- Normal authenticated navigation no longer validates the GitHub token on every request
- `Octokit` creation is lazy and limited to server endpoints/actions that need GitHub
- GitHub `401` responses clear the session and force a clean re-login path
- Selected repo shell metadata such as `rootConfig.siteName` is snapshotted into cookies at repo-selection time
- Repo selection now uses `GET /api/repos` for its read/bootstrap path
- Repo config bootstrap now uses `GET /api/repo/configs`
- Sidebar collection items are lazy and use `GET /api/repo/collection-items`
- Page and item view reads now use:
  - `GET /api/repo/page-view`
  - `GET /api/repo/item-view`
- Edit/new form bootstraps now use `GET /api/repo/form-config`
- Preview read bootstraps now use:
  - `GET /api/repo/page-preview`
  - `GET /api/repo/item-preview`
- Publish read bootstrap now uses `GET /api/repo/publish-view`
- Explicit draft comparison now uses `GET /api/repo/draft-status`
- Normal page and item reads no longer do hidden draft comparison or hidden draft-branch discovery
- `GET /api/repo/page-view` and `GET /api/repo/item-view` now accept an optional explicit `branch`
- Draft-aware navigation and auth redirects preserve the current path plus encoded query string
- `/pages`, `/publish`, and `/repos` route reads have been moved off `+page.server.ts` / `+layout.server.ts`
- There are currently no route-server `load` exports left under `src/routes`
- Remaining `+page.server.ts` files under `/pages` are action-only and intentionally server-owned
- Thin-backend guardrails now exist:
  - `plans/thin-backend-principle.md`
  - `scripts/check-thin-backend.mjs`
  - fixture-backed tests for the checker
  - required `SERVER_JUSTIFICATION` headers on current route server entrypoints

### Intentionally Still Server-Owned

- OAuth callback, login, logout, and session cookie handling
- Repo selection action that persists selected repo cookies and root-config snapshot
- Content write actions in edit/new/preview flows
- Publish and discard actions
- Image upload endpoint
- Action-only `+page.server.ts` files under `/pages` for privileged draft/save/delete mutations

### Remaining Work

- Keep migration docs, status notes, and focused route tests aligned with the thin-backend reality
- Measure whether the broader client-owned store/cache layer is still worthwhile before introducing it
- Consider only tiny route-bootstrap helper consolidation if repeated fetch/redirect code becomes meaningfully harder to maintain
- Add manual refresh or more targeted invalidation only if real usage shows stale-read pain
- Defer any shared cache or KV layer until measurement shows the current thin API plus light cache approach is insufficient

## Architecture Direction

### Server-Owned Responsibilities

Keep server execution only for these categories:

- OAuth callback, logout, and session bootstrap
- GitHub API calls that require the hidden token
- Privileged mutations such as publish, merge, discard, and GitHub-backed content/image writes
- Hosted/server-only extension runtime support where package loading cannot safely or practically happen on the client

Everything else should be client-owned by default.

### Thin API Surface

Replace GitHub-backed route loads with a small JSON API layer:

- `GET /api/session`
  Returns auth status, cached user snapshot, selected repo, selected backend kind, and root config metadata needed for the shell
- `GET /api/repos`
  Returns the user's selectable repositories
- `GET /api/repo/configs`
  Returns discovered content configs, block configs, and root config for the selected repo
- `GET /api/repo/page-view?slug=...`
  Returns the single-config page bootstrap for standard read views; accepts optional `branch=...` for explicit draft reads
- `GET /api/repo/item-view?slug=...&itemId=...`
  Returns the collection item bootstrap for standard read views; accepts optional `branch=...` for explicit draft reads
- `GET /api/repo/form-config?slug=...`
  Returns the config + block bootstrap used by edit/new flows
- `GET /api/repo/collection-items?slug=...`
  Returns sidebar/navigation items for one collection only
- `GET /api/repo/page-preview?slug=...&data=...`
  Returns preview bootstrap for single-entry content
- `GET /api/repo/item-preview?slug=...&itemId=...&data=...`
  Returns preview bootstrap for collection items
- `GET /api/repo/publish-view`
  Returns the publish review bootstrap for the active draft branch
- `GET /api/repo/draft-status?slug=...`
  Returns explicit on-demand draft metadata for the current config without piggybacking on normal page or item reads

Existing publish and image mutation endpoints can remain in spirit, but should be treated as part of this thin GitHub proxy layer rather than as general page-server behavior.

## Implementation Plan

### 1. Auth and Session Simplification

- Keep the current GitHub OAuth app for this migration
- Stop validating the GitHub token against GitHub on every request
- Move to a cheap session bootstrap model:
  - OAuth callback exchanges the code for a token
  - callback fetches user identity once
  - callback stores token in an `HttpOnly` cookie and stores a minimal user/session snapshot alongside it
  - normal requests read session state from cookies only
- Create `Octokit` only inside endpoints or privileged server actions that actually need GitHub
- Any GitHub API call that returns `401` or invalid-token clears the session and forces re-login

### 2. Client-Owned Data Layer and Cache

- Build a client data store that owns:
  - session state
  - discovered configs, block configs, and root config
  - content documents keyed by repo + slug + branch
  - collection navigation items keyed by repo + slug
  - draft metadata keyed by repo + slug
- Default cache policy:
  - root config: 30 minutes
  - discovered configs/block configs: 30 minutes
  - repo list: 10 minutes
  - content documents: 10 minutes
  - collection sidebar items: 10 minutes
  - draft status: short-lived and fetched only on demand
- Invalidation rules:
  - any Tentman write invalidates the affected content key immediately
  - create/delete/rename invalidates the affected config's collection navigation cache
  - publish/discard invalidates all content and draft keys for the repo
  - repo switch clears all repo-scoped client caches
- Add a user-visible manual refresh action at the repo/config level
- Do not add shared external cache or KV in this migration; first rely on browser/client caches plus light in-process server caching

Status note:

- Session and route bootstrap are now client-owned through universal loads plus thin `/api/*` endpoints
- A broader shared client store for content/config/draft state has not been introduced yet and is intentionally deferred unless measurement shows a clear need
- Existing light cache helpers such as config/content caches still sit behind the server thin API boundary

### 3. Route Migration

- Convert `/pages` and child pages to client-first route shells
- Remove GitHub-backed content/config fetching from `+layout.server` and `+page.server` for `/pages`
- Replace server-loaded page data with client store fetches from the new API layer
- Make sidebar collections lazy:
  - fetch collection items only when a collection is expanded or active
  - do not fetch every collection's content in the shared layout
- Page view/edit/new flows fetch only the single config and content document they need
- Preview and diff pages compute preview summaries client-side from current form data plus fetched base content
- Draft comparison becomes explicit:
  - do not compute draft comparisons during normal page load
  - fetch draft status only when the UI needs draft state or when the user opens publish/review flows
- Publish page remains server-backed for final merge/discard actions, but its read path should use the thin API and on-demand comparisons rather than eager route-wide GitHub work

Status note:

- This route migration is complete for current `/pages`, `/publish`, and `/repos` read paths
- Privileged mutations remain in `+page.server.ts` files where they belong
- Draft comparison is now explicit through `GET /api/repo/draft-status`, and normal page/item reads do not discover draft branches unless the caller opts in with `branch`
- Preview summaries are still computed on the server thin API because GitHub-backed base reads remain token-protected

### 4. Thin Backend Guardrails

Add two permanent guardrails so server creep is visible and enforced.

#### A. Thin Backend Principle Document

Add a short architecture note and link it from the product vision.

It should state:

- Tentman defaults to client execution unless secrets, trust, or privileged mutations require the server
- Server compute is a costed exception, not the default
- Content/config reads should prefer client fetch plus cache over SSR
- Out-of-band freshness should be handled by explicit refresh and invalidation rather than constant background refetching

#### B. CI Enforcement

Add a repo script that scans for:

- new `+server.ts`, `+page.server.ts`, and `+layout.server.ts` files
- new imports from `$lib/server/*` inside route code
- direct `octokit` usage outside the approved thin-backend server layer

Require every server entrypoint to declare a justification header:

```ts
// SERVER_JUSTIFICATION: auth_callback
```

Allowed values in v1:

- `auth_callback`
- `session`
- `github_proxy`
- `privileged_mutation`
- `image_upload`
- `hosted_extension_runtime`

Fail CI if:

- a server entrypoint has no justification
- the justification value is not allowlisted
- content/config reads are reintroduced through page-server route loads instead of the API/store path

Include one test fixture case proving the checker catches a missing justification.

## Suggested Execution Order

1. Done: Simplify auth/session handling so normal requests no longer hit GitHub for validation
2. Done: Add the thin API surface for session, repos, configs, route bootstraps, and explicit draft status
3. Deferred: Build a broader shared client store only if later measurement shows the current thin API approach is insufficient
4. Done: Migrate `/pages`, `/publish`, and `/repos` reads off route server loads
5. Done: Move draft-status behavior toward explicit/on-demand reads and remove hidden draft discovery from normal page/item reads
6. Done: Add the thin-backend principle doc and CI guardrail script
7. Current phase: Keep docs/tests tidy and measure whether any additional cache infrastructure is actually needed

## Test Plan

### Session and Auth

- OAuth callback stores token and user snapshot correctly
- Normal authenticated navigation performs no GitHub validation call
- API `401` clears session and returns unauthenticated state cleanly

### Cache and Data

- Repo/config/content cache keys are scoped by repo and branch
- Invalidations after create/update/delete/publish clear only the intended keys
- Manual refresh bypasses stale client cache

### UI and Flow

- Repo selection works with client-driven loading
- `/pages` loads without server-rendered config/content payloads
- Expanding one collection only fetches that collection's items
- Viewing/editing one config fetches only the needed content document
- Draft-aware route reads and re-login redirects preserve the full current route query when needed
- Preview flow still works end-to-end without route-server preview computation
- Publish/discard flow still works end-to-end

### Regression Guardrails

- CI checker fails on a new unjustified server route
- CI checker fails when content/config reads are reintroduced via `+page.server` or `+layout.server`
- CI checker passes for allowlisted server files with valid justifications

## Assumptions

- Keep the current GitHub OAuth app for this migration; GitHub App migration is out of scope
- Local repo mode remains developer/testing-oriented and is not the target architecture for hosted usage
- Netlify remains the hosting target
- GitHub-backed image upload stays behind the thin GitHub proxy layer because the GitHub token remains server-held
- In-process server caching plus browser/client caching is the first step; external shared cache/KV is deferred until post-migration measurement shows it is needed
- Manual refresh is the primary freshness control for out-of-band repo changes
