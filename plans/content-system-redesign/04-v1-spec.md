# Tentman v1 Spec Draft

## Purpose

Provide one concise implementation-facing summary of the current redesign decisions.

## Root Config

Optional.

```json
{
  "blocksDir": "./tentman/blocks",
  "configsDir": "./tentman/configs",
  "assetsDir": "./static/images",
  "blockPackages": ["@tentman/blocks-media"]
}
```

### Rules

- `blocksDir` is optional.
- `configsDir` is optional.
- `assetsDir` is optional and acts as the default upload destination.
- `blockPackages` is optional and, when present, is a string array of package names.

## Content Config

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
    { "id": "body", "type": "markdown", "label": "Body", "required": true }
  ]
}
```

### Required Fields

- `type`
- `label`
- `content`
- `blocks`

### Conditional Fields

- `itemLabel` is required when `collection: true`

### Rules

- Top-level content configs do not require an `id` in v1.
- `content.mode` must be `file` or `directory` for top-level content configs in v1.

## Block Config

```json
{
  "type": "block",
  "id": "seo",
  "label": "SEO",
  "blocks": [
    { "id": "metaTitle", "type": "text", "label": "Meta Title" }
  ]
}
```

### Required Fields

- `type`
- `id`
- `label`
- `blocks`

### Conditional Fields

- `itemLabel` is required when `collection: true`

### Rules

- Block configs default to embedded persistence.
- In v1, reusable block configs should behave as embedded structures.
- Block config IDs must be unique within the registry.

## Block Usage

```json
{ "id": "heroImage", "type": "image", "label": "Hero Image" }
```

### Required Fields

- `id`
- `type`

### Optional Fields

- `label`
- `required`
- `assetsDir`
- `collection`
- `blocks` for inline nested block definitions

## Inline Nested Block Definition

```json
{
  "id": "gallery",
  "type": "block",
  "label": "Gallery",
  "collection": true,
  "blocks": [
    { "id": "image", "type": "image", "required": true },
    { "id": "alt", "type": "text", "required": true },
    { "id": "caption", "type": "text" }
  ]
}
```

### Rules

- Inline nested block definitions are supported in v1.
- They are always embedded in v1.
- They use the generic structured adapter.
- They do not declare their own adapter path in v1.
- They may not declare `content` in v1.

## Content Modes

### Embedded

Used for nested content living inside a parent value.

```json
{ "mode": "embedded" }
```

### File

Used for content stored in one file.

```json
{
  "mode": "file",
  "path": "./src/content/site.json",
  "itemsPath": "$.team"
}
```

### Directory

Used for file-per-entry content.

```json
{
  "mode": "directory",
  "path": "./src/content/posts",
  "template": "./templates/post.md",
  "filename": "{{slug}}"
}
```

## Path Resolution

- Content config paths resolve relative to the config file that declares them.
- Block adapter paths resolve relative to the block config file that declares them.
- Root config paths resolve relative to the root Tentman config.

## Discovery Rules

- If `configsDir` is set, discover content configs recursively within it.
- Otherwise, discover `*.tentman.json` recursively across the repo.
- If `blocksDir` is set, load block configs recursively from it.
- Files under `blocksDir` are not treated as top-level content configs.
- When `configsDir` is set, top-level content discovery is limited to that directory.

## Asset Rules

- `assetsDir` defaults from the root config.
- A block usage may override that default.
- In v1, `assetsDir` is a string.

## Adapter Rules

- Built-in blocks use built-in block adapters.
- Custom block configs use the generic structured adapter by default.
- A block config may opt into a custom adapter by file path.
- In the current local browser-backed implementation, custom adapter files must be self-contained `.js` or `.mjs` ESM modules.
- Package-distributed blocks may provide an adapter object directly in their package export instead of a repo-local adapter path.
- Content persistence is handled by content adapters, not block adapters.
- Inline nested block definitions do not use custom adapter files in v1.
- Recursive validation should walk child block usages for generated structured adapters in v1.
- In the current first package-loading runtime, GitHub-backed/server mode only supports structured package blocks; package blocks that rely on direct adapter exports are rejected explicitly for now.
- Local browser-backed repository mode does not support `rootConfig.blockPackages` yet and should fail clearly if it is configured.

## Registry Rules

- Resolve block types in this order:
  1. built-ins
  2. local block configs
  3. package-distributed blocks from `rootConfig.blockPackages`
- Duplicate block IDs are hard errors in v1.
- Package modules use a named `blockPackage` export whose `blocks` array contributes reusable `type: "block"` configs after built-ins and local blocks.
