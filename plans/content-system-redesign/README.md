# Tentman Content System Redesign

## Purpose

Capture the next-generation Tentman content model in a form we can implement in phases without losing the broader architectural direction.

This plan bundle covers:

- The proposed config shape for top-level content and reusable blocks
- The adapter and registry architecture
- A phased rollout from the current `singleton` / `array` / `collection` model
- A future path toward blueprints and package-distributed blocks

## Current Direction

The current Tentman model revolves around three inferred top-level content types:

- `singleton`
- `array`
- `collection`

The redesign moves toward:

- `type: "content"` for top-level editable content definitions
- `type: "block"` for reusable nested structures
- `collection: true` as a shared concept for "many entries"
- `content` as the explicit persistence contract
- `blocks` as the shared schema-building mechanism

## Locked For v1

These points are now the default direction unless implementation pressure proves otherwise:

- Top-level content configs use `type: "content"` and do not require an `id`.
- Reusable block configs use `type: "block"` and must have an `id`.
- `collection: true` means "many entries" for both content and block configs.
- Top-level content configs own independent persistence through `content`.
- Reusable block configs default to embedded persistence and are nested into content.
- Inline nested block definitions are first-class and always embedded in v1.
- `content.mode` is one of `embedded`, `file`, or `directory`, but top-level `type: "content"` configs only use `file` or `directory` in v1.
- `assetsDir` defaults from the root config and can be overridden per block usage.
- Built-in blocks and custom blocks both resolve through the same registry + adapter pipeline.
- Adapter files are loaded by path relative to the block config file.

## Working Vocabulary

- `config`
  The top-level Tentman file a developer writes. Usually a `*.tentman.json` file.
- `content config`
  A config with `type: "content"`.
- `block config`
  A config with `type: "block"`.
- `block usage`
  One item inside a parent config's `blocks` array.
- `collection`
  A config or nested structure that contains multiple entries.
- `content`
  The object that describes persistence strategy.
- `adapter`
  Code that defines how a block or content mode behaves.
- `blueprint`
  Reserved for a future higher-level scaffolding layer.

## Broad Architectural Rules

1. Top-level content and reusable blocks should share one schema-building mental model.
2. Built-in blocks should dog-food the same adapter architecture that custom blocks use.
3. Persistence should be explicit. Avoid hidden behavior that depends on context alone.
4. Nested structures should be easy to define inline, but reusable block configs should also be supported.
5. Content persistence and block behavior should remain separate concerns.
6. A future package ecosystem for blocks should be possible without redesigning the core registry.

## Draft Shape

At the highest level, the emerging config shape is:

```json
{
	"type": "content",
	"label": "Blog Posts",
	"itemLabel": "Blog Post",
	"collection": true,
	"content": {
		"mode": "directory",
		"path": "./src/content/posts",
		"template": "./templates/post.md",
		"filename": "{{slug}}"
	},
	"blocks": [
		{ "id": "title", "type": "text", "label": "Title", "required": true },
		{ "id": "body", "type": "markdown", "label": "Body", "required": true },
		{ "id": "gallery", "type": "imageGallery", "label": "Gallery" }
	]
}
```

## Plan Bundle

- `01-config-schema.md`
  Proposed config language, examples, and migration framing.
- `02-adapter-and-registry.md`
  Block adapters, content adapters, loading rules, and future package support.
- `03-phased-rollout.md`
  Recommended implementation sequence with explicit boundaries between phases.
- `04-v1-spec.md`
  Concise implementation-facing summary of the current v1 rules.
- `05-hard-cut-migration.md`
  Clean-codebase migration plan that assumes no backwards compatibility.
- `06-implementation-protocol.md`
  Execution rules for working through the plan across multiple context windows.
- `07-implementation-status.md`
  Living tracker for the current slice, completed work, next slice, and handoff notes.

## Intent

This is not meant to be the final spec. It is meant to be the smallest set of docs that keeps the design coherent while implementation starts.
