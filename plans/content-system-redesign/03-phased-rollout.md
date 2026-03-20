# Phased Rollout

## Goal

Ship the redesign incrementally without losing the larger architecture.

The idea is to build the lowest-risk foundational pieces first, while preserving a path toward reusable blocks, custom adapters, and eventually blueprints.

## Phase 1: Core Config Language

### Objective

Replace the current inferred top-level type system with the explicit config language:
- `type: "content"`
- `type: "block"`
- `collection: true`
- `content.mode`
- `blocks`

### Scope

- Add config parsing for the new schema
- Keep discovery of co-located `*.tentman.json`
- Add optional root `blocksDir`, `configsDir`, and `assetsDir`
- Support built-in primitive block usages
- Support content persistence modes:
  - `file`
  - `directory`
  - `embedded`
- Support block configs from `blocksDir`

### Non-Goals

- Package-distributed blocks
- Blueprints
- Rich custom adapter ecosystem
- Arbitrary inline markdown placement of renderable blocks

## Phase 2: Generic Block System

### Objective

Make custom blocks and inline nested block definitions work without special-case code.

### Scope

- Generic structured block adapter
- Reusable block configs
- Inline nested block definitions
- Collection blocks with `collection: true`
- Migration path from current nested `array` field patterns

### Notes

This phase is where the old nested `array` behavior should be replaced by the new shared block model.

## Phase 3: Content Persistence Cleanup

### Objective

Separate block behavior from persistence behavior in implementation, not just in docs.

### Scope

- Introduce explicit content adapters for:
  - JSON file mode
  - markdown frontmatter file mode
  - directory mode
- Formalize how `itemsPath` works for JSON files
- Add frontmatter update pipeline for markdown-backed entries
- Keep path resolution rules explicit and consistent

### Notes

This phase is especially important for replacing the current JSON-array update logic with a more general file/frontmatter-aware persistence layer.

## Phase 4: Optional Custom Adapter Files

### Objective

Allow block configs to opt into custom adapter code when the generic structured adapter is not enough.

### Scope

- Load adapter files by path
- Define stable adapter module shape
- Add guard rails and validation around adapter loading
- Keep custom adapters optional

### Notes

Most custom blocks should still work with the generated structured adapter.

## Phase 5: Package-Distributed Blocks

### Objective

Open the registry up to npm-distributed block packages.

### Scope

- Add `blockPackages` root config support
- Define package export contract
- Merge package blocks into the registry after built-ins and local blocks
- Validate conflicts and surface warnings clearly

### Notes

This phase should only happen after the local registry and adapter APIs feel stable.

For the current redesign push, Phase 5 is considered complete once:
- `blockPackages` exists in the root config
- the package export contract is defined
- GitHub-backed/server mode can load structured package blocks
- the runtime limits are documented clearly

Broader package runtime support can wait until the redesigned content system has been tried on real content.

## Phase 6: Blueprints

### Objective

Introduce a higher-level scaffolding layer for generating content structures and possibly site structure.

### Scope

- Reserve the `blueprint` term for this layer
- Allow blueprints to scaffold content configs, files, and related structure
- Build on top of the stable config + block + adapter system

### Notes

This is deliberately later. The config redesign should stand on its own even if blueprints take much longer to land.
Blueprints/scaffolding should not block shipping or trialing the refactored core content system.

## Implementation Order Recommendation

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Pause and evaluate
6. Phase 5
7. Pause and evaluate again
8. Phase 6

## Why This Order

- Phase 1 gives us a real replacement for the current config shape.
- Phase 2 restores ease of nested authoring and reusable structures.
- Phase 3 makes persistence honest and robust.
- Phase 4 opens the extension model without making it mandatory.
- Phase 5 is useful once the core block/adapter model is stable, but it can stop at a narrow first runtime.
- Phase 6 is valuable, but should only start after the redesigned system has been used enough to justify scaffolding on top of it.

## Suggested Deliverables Per Phase

### Phase 1

- parser/types for new config schema
- discovery updates
- root config updates
- initial migration examples

### Phase 2

- inline nested block support
- block registry
- generic structured block adapter

### Phase 3

- content adapters
- JSON file update handler
- markdown frontmatter update handler
- directory item persistence cleanup

### Phase 4

- adapter loading by path
- adapter validation
- docs for writing custom adapters

### Phase 5

- package registry hooks
- package block loading
- conflict diagnostics

### Phase 6

- blueprint directory
- blueprint schema
- scaffolding pipeline
