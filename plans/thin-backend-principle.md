# Thin Backend Principle

Tentman defaults to client execution unless secrets, trust, or privileged mutations require the server.

The practical rule is:

- Content and config reads should prefer thin `/api/*` endpoints plus client-owned route loads and cache
- Server compute is a costed exception, not the default
- GitHub tokens stay on the server and never enter browser JavaScript
- Privileged GitHub-backed writes such as publish, merge, discard, image upload, and content saves stay in server actions or endpoints
- Freshness should come from explicit invalidation and refresh, not hidden background server work

When adding new code, prefer these questions:

1. Can the browser own this state or fetch?
2. Does this need a hidden token or trusted server authority?
3. If the server is required, can the surface stay small and machine-oriented?

Guardrails:

- Every route server entrypoint must declare a `SERVER_JUSTIFICATION` header
- `+page.server.ts` and `+layout.server.ts` are reserved for privileged mutations, not read loads
- Universal route files must not import `$lib/server/*`
- Direct GitHub client creation and direct Octokit request usage should stay inside the approved thin-backend server layer
