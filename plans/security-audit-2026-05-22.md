# Security Audit 2026-05-22

Scope:

- GitHub auth/session handling
- server-side read/write routes
- repo-controlled preview/rendering surfaces
- local-mode trust boundaries
- publish/branch safety
- browser/deployment hardening
- dependency vulnerability scan (`pnpm audit --prod`)

## Severity-Ordered Tasks

### Critical

1. Replace the raw GitHub bearer token cookie with a real server-side or encrypted session model.
   - Current code writes the GitHub token directly to `github_token` and reads it back as the live credential.
   - References:
     - [apps/web/src/lib/server/auth/github.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/server/auth/github.ts:162)
     - [apps/web/src/lib/server/auth/github.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/server/auth/github.ts:179)

2. Stop rendering repo-controlled content component preview HTML directly into the app origin.
   - Repo `preview.njk` files are loaded from the selected repo and inserted with `innerHTML`.
   - This enables same-origin XSS from repo-controlled templates.
   - References:
     - [apps/web/src/lib/content-components/registry.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/content-components/registry.ts:72)
     - [apps/web/src/lib/content-components/browser.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/content-components/browser.ts:7)
     - [apps/web/src/lib/content-components/markdown.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/content-components/markdown.ts:331)

3. Re-derive draft asset target paths on the server and reject client-supplied `targetPath` / `publicPath`.
   - The server currently trusts the uploaded manifest and writes binary files to the manifest-provided path.
   - This is an arbitrary repo file write primitive.
   - References:
     - [apps/web/src/lib/features/draft-assets/shared.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/features/draft-assets/shared.ts:316)
     - [apps/web/src/lib/features/draft-assets/server.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/features/draft-assets/server.ts:28)
     - [apps/web/src/lib/features/draft-assets/server.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/features/draft-assets/server.ts:45)

4. Enforce server-side filename/path validation for directory-backed content create, rename, preview, and delete flows.
   - `filename` and `newFilename` are concatenated into paths without validating that they stay within the configured content directory.
   - Because the GitHub backend normalizes `..` segments, attacker-controlled filenames can escape the intended directory and target other repo files.
   - References:
     - [apps/web/src/lib/features/content-management/transforms.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/features/content-management/transforms.ts:222)
     - [apps/web/src/lib/content/adapters/directory.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/content/adapters/directory.ts:122)
     - [apps/web/src/lib/content/adapters/directory.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/content/adapters/directory.ts:142)
     - [apps/web/src/lib/content/adapters/directory.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/content/adapters/directory.ts:241)
     - [apps/web/src/lib/content/adapters/directory.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/content/adapters/directory.ts:278)

5. Isolate or remove automatic execution of repo-provided JavaScript adapters in local mode.
   - Local block adapters are read from the selected repo and imported as live JavaScript into the Tentman browser origin.
   - If a user opens an untrusted local repo while also authenticated to GitHub mode, that code can act as the user against same-origin app APIs.
   - References:
     - [apps/web/src/lib/repository/local.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/repository/local.ts:29)
     - [apps/web/src/lib/repository/local.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/repository/local.ts:542)
     - [apps/web/src/lib/blocks/adapter-files.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/blocks/adapter-files.ts:77)
     - [apps/web/src/lib/blocks/registry.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/blocks/registry.ts:134)
     - [apps/web/src/lib/stores/local-content.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/stores/local-content.ts:314)

### High

6. Fix the docs/code mismatch around `SESSION_SECRET`.
   - Docs and `.env.example` instruct operators to set `SESSION_SECRET`, but the app does not use it.
   - References:
     - [README.md](/Users/kilmc/code/tentman/tentman/README.md:62)
     - [apps/web/.env.example](/Users/kilmc/code/tentman/tentman/apps/web/.env.example:8)

7. Patch the vulnerable dependency set reported by `pnpm audit`.
   - High findings included:
     - `rollup` arbitrary file write via path traversal
     - `picomatch` ReDoS
     - `devalue` DoS via sparse array deserialization
   - Moderate findings included vulnerable transitive versions of `svelte`, `@sveltejs/kit`, and `cookie`.
   - Audit result: 11 vulnerabilities total, including 3 high.

### Medium

8. Remove hard-coded `main` branch assumptions from draft creation, comparison, PR creation, and publish flows.
   - References:
     - [apps/web/src/lib/github/branch.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/github/branch.ts:26)
     - [apps/web/src/lib/github/pull-request.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/github/pull-request.ts:19)
     - [apps/web/src/lib/github/pull-request.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/github/pull-request.ts:46)
     - [apps/web/src/lib/utils/draft-comparison.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/utils/draft-comparison.ts:226)

