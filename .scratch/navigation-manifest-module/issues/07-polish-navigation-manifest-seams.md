# 07 — Polish remaining navigation manifest seams

**What to build:** Follow up on the audit findings that are too small to reopen the main navigation manifest architecture project, but still worth cleaning up so the final seam stays crisp.

**Blocked by:** None — the navigation manifest architecture project is complete enough to close; this is a follow-up cleanup ticket.

**Status:** complete

- [x] Replace the duplicated collection-reference lookup in `apps/web/src/lib/features/content-management/navigation-group-options.ts` with the core `getNavigationManifestCollection` helper.
- [x] Keep the existing select-option behavior covered, especially lookups by collection key, canonical id, authored config id, and slug.
- [x] Decide whether the duplicated `toNavigationReferences(ids)` helpers in web should stay as tiny local adapters or move behind a shared helper.
- [x] Collapse the repeated collection-reference identity check inside `packages/core/src/manifest.js` so `getNavigationManifestCollectionEntry` delegates to `getNavigationManifestCollectionReferenceIds`.
- [x] Either justify the instruction fixture files under `packages/core/src/fixtures/core-project/tentman/instructions/create-page/` as intentional fixture realism or remove them if they remain unused.

Completed in `c148254` (`Polish navigation manifest seams`).

Verification:

- `pnpm --filter @tentman/web exec vitest run src/lib/features/content-management/navigation-group-options.spec.ts`
- `pnpm --filter @tentman/core exec node --test src/manifest.test.js`
- `pnpm run test:core`
- `pnpm --filter @tentman/web run check`
- `pnpm run verify:baseline`

Audit evidence:

- `navigation-group-options.ts` currently has a local `getManifestCollectionByReference` that duplicates the core collection lookup semantics.
- `navigation-draft.ts` and `navigation-manifest.ts` both define the same small `toNavigationReferences(ids)` helper.
- `packages/core/src/manifest.js` encodes collection reference identity once in `getNavigationManifestCollectionReferenceIds` and again in the explicit lookup comparisons inside `getNavigationManifestCollectionEntry`.
- `rg -n "create-page|instructions|instruction" packages/core/src/*.test.js packages/core/src/*.js packages/core/src/fixtures/core-project` only found the fixture instruction file itself at audit time.

Suggested verification:

```sh
pnpm run test:core
pnpm --filter @tentman/web run check
pnpm --filter @tentman/web exec vitest run src/lib/features/content-management/navigation-group-options.spec.ts
```
