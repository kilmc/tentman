# GitHub API Efficiency and Draft Flow Stabilization

## Summary

Reduce unnecessary GitHub API traffic in the GitHub-backed Tentman workspace, fix the invalid leading-slash repo path bug in directory-backed content saves, and make draft/content/bootstrap reads predictable and cheap enough to support normal editing without noisy request bursts.

This work should be done before any GitHub App migration. The immediate problems are request duplication, overlapping bootstrap fetches, inefficient draft comparison, and missing GitHub API version defaults. GitHub App migration should happen later against the improved fetch architecture, not before it.

## Implementation Changes

### 1. Stop cache stampedes and share in-flight work

- Add in-flight promise deduping to the server caches in `apps/web/src/lib/stores/config-cache.ts` and `apps/web/src/lib/stores/content-cache.ts`.
- Keep current TTL behavior, but if a fetch for the same cache key is already running, return that promise instead of starting another GitHub request.
- Clear the in-flight entry on both success and failure.
- Preserve current cache invalidation APIs, but ensure invalidation also removes any matching in-flight entry.

### 2. Cache the rest of the GitHub bootstrap surface

- Add the same style of server-side cache for:
  - root config reads
  - block config discovery / block registry data
  - navigation manifest reads
  - draft branch existence / name lookup
- Reuse these caches across:
  - repo bootstrap
  - page/item view endpoints
  - form-config endpoint
  - collection-items endpoint
  - config-states endpoint
- The intended behavior is that one GitHub-backed page load should mostly reuse shared bootstrap data instead of re-reading `.tentman.json`, config files, block configs, and `tentman/navigation-manifest.json` independently.

### 3. Remove avoidable extra GitHub requests

- Change navigation manifest loading so it does not call `fileExists()` and then `readTextFile()`. Read once and treat `404` as “does not exist”.
- Replace draft branch detection that currently lists branches with a direct branch lookup for `tentman-preview`.
- Avoid repeated PR existence checks where the branch was just ensured in the same mutation flow unless the operation truly requires a fresh server read.
- Review page overview draft summary and publish-view flows to avoid re-fetching full content when a cheaper branch/path diff can answer the same question.

### 4. Fix repo path normalization for GitHub-backed writes

- Update shared path normalization so repo-root-relative config paths like `/src/lib/db/posts` normalize to `src/lib/db/posts`.
- Apply this at the shared path utility layer so directory-backed fetch, preview, save, and navigation code all behave consistently.
- Add a defensive GitHub backend guard so no read/write/delete/list request reaches the GitHub contents API with a leading slash path.
- Preserve local-mode behavior while aligning GitHub mode to the same logical repo-path semantics.

### 5. Reduce frontend-driven API fan-out

- Change the GitHub pages layout flow so it does not eagerly load collection items for every collection on layout initialization.
- Load collection items lazily for the active collection, and fetch additional collections only when the user opens or needs them.
- Keep config-state loading lazy and one-shot unless explicitly forced after a mutation.
- Replace broad `invalidateAll()` usage in GitHub-backed navigation/content flows with narrower invalidation where possible so mutations do not retrigger the full bootstrap stack.

### 6. Make GitHub requests explicit and measurable

- Update Octokit client creation to send explicit GitHub REST API version defaults on every request.
- Keep current OAuth user-token auth for now; do not switch to GitHub App auth in this pass.
- Add lightweight debug instrumentation around the GitHub repository backend so we can count requests by operation and path during development.
- The before/after success metric is a visibly smaller request burst for initial load, item edit load, save-to-preview, and publish view.

### 7. Defer GitHub App migration until after the fetch strategy cleanup

- Keep the current auth model for this pass.
- After the request architecture is stable and measured, design a separate GitHub App migration plan covering:
  - installation flow
  - repo selection model
  - permission scope
  - token lifetime / refresh behavior
  - backward compatibility for existing sessions

## Public Interfaces and Behavioral Contracts

- No user-facing config schema change is required for the API efficiency work.
- Repo path handling is intentionally broadened: root-relative repo paths with a leading slash are treated as valid repo paths and normalized before GitHub access.
- Cache behavior remains TTL-based but now guarantees single-flight behavior per cache key.
- GitHub API client behavior changes to include explicit request versioning by default.
- Draft branch lookup behavior changes internally from branch listing to direct branch existence checks, with no UI contract change.

## Test Plan

- Unit tests for config/content caches:
  - concurrent calls with the same key share one backend fetch
  - failures clear in-flight state
  - invalidation clears cached and in-flight entries
- Unit tests for root config / navigation manifest / draft branch cache helpers:
  - repeated reads hit cache
  - force or invalidation causes refetch
- Unit tests for path normalization:
  - `resolveConfigPath()` and GitHub backend sanitize `/src/lib/db/posts` to `src/lib/db/posts`
  - directory-backed save/preview paths never begin with `/`
- Endpoint tests for page-view, item-view, form-config, collection-items, and config-states:
  - shared bootstrap data is reused
  - missing manifest still resolves cleanly from a single read attempt
- Draft comparison tests:
  - overview and publish flows use cheaper comparison primitives where expected
  - behavior remains correct for modified, created, and deleted content
- Focused regression tests for the reproduced bug:
  - saving a directory-backed collection item to draft with a root-relative content path succeeds in GitHub mode
- Dev verification:
  - compare request logs for initial `/pages` load, item edit load, save-to-preview, and publish view before and after the change set
  - confirm deprecation warnings disappear once API version defaults are set

## Assumptions

- The immediate priority is efficiency and correctness, not auth migration.
- Existing OAuth token auth remains acceptable for this pass as long as API versioning is made explicit.
- The `tentman-preview` branch remains the canonical draft branch name.
- The correct semantic model for leading-slash config paths is “repo-root-relative”, not “hard error”.
- The top-level `plans` directory is the right home for this document, and date-prefixed filenames are acceptable for this plan even though older plan files are mostly descriptor-only.
