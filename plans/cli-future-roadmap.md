# Tentman CLI Future Roadmap

## Summary

This document captures useful CLI features beyond the initial core/CLI foundation. Most of these should exist eventually, but they do not all need to ship in the first internal CLI.

The guiding idea is that Tentman should own the operations that require Tentman-specific knowledge. Developers and agents should run commands instead of hand-editing generated state, ids, manifests, and integration files.

## Developer Experience Commands

### `tentman init`

Scaffold or connect a site to Tentman.

Possible forms:

```sh
tentman init
tentman init --framework sveltekit
tentman init --site-name "Theresa Grieben"
tentman init --content src/content/projects --type collection
```

Responsibilities:

- detect common frameworks
- detect likely content folders
- detect static/public asset directories
- create `.tentman.json`
- create `tentman/configs`
- create `tentman/blocks`
- create initial templates for directory-backed content
- optionally create a starter navigation manifest
- explain what was inferred and what needs review

### `tentman doctor`

Long-term `doctor` should become the main health check.

Additional checks beyond the initial version:

- preview URL is reachable
- configured deployment target exists
- Git provider settings are coherent
- plugins are registered and resolvable
- markdown plugins are enabled only where supported
- block packages are compatible with the active backend
- site-consumption helpers are installed or generated when expected

### `tentman ci`

Run the non-writing checks suitable for deployment.

Likely checks:

- `doctor`
- `ids check`
- `nav check`
- `format --check`
- `assets check`
- schema compatibility check

This should have stable exit codes and concise output.

## Content And Navigation Commands

### `tentman content list`

Print content as Tentman sees it.

Examples:

```sh
tentman content list
tentman content list projects
tentman content list projects --json
```

Useful for debugging discovery issues and for agents that need to inspect state before making a change.

### `tentman content inspect`

Show one item with resolved metadata.

```sh
tentman content inspect projects tent_01HX...
tentman content inspect projects --slug berlin-neukoelln-kiezkulisse
```

Output should include:

- stable id
- slug/route
- filename/path
- group
- title/primary label
- backing config path
- backing content path

### `tentman content normalize`

Repair or materialize Tentman-owned metadata without changing author content.

Possible responsibilities:

- add missing stable ids
- normalize generated fields
- remove stale generated metadata when safe
- ensure required defaults exist

This overlaps with `ids write`, so the first CLI may not need both. Long term, `content normalize` could become the broader repair command while `ids` stays focused.

### `tentman nav print`

Print effective navigation after applying config, content, and manifest logic.

Useful forms:

```sh
tentman nav print
tentman nav print --json
tentman nav print --collection projects
```

This is helpful when a developer asks, "What navigation does Tentman think this site has?"

### `tentman nav explain`

Explain why an item appears in a particular group/order.

Example:

```sh
tentman nav explain projects berlin-neukoelln-kiezkulisse
```

Possible output:

- matched by stable id
- group came from frontmatter field
- label came from title field
- href came from route template
- manifest order placed it before/after another item

This can turn mysterious behavior into inspectable behavior.

### `tentman preview-changes`

Show the file changes Tentman would make for an operation.

Examples:

```sh
tentman preview-changes projects tent_01HX... --set group=animation
tentman preview-changes nav refresh
tentman preview-changes ids write
```

This would be especially useful for agents and tests.

## Asset Commands

### `tentman assets check`

Validate referenced assets.

Checks:

- image fields point at existing files
- public URL paths match local asset paths
- asset casing is safe for case-sensitive deploy targets
- files are in expected asset directories
- unsupported formats are reported
- very large images are reported

### `tentman assets list`

Print known assets by content item and field.

### `tentman assets unused`

Find files in asset directories that are not referenced by Tentman-managed content.

This should be conservative. Unused asset detection is easy to make too aggressive on custom sites.

### `tentman assets move`

Eventually, move assets and update references through Tentman-owned logic.

This is not an early feature, but it fits the "do not hand-edit generated paths" principle.

## Schema And Migration Commands

### `tentman schema`

Export the effective schema for a repo or content config.

Examples:

```sh
tentman schema
tentman schema projects
tentman schema projects --json
```

Uses:

- editor integrations
- agent context
- validation
- docs generation
- future typed helpers

### `tentman migrate`

Apply explicit migrations once Tentman has stable public schema versions.

Examples:

```sh
tentman migrate
tentman migrate --check
tentman migrate --from pre-v1 --to current
```

Pre-v1 migrations can be pragmatic and direct. After a stable line is declared, migrations should be careful, documented, and reversible where possible.

### `tentman compatibility`

Report whether a site can be managed by the current Tentman runtime.

This could eventually say:

- supported
- supported with warnings
- needs migration
- unsupported future schema
- unsupported old schema

## Provider And Deployment Commands

These should come after the core local CLI is reliable.

### `tentman provider connect`

Help configure Git providers.

Possible targets:

- GitHub
- GitLab
- Bitbucket
- local-only

### `tentman deploy connect`

Help wire deployment/preview integrations.

Possible targets:

- Netlify
- Vercel
- Cloudflare Pages
- static host/manual

### `tentman preview-url`

Validate or set preview URLs.

```sh
tentman preview-url set http://localhost:5173
tentman preview-url check
```

## Plugin And Extension Commands

### `tentman plugins list`

List configured local plugins and whether they resolve.

### `tentman plugins check`

Validate plugin manifests, entrypoints, and compatibility.

### `tentman plugins scaffold`

Create a local plugin skeleton.

This should wait until the plugin model is more settled.

## Agent-Oriented Commands

Tentman should be pleasant for human developers, but it can also become the safe API agents use.

Useful properties:

- every write command has a `--check` or preview mode
- every command can emit JSON
- output includes file paths changed
- errors are specific enough for an agent to correct course
- commands avoid interactive prompts when `--yes` or `--json` is used

Potential commands:

```sh
tentman state --json
tentman operation-plan nav refresh --json
tentman apply-plan plan.json
```

These are speculative, but the core principle is firm: agents should call Tentman operations rather than recreating Tentman rules.

## Publishing Strategy

The CLI does not need to be public during alpha.

When publishing becomes useful:

- keep `packages/core` private
- bundle core into the CLI package
- expose a CLI, not a public stable core library
- decide separately whether a narrower public schema/types package is useful

Possible future public packages:

- `tentman` as the CLI package
- `@tentman/schema` for public types/schema helpers

Avoid publishing `@tentman/core` until there is a deliberate product reason to support third-party UIs as a stable integration surface.

