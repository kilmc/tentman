# Thin Backend Migration Plan

**Status:** Ready to implement
**Priority:** High
**Goal:** Make Tentman static-first and client-led, with a thin trusted backend that only handles secrets, privileged GitHub actions, and other server-required work.

## Summary

Tentman should move away from route-server-driven GitHub reads and toward a client-owned data model with aggressive caching and explicit invalidation.

The target architecture is:

- Browser owns navigation, page state, previews, data caching, and most content/config fetching behavior
- Netlify functions are limited to trusted concerns: OAuth callback/session handling, GitHub API proxying with server-held tokens, publish/merge actions, and other privileged GitHub-backed writes
- GitHub-backed reads move out of `+page.server` and `+layout.server` route loads into a thin `/api/*` layer consumed by client stores
- The repo gets a permanent "thin backend principle" plus CI enforcement so future work does not quietly drift back toward server-heavy patterns

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
- `GET /api/repo/content?slug=...&branch=main|draft`
  Returns the content document for one config only
- `GET /api/repo/collection-items?slug=...`
  Returns sidebar/navigation items for one collection only
- `GET /api/repo/draft-status?slug=...`
  Returns latest preview branch metadata and per-config draft summary on demand

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

1. Simplify auth/session handling so normal requests no longer hit GitHub for validation
2. Add the thin API surface for session, repos, configs, and content
3. Build client stores for repo/config/content state and caching
4. Migrate `/pages` layout and page routes off server loads and onto the client data layer
5. Move draft-status and preview computation to on-demand/client-driven behavior
6. Add the thin-backend principle doc and CI guardrail script
7. Measure whether any shared cache infrastructure is still needed after the rewrite

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
