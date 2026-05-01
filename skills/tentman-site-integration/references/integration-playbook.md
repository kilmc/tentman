# Tentman Integration Playbook

Use this file after loading `SKILL.md`.

## Refresh The Public Docs

Fetch these sources at the start of each task:

- `https://tentman.netlify.app/docs`
- `https://raw.githubusercontent.com/kilmc/tentman/main/README.md`

Optional freshness check:

- `git ls-remote https://github.com/kilmc/tentman.git HEAD`

Use the published docs to confirm:

- root config fields
- content config shape
- content modes
- reusable block configs
- package block limits
- custom adapter limits
- path resolution rules

If the published docs are unavailable, or the user explicitly asks for unreleased behavior, inspect the local repo state and say that you are relying on unpublished behavior.

If the local repo contains current Tentman code or the Tentman CLI, use that local state to validate assumptions and file changes after you anchor the guidance in the published docs.

## Inspect The Site Before Designing Configs

Answer these questions from the repo itself:

1. What framework renders the site?
2. Which files are the canonical source for editable content?
3. Is each editable area a singleton page, a directory-backed collection, or a file-backed collection?
4. Are there repeated nested structures that justify a reusable block?
5. Where should uploaded images land?
6. Is there a preview URL or Netlify site name worth wiring into `.tentman.json`?

Useful repo signals:

- `package.json`
- framework config files
- route loaders
- markdown or frontmatter parsers
- JSON or YAML loaders
- existing CMS, admin, or editorial config folders
- existing `.tentman.json`, `*.tentman.json`, `tentman/blocks`, `tentman/plugins`, or navigation manifest files

If the repo already contains Tentman files, treat the task as an update or migration unless the user explicitly wants a redesign.

Useful CLI-driven inspection when available:

- `tentman doctor .`
- `tentman content list .`
- `tentman content inspect <config-reference> .`
- `tentman schema <config-reference> .`
- `tentman nav print .`

If `tentman` is not on `PATH` but you are working inside the Tentman monorepo, use the workspace wrapper:

- `pnpm run tentman -- doctor .`
- `pnpm run tentman -- content list .`

## Choose The Smallest Tentman Shape

Default mapping:

- One markdown or MDX file per item: use `content.mode: "directory"`.
- One JSON file for one page: use `content.mode: "file"`.
- One JSON file with a nested list: use `content.mode: "file"` plus `itemsPath`.
- Repeated grouped data across multiple content domains: promote to a reusable `type: "block"`.

Prefer compatibility:

- Keep existing file locations when possible.
- Keep existing frontmatter keys and JSON keys when possible.
- Match Tentman blocks to the data the site already reads.
- Avoid moving or rewriting content unless the current layout blocks a clean integration.

Prefer author-facing models over implementation leakage:

- Expose fields the editor actually needs to control.
- Hide or derive technical ids, routing tokens, wrapper arrays, and lookup-only values when possible.
- Use `collection: true` only for things authors should add, remove, and reorder directly.

## Implement Carefully

Typical files to add or update:

- `.tentman.json`
- `tentman/configs/*.tentman.json`
- `tentman/blocks/*.tentman.json`
- template files for directory-backed content

Common root fields:

- `siteName`
- `configsDir`
- `blocksDir`
- `assetsDir`
- `local.previewUrl`
- `netlify.siteName`
- `blockPackages`

Common built-in block types:

- `text`
- `textarea`
- `markdown`
- `email`
- `url`
- `number`
- `date`
- `boolean`
- `image`

Other integration surfaces worth checking when relevant:

- `tentman/navigation-manifest.json`
- `tentman/plugins/*/plugin.js`
- template files referenced by directory-backed configs
- custom adapter modules referenced by blocks

## Validate Before Finalizing

Check for:

1. Relative paths resolving from the correct file.
2. Template placeholders matching the chosen block ids.
3. `collection`, `itemLabel`, and `idField` being coherent for multi-item content.
4. Asset paths matching where the site actually serves images from.
5. Local-mode limitations around `blockPackages` and adapter modules.
6. CLI diagnostics from `tentman doctor`, `tentman ci`, `tentman nav check`, `tentman assets check`, or `tentman format --check` when those commands are available in the repo.

## Report Like A Migration Guide

Close each task with:

1. Which published Tentman docs you checked.
2. What site structure you found.
3. What Tentman files you added or changed.
4. Any unresolved mismatch between the site and Tentman's current feature set.
