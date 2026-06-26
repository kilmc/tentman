# Tentman CLI

Local-first command-line tools for inspecting and maintaining Tentman-managed sites.

Tentman is pre-1.0. The CLI is useful today, but command output and some write behavior may still change between early releases.

## Install

```sh
npm install --save-dev tentman
```

Run it from the root of a Git repository that contains `tentman.json`:

```sh
npx tentman doctor
npx tentman ci
```

## Common Commands

```sh
tentman doctor
tentman ci
tentman content list
tentman schema
tentman nav check
tentman nav print
tentman assets check
tentman format --check
```

Write commands are intentionally explicit:

```sh
tentman ids write
tentman nav refresh
tentman nav rebuild
tentman format --write
```

## Trust Model

The CLI works against your local checkout. It does not perform hidden network operations.

Read-only checks print diagnostics and return non-zero exit codes when errors are found. Write commands report the files they update and are intended for Tentman-owned metadata, manifests, and formatting paths.

## Project Shape

Tentman expects to manage a real Git repository. The repository root should contain `tentman.json`, with optional content configs under `tentman/configs`, reusable blocks under `tentman/blocks`, and a navigation manifest at `tentman/navigation-manifest.json`.

Managed uploads use root asset mapping:

```json
{
  "assets": {
    "path": "./static/images",
    "publicPath": "/images"
  }
}
```

Tentman writes files to `assets.path` and writes content references under `assets.publicPath`; your site is responsible for serving that public path.

For lower-level programmatic APIs, see `@tentman/core`, but most projects should start with this CLI.
