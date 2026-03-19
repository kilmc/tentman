# Hard-Cut Migration Plan

## Purpose

This migration plan assumes:
- no backwards compatibility
- no dual-schema support
- no legacy code retained just to ease rollout

The goal is to replace the current config/content model cleanly and keep the codebase easier to reason about afterward.

## Migration Strategy

Use a hard cutover:

1. Define the new schema and internal boundaries first.
2. Replace discovery, parsing, and runtime types to only understand the new config format.
3. Replace fetch/write logic with adapter-driven content handling.
4. Replace form generation to use `blocks` instead of legacy `fields`.
5. Delete all legacy `singleton` / `array` / `collection` branching.
6. Update the example/test site configs to the new format.

This is intentionally disruptive but keeps the implementation honest.

## What Gets Removed

### Concepts To Delete

- `singleton`
- `array` as a top-level config concept
- inferred config type from config shape
- legacy `fields` as the primary schema system
- nested `array` field type as the main repeatable structure mechanism

### Current Files And Responsibilities To Replace

#### [src/lib/types/config.ts](/Users/kilmc/code/tentman/src/lib/types/config.ts)

Replace:
- `SingletonConfig`
- `SingleFileArrayConfig`
- `MultiFileCollectionConfig`
- `ConfigType = 'singleton' | 'array' | 'collection'`
- field normalization centered around legacy `fields`

With:
- new `ContentConfig`
- new `BlockConfig`
- new `BlockUsage`
- new `content.mode` shapes

#### [src/lib/config/discovery.ts](/Users/kilmc/code/tentman/src/lib/config/discovery.ts)

Replace:
- `inferConfigType`
- implicit type detection from `contentFile`, `collectionPath`, and `template`

With:
- explicit parsing of `type: "content"` and `type: "block"`
- content config discovery
- block config loading from `blocksDir`

#### [src/lib/content/fetcher.ts](/Users/kilmc/code/tentman/src/lib/content/fetcher.ts)

Replace:
- `fetchSingleton`
- `fetchArrayItems`
- `fetchCollectionItems`
- `ConfigType`-driven branching

With:
- content adapter dispatch by `content.mode`
- file content adapter
- directory content adapter
- embedded content behavior used only within nested structures

#### [src/lib/content/writer.ts](/Users/kilmc/code/tentman/src/lib/content/writer.ts)

Replace:
- `saveSingleton`
- `saveArrayItem`
- `saveCollectionItem`
- `createArrayItem`
- `createCollectionItem`
- `deleteArrayItem`
- `deleteCollectionItem`
- `configType === 'singleton' | 'array' | 'collection'` branching

With:
- content adapter write pipeline
- explicit create/update/delete behavior from `content.mode`

#### [src/lib/features/forms/helpers.ts](/Users/kilmc/code/tentman/src/lib/features/forms/helpers.ts)

Replace:
- assumptions built around `FieldDefinition`
- default value logic centered on primitive field types plus legacy `array`

With:
- block usage default value resolution through block adapters

#### [src/lib/components/form/FormField.svelte](/Users/kilmc/code/tentman/src/lib/components/form/FormField.svelte)

Replace:
- `fieldDef` branching
- direct switch on old `fieldType`
- special-case `array`

With:
- adapter-aware block rendering pipeline
- block usage rendering based on `type`

#### [src/lib/components/form/ArrayField.svelte](/Users/kilmc/code/tentman/src/lib/components/form/ArrayField.svelte)

Likely remove or heavily repurpose.

Its responsibility should be absorbed into:
- generic collection block editing
- inline nested block handling

## New Architecture To Introduce

### Suggested New Modules

- `src/lib/config/types.ts`
  New config schema types.
- `src/lib/config/parse.ts`
  Parse and validate top-level content and block configs.
- `src/lib/config/discover-content.ts`
  Content config discovery.
- `src/lib/config/discover-blocks.ts`
  Block config discovery.
- `src/lib/blocks/registry.ts`
  Built-in + local block registry.
- `src/lib/blocks/adapters/*.ts`
  Built-in block adapters.
- `src/lib/blocks/structured-adapter.ts`
  Generic adapter generation for custom blocks.
