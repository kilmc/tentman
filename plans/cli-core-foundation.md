# Tentman CLI And Core Foundation

## Summary

Build Tentman's CLI as a thin command layer over a shared internal core package. The goal is not only to give developers useful commands, but to make sure the web app, CLI, tests, and future agent workflows all rely on the same implementation of "what Tentman would do."

This is a foundation plan for the initial internal CLI. Publishing is explicitly out of scope for the first pass.

## Product Goal

Tentman should let developers build sites exactly how they want while giving artists, creators, friends, family, and clients a calm editing layer over those sites.

The CLI supports that goal by giving developers and automation a safe way to:

- inspect how Tentman sees a repo
- repair and refresh Tentman-owned metadata
- rebuild navigation state
- check formatting churn before an editor touches content
- run the same logic the hosted Tentman app will use

Agents and humans should not need to impersonate Tentman persistence behavior by editing ids, manifests, and generated state by hand.

## Proposed Repository Shape

Move toward a monorepo layout that separates product surfaces from shared behavior:

```txt
apps/
  web/
  test-app/
packages/
  core/
  cli/
```

The current repo can move in one deliberate step because Tentman is still pre-v1 and the shape is worth getting right before more tooling depends on the old layout.

## Git And Deployment Migration

The current Git repository root is the existing `tentman/` application folder, not the local parent folder that happens to contain both `tentman/` and `test-app/`.

Keep that Git association. Do not move the Git root up to the local parent directory.

Instead, treat the current Git root as the future monorepo root and rearrange files inside it:

```txt
current-git-root/
  apps/
    web/
    test-app/
  packages/
    core/
    cli/
  package.json
  pnpm-workspace.yaml
  pnpm-lock.yaml
  netlify.toml
```

This keeps:

- existing Git history
- existing remote
- existing Netlify project connection
- existing deploy ownership

The local parent folder can eventually be removed or renamed once the tracked repo contains everything needed.

### Netlify

Netlify should continue to build from the same repository, but the build command and publish directory should point at the web app workspace.

The current shape is roughly:

```toml
[build]
command = "pnpm run build"
publish = "build"
```

After the monorepo move, use a workspace-filtered build:

```toml
[build]
command = "pnpm --filter @tentman/web run build"
publish = "apps/web/build"

[build.environment]
NODE_VERSION = "22.12.0"
```

If the web app package temporarily keeps the package name `tentman`, use that filter until the package is renamed:

```toml
command = "pnpm --filter tentman run build"
```

### Suggested Migration Order

1. Commit planning docs before moving files.
2. Create `apps/web` and move the current SvelteKit app into it.
3. Move or copy the current reference `test-app` into `apps/test-app` so it becomes tracked in the same repo.
4. Create root workspace files.
5. Update root scripts to delegate to the web app.
6. Update `netlify.toml` to build `apps/web`.
7. Run local checks and build.
8. Push and verify Netlify deploys from the new workspace path.
9. Remove or rename the old local parent folder only after the tracked repo is self-contained.

## Package Responsibilities

### `packages/core`

Private internal package. This is the canonical implementation of Tentman behavior.

Responsibilities:

- root config parsing and validation
- content config discovery and parsing
- path resolution
- repository filesystem abstractions used by CLI and web-local flows
- content discovery
- markdown/frontmatter parsing and writing
- JSON parsing and writing
- stable id generation and reconciliation
- navigation manifest parsing, refreshing, and rebuilding
- asset path validation
- schema/compatibility checks
- preview/diff generation for planned writes

This package should be marked private:

```json
{
  "name": "@tentman/core",
  "private": true
}
```

Private here is a product/distribution decision, not an architecture limitation. The CLI can still consume core through workspace imports and later bundle core into a public CLI artifact if publishing becomes useful.

### `packages/cli`

Thin command wrapper over `packages/core`.

Responsibilities:

- parse command-line arguments
- resolve the current project root
- print human-readable output
- choose read-only vs write mode
- set process exit codes for CI
- call core operations

The CLI should not define its own Tentman semantics.

### `apps/web`

The hosted/local web app.

Responsibilities:

- user interface
- authentication
- repository selection
- Git provider and local browser-backed workflows
- preview/publish flows
- calling core for shared behavior

The web app should not keep separate implementations of identity, navigation rebuilds, or content serialization once those move into core.

### `apps/test-app`

Reference consumer site and fixture app.

Responsibilities:

- exercise real SvelteKit site integration
- demonstrate Tentman config patterns
- act as a fixture for CLI and core behavior

## Initial CLI Scope

The first CLI should focus on correctness and developer confidence rather than broad onboarding.

### `tentman doctor`

Validate a Tentman-managed repo without writing files.

Checks:

- root config can be found and parsed
- declared config directories exist
- content config files are valid
- content paths resolve
- template paths resolve
- reusable blocks resolve
- navigation manifest can be parsed
- navigation references point at known configs/items/groups
- required stable ids are present and valid
- duplicate stable ids are reported
- configured asset paths exist where practical

### `tentman ids check`

Report missing, duplicate, malformed, or legacy-shaped stable ids.

Stable ids are Tentman-owned values. They must not be derived from slugs, filenames, labels, or route ids.

### `tentman ids write`

Write stable ids using the canonical core id generator, replacing legacy or malformed values.

This command should:

- generate ids for content configs when needed
- generate ids for collection groups when needed
- generate ids for collection items when needed
- replace any existing `_tentmanId` that is not a valid Tentman stable id
- avoid rewriting unrelated content formatting where possible
- print a concise summary of files changed

### `tentman nav check`

Report whether `tentman/navigation-manifest.json` matches the repo as core currently understands it.

This should identify:

