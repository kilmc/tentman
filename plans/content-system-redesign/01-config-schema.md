# Config Schema Draft

## Goal

Replace the current inferred `singleton` / `array` / `collection` model with a more explicit schema that:

- keeps persistence understandable
- allows inline and reusable nested structures
- can be rendered cleanly by developers in Svelte or other frontends

## Top-Level Config Types

### Content Config

Used for top-level editable content that Tentman discovers and manages directly.

```json
{
	"type": "content"
}
```

#### v1 Rules

- `id` is optional and should be omitted unless a future feature needs it.
- `label` is required.
- `content` is required.
- `blocks` is required.
- `itemLabel` is required when `collection: true`.
- `content.mode` must be `file` or `directory` for top-level content configs in v1.

### Block Config

Used for reusable nested structures that can be referenced from content configs or other block configs.

```json
{
	"type": "block"
}
```

#### v1 Rules

- `id` is required.
- `label` is required.
- `blocks` is required.
- `itemLabel` is required when `collection: true`.
- `content` is optional and defaults to `{ "mode": "embedded" }`.
- In v1, reusable block configs should only use embedded persistence.

## Shared Config Properties

- `label`
  Human-readable label in the CMS.
- `itemLabel`
  Singular label for entries when `collection: true`.
- `collection`
  When `true`, this config represents multiple entries.
- `content`
  Describes how this config's data is persisted.
- `blocks`
  Array of nested block usages.

## Persistence Object

The `content` object is the explicit persistence contract.

### Path Resolution

- `path`, `template`, and adapter paths resolve relative to the config file they are declared in.
- Root-level `blocksDir`, `configsDir`, and `assetsDir` resolve relative to the root Tentman config.

### Embedded

Used for nested data that lives inside its parent.

```json
{
	"content": {
		"mode": "embedded"
	}
}
```

### File

Used for data stored in a single file.

```json
{
	"content": {
		"mode": "file",
		"path": "./src/content/site.json"
	}
}
```

If the file contains a collection within a larger JSON object:

```json
{
	"content": {
		"mode": "file",
		"path": "./src/content/site.json",
		"itemsPath": "$.team"
	}
}
```

### Directory

Used for file-per-entry content.

```json
{
	"content": {
		"mode": "directory",
		"path": "./src/content/posts",
		"template": "./templates/post.md",
		"filename": "{{slug}}"
	}
}
```

## Block Usage Shape

One item in a config's `blocks` array.

```json
{
	"id": "title",
	"type": "text",
	"label": "Title",
	"required": true
}
```

### Meaning

- `id`
  Machine-facing property name for the saved value.
- `type`
  Built-in or registered block type.
- `label`
  Human-facing label in the UI.
- `required`
  Validation hint.
- `assetsDir`
  Optional override for uploaded files.

### v1 Rules

- `id` is required.
- `type` is required.
- `label` is optional.
- `required` is optional.
- `assetsDir` is optional and mainly relevant for blocks that upload files.

## Built-In Primitive Usage

Built-in primitives are not necessarily standalone block config files. They can be used directly in block usages:

```json
[
	{ "id": "title", "type": "text" },
	{ "id": "summary", "type": "textarea" },
	{ "id": "body", "type": "markdown" },
	{ "id": "email", "type": "email" },
	{ "id": "website", "type": "url" },
	{ "id": "price", "type": "number" },
	{ "id": "publishDate", "type": "date" },
	{ "id": "published", "type": "boolean" },
	{ "id": "coverImage", "type": "image" }
]
```

## Reusable Block Example

```json
{
	"type": "block",
	"id": "seo",
	"label": "SEO",
	"content": {
		"mode": "embedded"
	},
	"blocks": [
		{ "id": "metaTitle", "type": "text", "label": "Meta Title" },
		{ "id": "metaDescription", "type": "textarea", "label": "Meta Description" },
		{ "id": "ogImage", "type": "image", "label": "OG Image", "assetsDir": "./static/images/seo" }
	]
}
```

## Block Config That Is Also A Collection

```json
{
	"type": "block",
	"id": "imageGallery",
	"label": "Image Gallery",
	"itemLabel": "Image",
	"collection": true,
	"content": {
		"mode": "embedded"
	},
	"blocks": [
		{
			"id": "image",
			"type": "image",
			"label": "Image",
			"required": true,
			"assetsDir": "./static/images/galleries"
		},
		{ "id": "alt", "type": "text", "label": "Alt Text", "required": true },
		{ "id": "caption", "type": "text", "label": "Caption" }
	]
}
```

## Inline Nested Block Example

Inline nesting should be allowed for convenience, especially when a structure is only used once.

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
		{
			"id": "gallery",
			"type": "block",
			"label": "Gallery",
			"collection": true,
			"blocks": [
				{
					"id": "image",
					"type": "image",
					"label": "Image",
					"required": true,
					"assetsDir": "./static/images/galleries"
				},
				{ "id": "alt", "type": "text", "label": "Alt Text", "required": true },
				{ "id": "caption", "type": "text", "label": "Caption" }
			]
		}
	]
}
```

### Inline Block Rules

- Inline nested block definitions use `type: "block"`.
- Inline nested block definitions must declare `blocks`.
- Inline nested block definitions are always embedded in v1.
- Inline nested block definitions may not declare `content` in v1.
- Inline nested block definitions do not have their own adapter path in v1.
- Inline nested block definitions use the generic structured adapter.

## Discovery Rules

### Content Config Discovery

- If `configsDir` is defined in the root config, discover content configs recursively within that directory.
- Otherwise, discover `*.tentman.json` files recursively across the repo.
- Files inside `blocksDir` are block configs, not content configs.
- When `configsDir` is set, discovery is limited to that directory for content configs.

### Block Config Discovery

- If `blocksDir` is defined, load block configs recursively from that directory.
- Block config IDs must be unique across the registry.
- Duplicate block IDs are hard errors in v1.

## Asset Rules

- `assetsDir` in the root config is the default asset destination.
- A block usage may override it with its own `assetsDir`.
- In v1, `assetsDir` remains a string rather than a richer object.

## v1 Decisions

1. Inline nested block definitions are supported in v1.
2. Reusable block configs default to embedded persistence.
3. `assetsDir` stays a string in v1.
4. Top-level `type: "content"` configs do not need an `id`.
5. Top-level `type: "content"` configs may not use `content.mode: "embedded"` in v1.
6. Inline nested block definitions may not declare `content` in v1.
7. Duplicate block IDs are hard errors in v1.
