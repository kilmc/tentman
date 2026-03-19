# Adapter And Registry Architecture

## Goal

Make built-in and custom blocks use one extensible system without forcing every custom block to ship custom code.

The current direction uses two adapter layers:
- block adapters
- content adapters

## Why Two Layers

Block behavior and content persistence are different concerns.

Examples of block concerns:
- default values
- validation
- normalization
- uploads
- serialization of a single value

Examples of content concerns:
- loading JSON files
- updating JSON arrays by path
- parsing markdown frontmatter
- writing one file per entry from a template

Keeping these separate is important for clarity and maintainability.

## Block Adapter API

```ts
export type BlockUsage = {
  id: string;
  type: string;
  label?: string;
  required?: boolean;
  collection?: boolean;
  assetsDir?: string;
  blocks?: BlockUsage[];
};

export type BlockAdapterContext = {
  rootConfig: {
    assetsDir?: string;
  };
  repo: {
    writeBinaryFile(path: string, data: Uint8Array): Promise<void>;
  };
  configPath: string;
};

export type BlockAdapter = {
  type: string;
  getDefaultValue(usage: BlockUsage): unknown;
  normalize?(value: unknown, usage: BlockUsage): unknown;
  validate?(value: unknown, usage: BlockUsage): string[];
  serialize?(value: unknown, usage: BlockUsage): unknown;
  upload?(
    file: File,
    usage: BlockUsage,
    ctx: BlockAdapterContext
  ): Promise<string>;
};
```

### v1 Notes

- `collection` on a block usage is mainly relevant for inline nested block definitions.
- Primitive built-ins like `text` or `image` do not need `blocks`.
- Inline nested block definitions should be turned into generated structured adapters at parse/load time.
- Inline nested block definitions do not support custom adapter paths in v1.

## Content Adapter API

```ts
export type ContentAdapterContext = {
  repo: {
    readTextFile(path: string): Promise<string>;
    writeTextFile(path: string, content: string): Promise<void>;
    deleteFile(path: string): Promise<void>;
    listDirectory(path: string): Promise<Array<{ path: string; name: string; kind: 'file' | 'directory' }>>;
  };
  configPath: string;
};

export type ContentAdapter = {
  mode: 'embedded' | 'file' | 'directory';
  load(config: unknown, ctx: ContentAdapterContext): Promise<unknown>;
  save(config: unknown, value: unknown, ctx: ContentAdapterContext): Promise<void>;
  create?(config: unknown, value: unknown, ctx: ContentAdapterContext): Promise<void>;
  remove?(config: unknown, identity: string, ctx: ContentAdapterContext): Promise<void>;
};
```

### v1 Notes

- `embedded` content mode is primarily a nested/purely in-memory persistence strategy.
- `file` mode will need format-aware behavior for JSON and markdown-with-frontmatter.
- `directory` mode will delegate per-entry serialization based on file/template type.
- Top-level content configs should not resolve to `embedded` content mode in v1.

## Built-In Block Adapters

Built-ins like `text`, `markdown`, and `image` should be implemented as normal adapters.

That means Tentman dog-foods its own extension points instead of hardcoding one special path for built-ins and another for custom blocks.

## Generic Structured Block Adapter

Most custom blocks should not need a custom adapter file.

A generic structured adapter can be generated automatically for any block config:
- if `collection: true`, default to `[]`
- otherwise default to an object of child values
- child defaults come from each referenced child block adapter
- validation should recurse through child blocks in v1 where practical

For v1, "where practical" should mean:
- recurse through all child usages for inline nested blocks and reusable custom blocks
- use built-in child adapters for normalization and validation
- aggregate child errors into the parent error list

## Registry Resolution Order

The registry should resolve block types in this order:

1. built-in block adapters
2. local block configs from `blocksDir`
3. package-distributed blocks from `blockPackages` later

This gives us a stable future path without making phase 1 depend on package distribution.

## Local Block Configs

Local block configs live in `blocksDir`.

Each block config may optionally define:
- an `adapter` file path
- otherwise it uses the generic structured adapter

Adapter paths resolve relative to the block config file.

Example:

```json
{
  "type": "block",
  "id": "imageGallery",
  "label": "Image Gallery",
  "collection": true,
  "content": {
    "mode": "embedded"
  },
  "adapter": "./image-gallery.adapter.ts",
  "blocks": [
    { "id": "image", "type": "image", "required": true },
    { "id": "alt", "type": "text", "required": true },
    { "id": "caption", "type": "text" }
  ]
}
```

Adapter module shape:

```ts
import type { BlockAdapter } from '@tentman/core';

export const adapter: BlockAdapter = {
  type: 'imageGallery',
  getDefaultValue() {
    return [];
  },
  normalize(value) {
    return Array.isArray(value) ? value : [];
  },
  validate(value) {
    return Array.isArray(value) ? [] : ['Image Gallery must be a collection.'];
  },
  serialize(value) {
    return value;
  }
};
```

## Package Support Later

The architecture should allow blocks to be installed from npm later.

Potential root config:

```json
{
  "blocksDir": "./tentman/blocks",
  "assetsDir": "./static/images",
  "blockPackages": ["@tentman/blocks-media", "@acme/tentman-blocks"]
}
```

Potential package export:

```ts
import type { TentmanBlockPackage } from '@tentman/core';

const pkg: TentmanBlockPackage = {
  blocks: [
    {
      config: {
        type: 'block',
        id: 'heroBanner',
        label: 'Hero Banner',
        blocks: [
          { id: 'title', type: 'text' },
          { id: 'image', type: 'image' }
        ]
      }
    }
  ]
};

export default pkg;
```

## Lifecycle

### Load

1. Load the root config
2. Discover content configs
3. Load block configs from `blocksDir`
4. Register built-in adapters
5. Register local block configs
6. For each block config:
   - load adapter by path if present
   - otherwise generate a structured adapter
7. Later: register package blocks

### Form State

1. Resolve each block usage by `type`
2. Get block adapter
3. Build default or normalized value

### Save

1. Validate through block adapters
2. Serialize through block adapters
3. Hand the resulting object to the content adapter
4. Persist via `embedded`, `file`, or `directory` mode logic

## v1 Decisions

1. Adapter paths resolve relative to the block config file.
2. Generic structured adapters are the default for custom blocks.
3. Recursive child validation should be supported for inline nested blocks and reusable custom blocks in v1.
4. Package-distributed blocks remain a later extension point, not part of the first implementation pass.
5. Custom adapter files are only supported for reusable `type: "block"` configs in v1.