- missing content items
- stale item references
- stale group references
- stale labels/slugs/hrefs in materialized nav data
- duplicate ids
- groups that exist in config/content but not manifest
- manifest items whose backing content no longer exists

### `tentman nav refresh`

Refresh the navigation manifest while preserving useful existing editorial choices.

This should preserve:

- group order
- item order where the same stable ids still exist
- group membership where possible

This should update:

- materialized labels
- materialized slugs
- materialized hrefs
- stale references
- newly discovered content

### `tentman nav rebuild`

Regenerate navigation state from the repo and config from scratch.

This is intentionally stronger than `refresh`. It should be useful after large manual edits or when a developer wants to discard stale generated state.

### `tentman format --check`

Report files that Tentman would currently rewrite if it parsed and saved them.

This is a diagnostic command, not a mandate that Tentman should eagerly reformat on every save.

### `tentman format --write`

Intentionally normalize files to Tentman's current writer output.

This lets a developer make formatting churn explicit in one commit before handing the site to a content editor.

Longer term, Tentman's save behavior should become preservation-first so this command becomes less necessary for ordinary workflows.

## Stable Id Policy

Stable ids should be generated, consistently shaped, and visibly Tentman-owned.

Recommended provisional shape:

```txt
tent_01HX7Q9E4K8F2G6M9P3A0B1C2D
```

Reasons:

- `tent_` is visibly branded without being too generic.
- The value cannot be mistaken for a slug.
- The value stays stable across title, slug, route, and filename changes.
- The value is short enough to live in frontmatter and manifests.
- The prefix leaves room for validation and future tooling.

Rules:

- Do not derive stable ids from slugs, filenames, labels, or config ids.
- Do not use stable ids as routes.
- Do not ask authors to edit stable ids.
- Treat stable ids as Tentman system metadata.
- Use the same generator from web, CLI, tests, and future agents.

If `tent_` starts to feel wrong in practice, `tmid_` is the main alternate candidate. The important decision is not the exact prefix; it is that the id is generated and not route-shaped.

## Navigation Manifest Direction

Because Tentman is still pre-v1, the manifest should move toward the best foundation rather than preserving a less elegant draft shape.

The manifest should become useful enough for a site to consume directly as navigation data, not only as an ordering index.

Preferred direction:

```json
{
  "version": 1,
  "content": {
    "items": [
      {
        "id": "tent_01HX7Q9E4K8F2G6M9P3A0B1C2D",
        "slug": "home",
        "label": "home",
        "href": "/"
      }
    ]
  },
  "collections": {
    "projects": {
      "groups": [
        {
          "id": "tent_01HX7Q9E4K8F2G6M9P3A0B1C2E",
          "slug": "illustration",
          "label": "Illustration",
          "href": "/projects/illustration",
          "items": [
            {
              "id": "tent_01HX7Q9E4K8F2G6M9P3A0B1C2F",
              "slug": "berlin-neukoelln-kiezkulisse",
              "label": "Berlin-Neukölln Kiezkulisse",
              "href": "/projects/illustration/berlin-neukoelln-kiezkulisse"
            }
          ]
        }
      ]
    }
  }
}
```

Notes:

- Keep `version: 1` for now because Tentman has not declared a stable public v1 contract.
- Do not contort the shape to preserve compatibility with one-person draft usage.
- Once Tentman declares a stable contract, future changes should follow the compatibility philosophy.
- The richer manifest can still be generated from content/config by core.
- Sites may consume it directly, but content files remain the source of full page/project content.

## Formatting Policy For The First Pass

Initial CLI commands can use existing serializers, but the architecture should point toward preserving developer formatting.

Short-term:

- provide `format --check` and `format --write`
- make formatting churn visible
- avoid mixing pure formatting rewrites with content edits when practical

Long-term:

- preserve existing file formatting on normal content saves
- patch changed frontmatter fields without reprinting the whole document where safe
- respect project-local formatting conventions where possible
- reserve full normalization for explicit commands

## Testing Strategy

Use shared fixtures to prevent web and CLI drift.

Suggested fixtures:

- simple page site
- directory-backed blog
- Theresa-like project site
- grouped collection site
- malformed or stale manifest site
- duplicate stable id site
- missing asset site

Tests should verify:

- core operations produce expected file changes
- CLI commands call core and produce the same changes
- web local save paths use the same core behavior
- navigation refresh/rebuild is deterministic
- id generation is consistently shaped
- formatting checks report expected files

## Implementation Phases

### Phase 1: Move To Monorepo Shape

- Create `apps/web`, `apps/test-app`, `packages/core`, and `packages/cli`.
- Move the current app and test app into the new layout.
- Add a root workspace config.
- Preserve existing app behavior.

### Phase 2: Extract Core Behavior

- Move stable identity helpers into core.
- Move navigation manifest helpers into core.
- Move content transforms into core.
- Move config/path validation helpers into core.
- Update the web app to import from core.

### Phase 3: Add CLI Skeleton

- Add command parser.
- Add filesystem repository backend.
- Add `tentman doctor`.
- Add tests against fixtures.

### Phase 4: Add Identity And Navigation Commands

- Add `ids check/write`.
- Add `nav check/refresh/rebuild`.
- Update Theresa/test-app configs through the CLI rather than manual JSON edits.

### Phase 5: Add Formatting Commands

- Add `format --check`.
- Add `format --write`.
- Use this to expose current serializer churn and guide preservation-first follow-up work.

## Out Of Scope For The First Pass

- Publishing the CLI to npm
- Public `@tentman/core`
- Provider onboarding
- GitHub/GitLab auth setup
- paid-tier behavior
- advanced migration UI
- perfect preservation-first markdown patching
