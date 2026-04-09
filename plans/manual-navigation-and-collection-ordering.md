# Manual Navigation And Collection Ordering

## Summary

Add an advanced manual navigation system to Tentman built around a conventional repo file at `tentman/navigation-manifest.json`, with setup and editing exposed from a low-visibility Site Settings area in the Tentman UI.

V1 should treat the JSON manifest as a shared source of truth for Tentman and the site. Tentman will read and write it, document the contract, and offer a guided setup flow that can add missing stable config ids and generate the initial manifest from the current discovered order. Typed JS/TS consumption is explicitly deferred to a later CLI-oriented follow-up.

## Key Changes

### Config and manifest contract

- Add optional `id` to top-level `type: "content"` configs.
- Keep `idField` as the stable item identifier for collections; manual collection ordering requires `idField`.
- Do not add a root-config path setting for this in v1.
- Use a fixed conventional manifest location: `tentman/navigation-manifest.json`.
- Add a parsed manifest type and loader with a small schema:
  - `version: 1`
  - `content.items: string[]` for top-level content config order
  - `collections[configId].items: string[]` for flat manual item order
  - `collections[configId].groups?: { id: string; label: string; items: string[] }[]` for grouped/manual collection nav
- Define precedence:
  - If a manifest section exists, Tentman uses it first.
  - Unlisted existing configs/items are appended using the existing default order.
  - Missing manifest references are ignored.
  - If no manifest exists, Tentman uses current fallback behavior.

### Discovery, ordering, and setup behavior

- Extend content config parsing/discovery to preserve optional `config.id`.
- Add navigation ordering helpers that combine discovered configs, collection content, and optional manifest.
- Use those helpers for:
  - the left-hand content navigation
  - collection item navigation
  - the default `/pages` redirect target
  - the main collection page item listing
- Add guided manual-navigation setup in Site Settings:
  - show whether manual navigation is inactive, partially configured, or active
  - offer to add missing content config ids when needed for top-level manual ordering
  - block item-level manual ordering for collections missing `idField`, with clear explanation
  - generate `tentman/navigation-manifest.json` from the current discovered order
- Generated ids:
  - derive from current slug where possible
  - ensure uniqueness against existing content config ids
  - write only missing ids, never rewrite existing ids

### UI and editing model

- Add a Site Settings surface inside the existing `/pages` area, intentionally low-prominence rather than a global primary feature.
- In Site Settings, include a Manual Navigation section with:
  - current status
  - “Enable manual navigation” guided setup
  - manifest presence and validation state
  - top-level content ordering controls
  - per-collection manual ordering entry points
- V1 editing scope:
  - reorder top-level content configs
  - reorder flat collection items
  - support grouped collection navigation in the manifest contract and reader
  - if grouped editing is too large for one pass, keep grouped collection editing read-only in the UI but fully supported in the loader and docs
- Save behavior:
  - manifest edits write only `tentman/navigation-manifest.json`
  - setup edits may also update relevant `*.tentman.json` content configs to add missing `id`
- Keep this feature framed as advanced/developer-owned in copy, with a note that sites must read the same manifest if they want live-site navigation to match Tentman.

### Documentation and examples

- Update `/docs` config reference to include:
  - optional content config `id`
  - when `idField` becomes required in practice
  - `tentman/navigation-manifest.json` format and precedence rules
  - setup workflow for enabling manual navigation
  - fallback behavior for unlisted items and missing references
  - explicit note that JSON is the only supported manifest format in v1
- Update `README.md` and the `test-app` docs/example repo to show:
  - a content config with `id`
  - a collection using `idField`
  - a sample `tentman/navigation-manifest.json`
  - a short note on how a consumer site can read the manifest to mirror Tentman navigation
- Defer typed JS/TS companion files and CLI-assisted generation to a later follow-up.

## Test Plan

- Parser tests for optional content `id` and manifest schema validation.
- Discovery/bootstrap tests showing existing configs still work unchanged when no `id` or manifest is present.
- Ordering tests for:
  - manifest-ordered top-level content
  - manifest-ordered collection items
  - unlisted items appended in fallback order
  - stale manifest references ignored
- Setup tests for:
  - generating the initial manifest from current order
  - adding missing config ids without touching existing ids
  - blocking manual collection ordering when `idField` is missing
- Route/component tests for:
  - `/pages` first-page redirect using manifest order
  - sidebar and collection page using the same ordering logic
  - Site Settings status and enable/setup flow
- Docs/example acceptance:
  - example manifest matches implemented schema
  - documented file path is the same path Tentman actually reads/writes

## Assumptions And Defaults

- V1 uses a single conventional manifest path: `tentman/navigation-manifest.json`.
- JSON is the only supported manifest format in v1.
- Typed JS/TS consumption helpers are deferred to a later CLI-oriented feature.
- Manual navigation is an advanced feature exposed in a Site Settings area, not a prominent everyday control.
- Top-level manual ordering requires stable content config `id`.
- Manual collection ordering requires both content config `id` and collection `idField`.
- Guided setup is allowed to mutate repo-tracked config files and the manifest when the user explicitly enables the feature.
- Grouped collection structures are part of the manifest contract in v1; UI authoring for groups may ship in a smaller follow-up if needed, but the loader and docs should support them from the start.