- `src/lib/content/adapters/file.ts`
  File-mode persistence.
- `src/lib/content/adapters/directory.ts`
  Directory-mode persistence.
- `src/lib/content/adapters/embedded.ts`
  Nested embedded persistence behavior.
- `src/lib/content/service.ts`
  Unified read/write orchestration.

These names are suggestive, not final, but the feature/domain split is important.

## Recommended Migration Sequence

### Step 1: Freeze The New Types

Implement the new TypeScript types first:
- content config
- block config
- block usage
- root config
- adapter interfaces

This gives the rest of the rewrite stable boundaries.

### Step 2: Replace Config Parsing

Switch parsing from inferred legacy shape to explicit `type`.

After this point:
- old config files should no longer load
- new config examples should be the only supported shape

### Step 3: Build The Block Registry

Introduce:
- built-in block adapters
- block config loading from `blocksDir`
- generated structured adapters for reusable blocks

This should happen before form rendering is rewritten so the UI can resolve block usages through one path.

### Step 4: Rewrite Form Generation

Replace legacy field handling with block usage handling.

Key goals:
- one rendering path for built-in and custom block usages
- support for inline nested block definitions
- support for collection blocks

### Step 5: Rewrite Content Persistence

Introduce content adapters and replace legacy fetch/write modules.

Do not preserve wrapper compatibility around the old `fetchContent` and `writer` APIs if that creates muddy abstractions.

Prefer:
- new service API
- new adapter interfaces
- hard replacement of the old modules

### Step 6: Update Routes And Pages

Replace references to:
- `config.type`
- `singleton`
- `array`
- `collection`
- `fields`

With:
- top-level config `type`
- `collection: true`
- `blocks`
- adapter-driven content handling

### Step 7: Delete Legacy Code

Once the new pipeline is wired through:
- remove old config inference
- remove old field normalization logic that only exists for the legacy format
- remove `ArrayField` if it no longer serves a clear purpose
- remove dead tests that only validate legacy concepts

## Testing Strategy

Since this is a hard cutover, testing should focus on the new model only.

### Add Tests For

- content config parsing
- block config parsing
- block registry loading
- duplicate block ID hard failures
- built-in block default values and validation
- generic structured adapter defaults and validation
- file-mode JSON persistence
- file-mode markdown frontmatter persistence
- directory-mode create/update/delete
- inline nested block definitions
- reusable collection block configs

### Remove Tests For

- inferred legacy config type behavior
- legacy `array` field semantics
- `singleton`-specific logic
- any code path that only exists to bridge the old and new config shapes

## Config Migration Guidance

We do not need automatic migration tooling first.

For the test/demo site:
- manually rewrite existing `*.tentman.json` files to the new format
- create initial reusable blocks under `blocksDir`
- verify the new shape against real content

If manual migration becomes annoying later, we can build a one-off transform script after the system is working.

## Risks To Watch

### Risk 1: Too Much Compatibility Thinking Leaks Back In

Avoid:
- keeping `ConfigType`
- preserving `inferConfigType`
- accepting both `fields` and `blocks`
- keeping `array` as a top-level runtime concept

### Risk 2: Block Adapters And Content Adapters Collapse Together

Avoid:
- putting frontmatter/JSON persistence logic into block adapters
- putting image upload logic into content adapters

### Risk 3: Inline Nested Blocks Become A Special Case

Avoid:
- separate rendering and validation paths for inline nested blocks if possible

Instead:
- normalize them into generated structured adapters early

## Suggested First Implementation Slice

If we want the smallest meaningful vertical slice:

1. new config types and parser
2. built-in `text`, `markdown`, and `image` block adapters
3. new form rendering for primitive blocks
4. file-mode JSON persistence
5. one single-record content config working end-to-end

After that:
- add directory mode
- add reusable block configs
- add inline nested block definitions
- add markdown frontmatter persistence

## Bottom Line

The migration should be a replacement, not a reconciliation.

The cleanest codebase outcome comes from:
- replacing the schema fully
- replacing the runtime branching fully
- updating the test configs manually
- deleting legacy concepts as soon as the new path is working