9. Add a real browser hardening policy layer.
   - No CSP or other security headers are configured in the app shell or Netlify config.
   - References:
     - [apps/web/src/app.html](/Users/kilmc/code/tentman/tentman/apps/web/src/app.html:1)
     - [netlify.toml](/Users/kilmc/code/tentman/tentman/netlify.toml:1)

10. Tighten session integrity for non-token cookies too.
   - `selected_repo`, repo-session snapshots, recent repos, and OAuth request cookies are unsigned/unencrypted.
   - Lower impact than the raw token cookie, but still worth fixing when the session model is rebuilt.
   - References:
     - [apps/web/src/lib/server/auth/github.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/server/auth/github.ts:193)
     - [apps/web/src/lib/server/auth/github.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/server/auth/github.ts:229)
     - [apps/web/src/lib/server/auth/github.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/server/auth/github.ts:294)

### Lower Priority

11. Convert logout to POST and add an explicit CSRF strategy for future non-`SameSite` session models.
   - Current cookie settings help, but auth/session hardening should not rely only on `SameSite=Lax`.

12. Add security regression tests for path traversal, repo-template XSS boundaries, and local-adapter isolation.

## Notes

- Redirect target sanitization and OAuth state checking looked reasonable in the current implementation.
- Session invalidation on GitHub 401 responses is present, but it is local-cookie-only and should be revisited when the session model is rebuilt.

## 2026-05-25 Hardening Branch Closeout

The `issues-26-29-private-release-hardening` branch shipped the planned private-release hardening slice for issues `#26` through `#29`.

Implemented in this branch:

- Removed repo-provided local JavaScript reusable-block adapter loading in local mode.
- Removed `adapter` from supported block config shape so it now falls through the normal unexpected-property validation path.
- Kept the current opaque server-side GitHub session model and aligned the docs with the real implementation.
- Added server-side in-memory session expiry enforcement with:
  - 7 day idle timeout
  - 30 day absolute timeout
- Removed `SESSION_SECRET` from docs and env examples because the app does not use it.
- Threaded each selected repository's `default_branch` through repo selection, draft creation, comparison, publish view, and PR flows.
- Added a minimum browser hardening baseline in the app response layer:
  - `Content-Security-Policy`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`

Private-release deployment assumptions captured by this branch:

- The current GitHub session store is in-memory and server-local.
- Private release therefore assumes a single-instance deployment for authenticated GitHub mode.
- The header baseline is applied in the app layer, so production traffic needs to be served through that layer rather than bypassing it.

Dependency audit status after the branch updates:

- The initial `pnpm audit --prod` run reported 11 findings total.
- Safe direct upgrades in `apps/web` reduced that set to 5 remaining findings.
- The remaining findings were not fully cleared in this branch because they appear to be transitive or ecosystem-level constraints rather than isolated app-code issues.

Accepted/deferred follow-up items for private release:

- Defer the remaining `cookie` finding while it is still pulled in through the current `bits-ui -> runed -> @sveltejs/kit -> cookie` chain. This should be revisited on the next framework upgrade pass.
- Defer the remaining `rollup` finding on the `vite -> rollup` path until the Vite toolchain can move to a version that resolves `rollup` to `>=4.59.0`.
- Re-check the remaining `picomatch` findings on the `vite -> picomatch` path on the next toolchain update pass. Local inspection suggested the installed version may already be newer than the vulnerable range, so this may be stale or nested audit reporting, but that was not proven conclusively in this branch.
- Re-check the remaining `postcss` finding on the `vite -> postcss` path on the next toolchain update pass for the same reason: local inspection suggested a newer installed version than the vulnerable range, but the discrepancy was not fully resolved here.
- Keep the unresolved findings visible as release-readiness follow-up work rather than treating them as silently fixed.

Validation status for this branch:

- Targeted tests for config parsing, local-mode block loading, session expiry, default-branch handling, and publish/draft flows passed.
- Response-header tests passed.
- The repo-wide web `check` command still does not pass cleanly, but the remaining failures are broader than issues `#26` through `#29`:
  - pre-existing strict-JS typing errors in `packages/core/src/content-component-preview-css-sanitizer.js`
  - a large existing set of Svelte `state_referenced_locally` warnings
  - additional Vitest/browser typing fallout after the dependency upgrade
