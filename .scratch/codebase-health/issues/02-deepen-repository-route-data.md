# Deepen repository route data

Status: needs-triage
Type: architecture-improvement
Strength: Strong
Suggested order: Second tier
Source report: `/var/folders/l3/0q53d3812t3gvm4ytx3fp2680000gn/T/architecture-review-20260710-222036.html#repository-route-data`

## Affected files

- `apps/web/src/lib/server/repository-data/route-data.ts`
- `apps/web/src/lib/stores/content-cache.ts`
- `apps/web/src/lib/stores/github-repository-cache.ts`

## Problem

Route modules and browser cache modules know when Tentman uses repository-data indexes, legacy content-cache, and block support payloads.

The report describes route endpoints and browser cache behavior leaking knowledge of repository snapshots, route-data fallback, repository-data indexes, legacy content-cache, API routes, and block support details.

## Proposed direction

Put page, item, and collection view assembly behind one deeper repository route data module. Keep GitHub/local adapters at the seam.

## Expected benefits

- Locality: fallback logic concentrates in one module.
- Leverage: fewer endpoint tests need to know the assembly details.
- Interface clarity: callers stop caring which cache or index implementation served the view data.

## Grill-with-docs prompt

Use this candidate as the focus for a `grill-with-docs` session. Do not re-run the architecture survey. Grill the route data responsibilities, cache boundaries, adapter contract, compatibility with legacy content-cache, and the tests needed before extracting anything.

## Comments
