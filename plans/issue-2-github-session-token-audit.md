# GitHub Session And Token Handling Audit

Issue: [#2](https://github.com/kilmc/tentman/issues/2)

## Scope reviewed

- GitHub OAuth login and callback flow
- token and session storage
- session invalidation and expiry behavior
- redirect safety
- draft branch / publish safety
- whether documented env and session assumptions match the code

Reviewed code:

- [apps/web/src/routes/auth/login/+server.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/routes/auth/login/+server.ts)
- [apps/web/src/routes/auth/callback/+server.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/routes/auth/callback/+server.ts)
- [apps/web/src/lib/server/auth/github.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/server/auth/github.ts)
- [apps/web/src/hooks.server.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/hooks.server.ts)
- [apps/web/src/lib/server/page-context.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/server/page-context.ts)
- [apps/web/src/lib/features/draft-publishing/service.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/features/draft-publishing/service.ts)
- [apps/web/src/lib/github/branch.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/github/branch.ts)
- [apps/web/src/lib/github/pull-request.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/github/pull-request.ts)
- [apps/web/src/lib/utils/draft-comparison.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/utils/draft-comparison.ts)
- [README.md](/Users/kilmc/code/tentman/tentman/README.md)

## Overall assessment

The issue is well-defined enough to investigate, and the current auth flow is understandable. The main release concern is not the OAuth redirect flow itself. The biggest problem is that Tentman currently stores a full GitHub bearer token directly in a client cookie for up to 30 days, while the docs imply there is a session-secret-backed model that does not actually exist in code.

## Findings

### Fix now

#### 1. GitHub access token is stored directly in a client cookie

Severity: high

Evidence:

- `persistGitHubSession()` writes `session.token` directly to `github_token` at [apps/web/src/lib/server/auth/github.ts:162](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/server/auth/github.ts:162)
- `readGitHubSession()` reads that same cookie back and treats it as the active credential at [apps/web/src/lib/server/auth/github.ts:179](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/server/auth/github.ts:179)
- `hooks.server.ts` copies the cookie value into `event.locals.githubToken` for request-time GitHub API access at [apps/web/src/hooks.server.ts:13](/Users/kilmc/code/tentman/tentman/apps/web/src/hooks.server.ts:13)

Why it matters:

- The GitHub OAuth scope requested is `repo`, which is broad write access for private repo workflows at [apps/web/src/routes/auth/login/+server.ts:31](/Users/kilmc/code/tentman/tentman/apps/web/src/routes/auth/login/+server.ts:31)
- `httpOnly`, `sameSite=lax`, and `secure` in production reduce exposure, but they do not change the fact that the browser is holding the bearer token itself
- There is no signing, encryption, or server-side session indirection around the token
- Any leak of that cookie is a leak of the GitHub credential, not just a Tentman session identifier

Release recommendation:

- Move to a server-side session store, or at minimum an encrypted and integrity-protected session cookie that does not expose the raw GitHub token to the browser

#### 2. Session secret is documented, but unused

Severity: medium-high

Evidence:

- README tells operators to set `SESSION_SECRET` at [README.md:62](/Users/kilmc/code/tentman/tentman/README.md:62)
- `.env.example` also documents `SESSION_SECRET` at [apps/web/.env.example](/Users/kilmc/code/tentman/tentman/apps/web/.env.example)
- I could not find any runtime use of `SESSION_SECRET` in the web app code

Why it matters:

- Operators are likely to assume sessions are signed or encrypted when they are not
- This creates a false sense of protection around auth/session handling
- The documentation currently describes a security property the app does not implement

Release recommendation:

- Either implement `SESSION_SECRET`-backed session protection now, or remove the variable from docs until it is real
- This should be resolved together with the raw-token-cookie issue, not treated as docs-only cleanup

#### 3. Draft publish flow assumes the base branch is always `main`

Severity: medium, potentially high if non-`main` repos are in scope

Evidence:

- Draft branch creation defaults to `fromBranch = 'main'` at [apps/web/src/lib/github/branch.ts:26](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/github/branch.ts:26)
- Draft PR lookup and creation hard-code `base: 'main'` at [apps/web/src/lib/github/pull-request.ts:19](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/github/pull-request.ts:19) and [apps/web/src/lib/github/pull-request.ts:46](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/github/pull-request.ts:46)
- Publish view compares draft work against `main` at [apps/web/src/routes/api/repo/publish-view/+server.ts:45](/Users/kilmc/code/tentman/tentman/apps/web/src/routes/api/repo/publish-view/+server.ts:45)
- Draft comparison metadata also hard-codes `main` at [apps/web/src/lib/utils/draft-comparison.ts:226](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/utils/draft-comparison.ts:226)

Why it matters:

- On repos whose default branch is not `main`, draft creation, comparison, PR creation, and publish behavior can fail or target the wrong branch
- That is a workflow-safety problem in the publish path, which is part of the issue scope

Release recommendation:

- If private release is intended to support only `main`-based repos, document that constraint explicitly before shipping
- Otherwise, resolve default-branch handling before private release

### Acceptable for private release

#### 4. Redirect target sanitization is in place and reasonably strict

Evidence:

- Login route sanitizes the requested redirect target before storing it at [apps/web/src/routes/auth/login/+server.ts:15](/Users/kilmc/code/tentman/tentman/apps/web/src/routes/auth/login/+server.ts:15)
- `sanitizeAuthRedirectTarget()` rejects off-origin targets and `/auth` routes at [apps/web/src/lib/utils/routing.ts:51](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/utils/routing.ts:51)
- Callback redirects only to the sanitized stored target at [apps/web/src/routes/auth/callback/+server.ts:15](/Users/kilmc/code/tentman/tentman/apps/web/src/routes/auth/callback/+server.ts:15)

Assessment:

- I did not find an open redirect in the current flow
- For the current private-release scope, this part looks acceptable

#### 5. OAuth state checking exists and is cleared on mismatch

Evidence:

- Login creates a random state and stores it before redirecting to GitHub at [apps/web/src/routes/auth/login/+server.ts:17](/Users/kilmc/code/tentman/tentman/apps/web/src/routes/auth/login/+server.ts:17) and [apps/web/src/routes/auth/login/+server.ts:33](/Users/kilmc/code/tentman/tentman/apps/web/src/routes/auth/login/+server.ts:33)
- Callback compares the returned state with the stored state and clears the request on mismatch at [apps/web/src/routes/auth/callback/+server.ts:22](/Users/kilmc/code/tentman/tentman/apps/web/src/routes/auth/callback/+server.ts:22)

Assessment:

- This is the expected baseline defense for the OAuth flow
- The state is still cookie-backed, so it benefits from the broader cookie/session hardening work, but the control itself is present

### Follow up later

#### 6. Session invalidation is mostly reactive and local-only

Evidence:

- Session cookies are long-lived for 30 days at [apps/web/src/lib/server/auth/github.ts:24](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/server/auth/github.ts:24)
- 401 responses clear the local session via `createGitHubServerClient()` and `handleGitHubSessionError()` at [apps/web/src/lib/server/auth/github.ts:342](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/server/auth/github.ts:342) and [apps/web/src/lib/server/auth/github.ts:363](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/server/auth/github.ts:363)
- Logout clears local cookies only at [apps/web/src/routes/auth/logout/+server.ts:1](/Users/kilmc/code/tentman/tentman/apps/web/src/routes/auth/logout/+server.ts:1)

Assessment:

- Tentman does clear local state when GitHub rejects the token, which is a good baseline
- There is no server-side revocation or central invalidation model
- This is a reasonable follow-up for a private release if the raw-token-cookie problem is fixed first

## Release decision guidance

### Fix before private `0.1.0`

- Stop storing the raw GitHub bearer token directly in a client cookie
- Align docs with reality by either implementing `SESSION_SECRET`-backed protection or removing the claim
- Decide whether Tentman is `main`-only for now; if not, fix base-branch handling before release

### Acceptable to defer until after private `0.1.0`

- More advanced session revocation and expiry controls beyond clearing on logout and 401
- Additional audit logging or richer auth observability

## Suggested next implementation slice

1. Replace raw `github_token` cookie storage with a server-side session identifier or encrypted session blob
2. Wire `SESSION_SECRET` into that session model, or remove it from docs and env examples until implemented
3. Thread repository default-branch discovery into draft branch creation, PR creation, comparison, and publish views
