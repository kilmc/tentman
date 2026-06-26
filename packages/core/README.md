# `@tentman/core`

Core Tentman utilities for loading project config, inspecting content, validating schemas, rebuilding navigation, and rendering content-component targets.

## Install

```sh
npm install @tentman/core
```

## Exports

- main module: `@tentman/core`
- content-component helpers: `@tentman/core/content-components`

This package is the shared runtime used by the Tentman web app, mdsvex integration, and future publishing flows.

## Asset Config

`@tentman/core` owns Tentman's root asset mapping. Configure uploads in `tentman.json` with:

```json
{
  "assets": {
    "path": "./tentman/configs/assets",
    "publicPath": "/assets"
  }
}
```

Tentman writes files to `assets.path` and writes references under `assets.publicPath`. The site or build system remains responsible for serving those references.
