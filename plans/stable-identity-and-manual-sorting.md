# Tentman Stable Identity and Manual Sorting Migration

## Summary

Refactor Tentman's identity and manual-ordering model so stable identity is Tentman-owned via `_tentmanId`, while routing and storage stay separate concerns. Keep `collection` polymorphic: `true` remains the simple collection opt-in, and an object form enables collection-specific behavior such as manual sorting and groups. Move top-level manual sorting into the root config under `content.sorting`.

## Key Changes

- **Identity model**
  - Introduce `_tentmanId` as Tentman's reserved stable identifier for:
    - top-level content configs
    - collection items
    - collection groups
    - nested repeatable items only when a future feature explicitly requires stable identity there
  - Stop using filename stems or `idField` as Tentman's internal item identity.
  - Treat existing plain `id` usage as migration residue only; migrate current Tentman-owned config/group/item identity to `_tentmanId`.

- **Config schema**
  - Extend root config with:
    - `content.sorting?: "manual"`
  - Keep content config `collection` polymorphic:
    - `collection: true` keeps current simple collection behavior
    - `collection: { sorting?: "manual"; groups?: [...] }` enables collection behavior configuration
  - Add `_tentmanId` support to content configs and group definitions.
  - Keep developer-facing route/storage fields separate from Tentman identity fields.

- **Top-level manual sorting**
  - Replace the current "manual navigation requires config.id" model with `root.content.sorting === "manual"`.
  - When enabled, Tentman manages `_tentmanId` for top-level content configs and uses those ids for sidebar/manual ordering.
  - Update settings/docs/setup flows so top-level manual ordering is explained in terms of `content.sorting: "manual"` and managed `_tentmanId`, not `config.id`.

- **Collection manual sorting and groups**
  - Replace the current "collection ordering requires config.id + idField" model with `collection.sorting === "manual"`.
  - When enabled, Tentman manages `_tentmanId` on collection items and uses those ids in navigation/order state.
  - Move group definitions into the content config under `collection.groups`.
  - Each group gets `_tentmanId`; group label/slug remain editable author-facing values.
  - The navigation manifest becomes generated/editor state for ordering and membership, not the primary source of group definitions.

- **Runtime/helper split**
  - Replace the current overloaded item-id helper model with separate helpers based on actual responsibility:
    - item stable identity: `getItemId(...)`
    - route-facing value: `getItemSlug(...)` / `getItemRoute(...)` as appropriate to the stored data
    - storage-facing value: `getItemFilename(...)` / `getItemPath(...)` as appropriate
  - Apply literal naming per data shape, not one abstract naming pattern everywhere.

- **Authoring UX**
  - Do not expose filenames to normal authors.
  - Keep filename as a storage concern handled by config and adapter logic.
  - Keep authors focused on meaningful site-facing fields like title and slug.
  - Do not implement filename sync in this pass.

- **Migration behavior**
  - Add migration/setup logic that:
    - injects missing `_tentmanId` values where a feature now requires them
    - rewrites manifest references from legacy config/item ids to `_tentmanId`
    - migrates manifest-backed groups into config-backed `collection.groups`
    - preserves existing plain `id` fields temporarily unless they are clearly Tentman-only and safe to rewrite
  - Duplicate-id policy:
    - referenced entity wins over unreferenced entity
    - otherwise lexical discovery/path order wins
    - losing duplicate gets a fresh `_tentmanId`
  - Missing-id policy:
    - generate a new `_tentmanId`
    - allow orphaned old manifest references to be dropped or refreshed during reconciliation

## Public Interfaces / Schema Changes

- **Root config**
  - Add `content?: { sorting?: "manual" }`

- **Content config**
  - Add `_tentmanId?: string`
  - Change `collection` from `boolean | undefined` to:
    - `true`
    - `{ sorting?: "manual"; groups?: CollectionGroupConfig[] }`

- **Group config**
  - Add group objects under `collection.groups`
  - Shape:
    - `_tentmanId: string`
    - `label: string`
    - `slug?: string`

- **Navigation manifest**
  - Keep current general role, but migrate references to `_tentmanId`
  - Treat config groups as source of truth; manifest stores generated ordering/membership state and any copied label/slug data needed by current UI flows

## Test Plan

- Parse root config with and without `content.sorting`.
- Parse content configs with:
  - no collection
  - `collection: true`
  - `collection: { sorting: "manual" }`
  - `collection: { groups: [...] }`
- Verify top-level manual ordering uses config `_tentmanId`, not legacy `id`.
- Verify collection ordering uses item `_tentmanId` for both file-backed and directory-backed content.
- Verify directory-backed items can be reordered/grouped without using filename as internal identity.
- Verify group select options resolve from config-backed groups through the updated state path.
- Verify adding a group updates config-owned group definitions and resulting generated state correctly.
- Verify migration of existing configs/manifests adds `_tentmanId` and preserves ordering as expected.
- Verify duplicate and missing `_tentmanId` repair behavior is deterministic.
- Verify filenames are no longer required or surfaced in normal author-facing flows beyond internal storage handling.

## Assumptions and Defaults

- `collection: true` remains the minimal "this is a collection" form with no manual sorting/groups implied.
- Manual sorting is the only supported sorting mode in this pass; other sorting keywords are deferred.
- Permalinks, redirect/history behavior, and filename-sync behavior are out of scope.
- Existing plain `id` fields may remain during migration, but new Tentman-owned stable identity is `_tentmanId`.
- The implementation should prefer behavior-level migration and reconciliation over preserving early API shapes.
