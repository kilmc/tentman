# Private-Release Hardening Plan for Issues #26-#29

## Summary

Land one hardening branch that removes repo-provided local JS adapters, aligns session/auth docs with actual behavior, replaces `main` assumptions with repository default-branch handling, and establishes a minimal private-release browser/deployment/dependency baseline.

This branch should be implementation-first, not just documentation-only. It should close the product decisions already made:

- remove custom local adapter-file support entirely for now
- support each repo's actual default branch
- keep the current opaque server-side session model
- use a loose private-release timeout profile rather than an aggressively short one
- avoid deprecation/migration treatment for adapters and let unsupported adapter config become ordinary config validation noise

## Key Changes

### 1. Remove local custom adapter-file support for `#26`

- Remove `adapter` from supported reusable block config shape and parsing.
- Stop loading repo-provided `.js` / `.mjs` adapter modules in local mode.
- Remove the local module-loader path from the local repository backend and block-registry loading flow.
- Keep reusable `type: "block"` configs working through the generated structured adapter only.
- Treat `adapter` as an unknown/unexpected property through the normal config validation / doctor path.
- Remove custom-adapter docs, examples, and skill/reference language rather than adding deprecation messaging.
- Delete tests that assert adapter-module loading works; replace them with tests that confirm reusable blocks still work through generated structured behavior without adapter support.

Important interface change:

- `BlockConfig.adapter` is no longer a supported config property.
- No special fallback or migration behavior should be added.

### 2. Tighten and document the current session model for `#27`

- Keep GitHub auth as an opaque server-side session id plus in-memory server-side token store.
- Remove `SESSION_SECRET` from docs and env examples unless the implementation actually starts using it in this branch.
- Add real server-side session expiry enforcement inside the in-memory session store instead of relying only on cookie lifetime.
- Track both:
  - idle timeout: refresh last-activity time on valid requests and expire inactive sessions
  - absolute timeout: expire sessions after a fixed maximum lifetime even if active
- Keep logout and 401-driven invalidation paths aligned with the new server-side expiry rules.
- Leave persistent/shared session storage out of scope for this branch; document that current private release assumes a single-instance in-memory session store.

Exact timeout profile for this plan:

- idle timeout: 7 days
- absolute timeout: 30 days

Important interface/docs change:

- auth/session docs and `.env.example` must describe the real implementation only
- no claim should remain that `SESSION_SECRET` protects sessions if it does not

### 3. Support repository default branches for `#28`

- Discover and carry the selected repository's `default_branch` in the GitHub repo identity/session bootstrap.
- Thread that branch through draft creation, PR lookup/creation, comparison, publish view, and merge/discard flows.
- Remove remaining hard-coded `main` assumptions from GitHub branch and PR helpers.
- Ensure caches and compare helpers use the resolved base branch consistently, not a literal fallback to `main`.
- Keep the managed draft branch name (`tentman-preview`) unchanged unless already required elsewhere.

Important interface change:

- `GitHubRepositoryIdentity` and related selected-repo/session payloads should include the repo default branch.
- Any code that creates a GitHub repository backend for draft/publish logic should have access to that branch value.

### 4. Establish a minimal private-release hardening baseline for `#29`

- Add a real baseline of browser/deployment security headers rather than shipping without them.
- Prefer a minimal, practical header set that does not overreach:
  - `X-Frame-Options` / `frame-ancestors`
  - `X-Content-Type-Options`
  - `Referrer-Policy`
  - a minimal CSP that matches the current app reality rather than an aspirational perfect CSP
- Apply the baseline in the app/deployment layer that actually serves production traffic, and document any Netlify-specific assumptions.
- Review and patch dependency vulnerabilities that can be upgraded safely in this branch.
- If a vulnerability cannot be safely fixed now, record it explicitly in the hardening/release-readiness notes with an accept/defer rationale.
- Update release-readiness/security planning docs so the private-release baseline is explicit and matches the shipped code.

Important baseline rule:

- this branch should ship a "minimum defendable baseline," not a full public-launch security program

## Test Plan

- Config parsing and doctor:
  - block configs with `adapter` are reported as having unexpected properties
  - reusable block configs without `adapter` still parse and work normally
- Local mode:
  - local repo refresh/discovery still works after removing adapter-module loading
  - reusable blocks still get generated defaults/validation through structured adapters
  - no local code path attempts to import repo-provided adapter modules
- Session/auth:
  - valid session ids resolve to server-side sessions as before
  - idle-expired sessions are rejected and cleared
  - absolute-expired sessions are rejected and cleared even if recently active
  - logout and GitHub 401 handling still invalidate sessions correctly
  - session bootstrap/docs tests reflect the new runtime truth and no longer mention `SESSION_SECRET`
- Branch handling:
  - draft branch creation uses the repo default branch when it is not `main`
  - draft PR lookup/creation targets the repo default branch
  - publish comparison and merge flows use the repo default branch consistently
- Hardening baseline:
  - response/header tests verify the chosen security headers are present
  - dependency update checks pass and any remaining accepted findings are documented

## Assumptions

- This branch covers issues `#26`, `#27`, `#28`, and `#29` together.
- Adapter-file support is treated as an early feature removal, not a deprecation.
- The generic config validation / doctor path should handle now-unknown `adapter` properties; do not add bespoke adapter-specific warnings.
- Private release currently targets a single-instance deployment model, so an in-memory server-side session store is acceptable for now.
- The selected loose timeout profile is intentional for private release:
  - 7 day idle timeout
  - 30 day absolute timeout
- Repo default-branch support is required and should replace `main` assumptions everywhere in the draft/publish path, not just in docs.
