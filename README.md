# Tentman CMS

Tentman is a Git-backed content editor for static sites. It reads `*.tentman.json` files, builds forms from `blocks`, and saves content back to files in your repo.

It supports two working modes today:

- GitHub-backed mode for remote repositories
- Local browser-backed mode for editing a checked-out repo directly

The current docs live in two places:

- In-app config reference at `/docs`
- A complete example consumer repo in [`apps/test-app`](/Users/kilmc/code/tentman/tentman/apps/test-app)

This repo also maintains the installable Codex skill at
[`skills/tentman-site-integration`](/Users/kilmc/code/tentman/tentman/skills/tentman-site-integration)
for integrating Tentman into existing external sites.

## Repository Layout

This repo is a pnpm workspace:

```txt
apps/
  web/       # Tentman web app
  test-app/  # Reference consumer site
packages/
  core/      # Shared Tentman behavior, currently a placeholder
  cli/       # CLI package, currently a placeholder
  mdsvex/    # mdsvex content component integration
  vite/      # Vite helpers for Tentman-backed sites
```

## Development Setup

1. Select the pinned Node version and install dependencies:

```sh
nvm use
./scripts/bootstrap-install.sh
```

If you want to sanity-check the local toolchain first, run:

```sh
./scripts/pnpm-doctor.sh
```

Tentman pins pnpm in [`package.json`](/Users/kilmc/code/tentman/tentman/package.json:6). If plain
`pnpm` ever reports the wrong version, re-enable the Corepack shim with:

```sh
corepack enable pnpm
```

2. Copy the web app example env file:

```sh
cp apps/web/.env.example apps/web/.env
```

3. Fill in the GitHub OAuth values in `apps/web/.env`:

```env
GITHUB_CLIENT_ID=your_github_oauth_client_id_here
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret_here
```

4. For local development, create a GitHub OAuth App with:

- Homepage URL: `http://localhost:5173`
- Authorization callback URL: `http://localhost:5173/auth/callback`

Tentman now keeps the live GitHub OAuth bearer token on the server only. The browser session carries an opaque
Tentman session id instead, so a copied browser cookie is not itself a reusable GitHub API token.

Current limitation: the server-side GitHub session store is in-memory, so restarting the app signs GitHub-backed
sessions out. Private release also assumes a single-instance deployment.

Current timeout profile:

- 7 day idle timeout on the server-side session store
- 30 day absolute maximum session lifetime

5. Start the app:

```sh
corepack pnpm run dev
```

If you only want to test local-repo mode, GitHub auth is optional.

## Deploy To Netlify

This repo now includes a checked-in [Netlify config](/Users/kilmc/code/tentman/tentman/netlify.toml) and a pinned Node version in [package.json](/Users/kilmc/code/tentman/tentman/package.json) and [\.nvmrc](/Users/kilmc/code/tentman/tentman/.nvmrc).

To deploy:

1. Connect this repo to Netlify.
2. Keep the configured build command `pnpm --filter @tentman/web run build`.
3. Keep the configured publish directory `apps/web/build`.
4. Add these Netlify environment variables in the site settings:

```env
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
```

5. Create or update a GitHub OAuth App with:

- Homepage URL: your deployed Netlify site URL
- Authorization callback URL: `https://<your-netlify-domain>/auth/callback`

6. Trigger a new deploy after saving the environment variables.

Notes:

- GitHub login is configured at runtime, so missing OAuth variables no longer break the Netlify build itself.
- If OAuth variables are missing at runtime, the auth routes will return a clear server error instead of failing the build.
- GitHub OAuth Apps support a single callback URL, so if you use a custom production domain, update the callback URL to match it exactly.

## Quick Start For Another Repo

Most repos only need:

1. A root config at `tentman.json`
2. One or more content configs like `tentman/configs/blog.tentman.json`
3. Optional reusable block configs like `tentman/blocks/image-gallery.tentman.json`
4. An optional navigation manifest at `tentman/navigation-manifest.json`

## Codex Skill

The canonical repo-owned `tentman-site-integration` skill lives at
[`skills/tentman-site-integration`](/Users/kilmc/code/tentman/tentman/skills/tentman-site-integration)
and is maintained here.

Use the normal repo or path-based skill installer flow to install or refresh it from this repo path.
The installed skill name stays `tentman-site-integration`.

### Optional Root Config

```json
{
	"siteName": "Field Notes",
	"configsDir": "./tentman/configs",
	"blocksDir": "./tentman/blocks",
	"assetsDir": "./static/images",
	"componentsDir": "./src/lib/content-components",
	"local": {
		"previewUrl": "http://localhost:4321"
	}
}
```

Useful root fields:

- `siteName`: label shown in the Tentman UI
- `configsDir`: restrict top-level content config discovery
- `blocksDir`: restrict reusable block discovery
- `assetsDir`: default upload location for image fields
- `componentsDir`: directory containing repo-local content components; defaults to `src/lib/content-components`
- `local.previewUrl`: preview link shown in local mode
- `netlify.siteName`: enables Netlify preview links for draft branches
- `blockPackages`: package-distributed blocks in GitHub-backed/server mode
- `statePresets`: shared state case definitions that content configs can reuse by preset name

`blockPackages` is not supported in local browser-backed mode yet.

### Shared State Badges

Tentman content can define optional state badges for navigation, headers, and cards.

- Use top-level `state` for the content config itself
- Use `collection.state` for items inside a collection
- Use root `statePresets` when multiple configs share the same cases

Example root preset:

```json
{
	"statePresets": {
		"publication": {
			"cases": [{ "value": false, "label": "Draft", "variant": "warning", "icon": "file-pen" }]
		}
	}
}
```

Example singleton page state:

```json
{
	"type": "content",
	"label": "About Page",
	"state": {
		"blockId": "published",
		"preset": "publication"
	},
	"content": {
		"mode": "file",
		"path": "../../src/routes/about/+page.md"
	},
	"blocks": [
		{ "id": "title", "type": "text", "label": "Title" },
		{ "id": "published", "type": "toggle", "label": "Published" }
	]
}
```

Example collection item state:

```json
{
	"type": "content",
	"label": "Blog Posts",
	"itemLabel": "Blog Post",
	"collection": {
		"state": {
			"blockId": "published",
			"preset": "publication"
		}
	},
	"content": {
		"mode": "directory",
		"path": "../../src/content/posts",
		"template": "../templates/post.md"
	},
	"blocks": [
		{ "id": "title", "type": "text", "label": "Title" },
		{ "id": "published", "type": "toggle", "label": "Published" }
	]
}
```

### Repo-Local Content Components

Real markdown files are the first-class rich-content path in Tentman. Use `.md` or `.markdown`
files when content has a markdown body, rich text, Tentman content components, or structured
reference-aware embeds. Use JSON for structured content and settings.

JSON-backed markdown fields still work where they already worked, but they are compatibility
behavior rather than the recommended rich-content architecture.

Register an optional custom components directory in the root config:

```json
{
	"componentsDir": "./src/lib/content-components"
}
```

For SvelteKit + mdsvex sites, add the mdsvex transform in `svelte.config.js` and the Vite reload
helper in `vite.config.ts` so changes to content component templates trigger a dev-server reload.
With `resolveTentmanContext: 'auto'`, Tentman-managed markdown files get `contentItem`,
reference-index, and reusable-block-aware structured context automatically.

Example `vite.config.ts`:

```ts
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { tentmanContentComponentReload } from '@tentman/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		tentmanContentComponentReload({
			componentsDir: './tentman/components'
		}),
		sveltekit()
	]
});
```

`componentsDir` remains configurable so sites can keep using `src/lib/content-components` today or
move toward a root `tentman/components` folder later.

If omitted, Tentman uses `src/lib/content-components`.

Each component lives in its own folder:

```text
src/lib/content-components/
  buy-button/
    component.json
    render.njk
    preview.njk
```

`component.json` defines the component contract:

```json
{
	"id": "buy-button",
	"name": "buy-button",
	"kind": "inline",
	"attributes": {
		"href": {
			"type": "string",
			"required": true
		},
		"label": {
			"type": "string",
			"required": true,
			"valueFromMarkdownLabel": true
		},
		"variant": {
			"type": "enum",
			"default": "default",
			"options": ["default", "secondary"]
		}
	}
}
```

Supported schema rules:

- `id`: stable component identifier
- `name`: component name used in markdown markers
- `kind`: `inline` or `block`; defaults to `inline`
- `attributes`: object of named attribute definitions
- attribute `type`: `string` or `enum`
- attribute `required`: optional boolean
- attribute `default`: optional non-empty string
- attribute `options`: required for `enum` attributes
- attribute `valueFromMarkdownLabel`: optional boolean; only one attribute may use it

`render.njk` produces final site output. `preview.njk` produces the safe authoring representation
shown inside Tentman. Tentman sanitizes `preview.njk` down to presentational HTML before mounting it
inside an isolated preview host, so repo-defined previews cannot add app-level interactivity. Both
templates receive the normalized attribute map.

Example `render.njk`:

```njk
<a class="buy-button buy-button--{{ variant }}" href="{{ href }}">
	{{ label }}
</a>
```

Example `preview.njk`:

```njk
<span class="tm-component-preview tm-component-preview--buy-button">
	Buy button: {{ label }}
</span>
```

Enable components on individual markdown fields:

```json
{
	"id": "body",
	"type": "markdown",
	"label": "Body",
	"components": ["buy-button", "callout-box"]
}
```

For mdsvex-based sites, install `@tentman/mdsvex` and `remark-directive`, then wire the Tentman
adapter into mdsvex:

```sh
pnpm add -D @tentman/mdsvex mdsvex remark-directive
```

```js
import adapter from '@sveltejs/adapter-auto';
import { mdsvex } from 'mdsvex';
import remarkDirective from 'remark-directive';
import { tentmanComponents } from '@tentman/mdsvex';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter()
	},
	preprocess: [
		mdsvex({
			extensions: ['.svx', '.md'],
			remarkPlugins: [
				remarkDirective,
				tentmanComponents({
					projectRoot: process.cwd(),
					resolveTentmanContext: 'auto'
				})
			]
		})
	],
	extensions: ['.svelte', '.svx', '.md']
};

export default config;
```

Use inline components in markdown with semantic directive markers:

```md
:buy-button[Buy tickets]{href="/tickets" variant="secondary"}
```

Marker-only block components can resolve structured page data automatically inside managed
markdown files:

```md
::gallery-embed
```

Current authoring rules:

- inline components use `:name[label]{attrs...}`
- inline components without a markdown-label attribute use `:name{attrs...}`
- block components use standalone `::name[label]{attrs...}` or `::name{attrs...}`
- Tentman writes all active non-label attributes explicitly
- attributes serialize in alphabetical order
- the markdown-label value is not duplicated into an explicit attribute
- quoting and escaping are canonicalized on serialization
- Tentman stores the semantic marker, not rendered HTML

CLI workflow:

```sh
tentman component create buy-button
tentman component create callout-box --kind block
tentman component list
tentman component inspect buy-button
tentman component validate
```

`create` scaffolds a working component folder, `list` shows discovered components, `inspect` shows
the resolved files and attribute definitions, and `validate` reports schema or registry problems.

This keeps source representation semantic and deterministic. When you change `render.njk` or
`preview.njk`, all existing component instances pick up the new output on the next site rebuild or
Tentman preview refresh because the stored content only contains the component marker and values.

### Directory-Backed Collection Example

Use this for blog posts, docs, or any one-file-per-item content.

```json
{
	"type": "content",
	"label": "Blog Posts",
	"id": "blog",
	"itemLabel": "Blog Post",
	"collection": true,
	"idField": "slug",
	"content": {
		"mode": "directory",
		"path": "../../src/content/posts",
		"template": "../templates/post.md",
		"filename": "{{slug}}"
	},
	"editorLayout": {
		"aside": ["slug", "date"],
		"asideLabel": "Metadata"
	},
	"blocks": [
		{ "id": "title", "type": "text", "label": "Title", "required": true },
		{ "id": "slug", "type": "text", "label": "Slug", "required": true },
		{
			"id": "date",
			"type": "date",
			"label": "Publish date",
			"required": true
		},
		{ "id": "body", "type": "markdown", "label": "Body", "required": true }
	]
}
```

Example template:

```md
---
title: '{{title}}'
slug: '{{slug}}'
date: '{{date}}'
---

{{body}}
```

### File-Backed Singleton Example

Use this for a single page or settings document stored in one file. `*.md` and `*.markdown` are
the recommended format when the entry has rich markdown content. The `body` field maps to the
markdown body and all other fields map to frontmatter.

```json
{
	"type": "content",
	"label": "About Page",
	"id": "about",
	"content": {
		"mode": "file",
		"path": "../../src/routes/about/+page.md"
	},
	"blocks": [
		{ "id": "title", "type": "text", "label": "Title", "required": true },
		{ "id": "intro", "type": "textarea", "label": "Intro", "required": true, "maxLength": 220 },
		{ "id": "body", "type": "markdown", "label": "Body", "required": true },
		{
			"id": "gallery",
			"type": "block",
			"label": "Gallery",
			"referenceFor": ["gallery-embed"],
			"blocks": [
				{ "id": "title", "type": "text", "label": "Title", "required": true },
				{ "id": "description", "type": "textarea", "label": "Description" },
				{ "id": "items", "type": "imageGallery", "label": "Items" }
			]
		}
	]
}
```

### Manual Navigation Manifest

Tentman can optionally read and write a conventional JSON manifest at
`tentman/navigation-manifest.json`. In v1, JSON is the only supported format.
Treat it as shared editor state for navigation ordering, grouping, and materialized labels/slugs,
not as the primary source of truth for content itself.

Top-level manual ordering needs stable content config `id` values. Collection item ordering also
needs `idField`.

```json
{
	"version": 1,
	"content": {
		"items": [
			{ "id": "tent_01HX...", "label": "About", "slug": "about" },
			{ "id": "tent_01HY...", "label": "Contact", "slug": "contact" },
			{ "id": "tent_01HZ...", "label": "Blog", "slug": "blog" }
		]
	},
	"collections": {
		"tent_01HZ...": {
			"id": "tent_01HZ...",
			"label": "Blog",
			"slug": "blog",
			"items": [
				{
					"id": "tent_01JA...",
					"label": "Testing content workflows",
					"slug": "testing-content-workflows"
				},
				{
					"id": "tent_01JB...",
					"label": "Designing a realistic fixture",
					"slug": "designing-a-realistic-fixture"
				}
			],
			"groups": [
				{
					"id": "tent_01JC...",
					"label": "Featured posts",
					"value": "featured",
					"items": [{ "id": "tent_01JA...", "label": "Testing content workflows" }]
				}
			]
		}
	}
}
```

Manifest precedence in Tentman:

- If a manifest section exists, Tentman uses it first.
- Unlisted existing configs or items are appended in their normal discovered order.
- Stale manifest references are ignored.
- If no manifest exists, Tentman keeps its current discovery-based behavior.

If you want your live site navigation to match Tentman, read the same manifest in your site code.
The example app in [`apps/test-app`](/Users/kilmc/code/tentman/tentman/apps/test-app)
shows that pattern.

`tentman ids write` updates stable `_tentmanId` values in configs and content. If a navigation
manifest already exists, follow it with `tentman nav rebuild` so manifest references and
materialized labels/slugs stay in sync.

### CLI Navigation Workflow

Tentman’s CLI now treats the navigation manifest as a maintained artifact with three main
operations:

- `tentman nav refresh` preserves the current manifest structure and editorial ordering while
  refreshing references and materialized labels/slugs from current stable ids.
- `tentman nav rebuild` fully regenerates the manifest from the current project state.
- `tentman nav watch` watches relevant config and content roots, reruns navigation maintenance
  after changes, reloads project state after each run, and updates its watch scope if the project
  roots change.

`tentman nav watch` defaults to rebuild mode:

```sh
tentman nav watch /path/to/project
```

Use `--refresh` when you want watch mode to preserve the existing manifest structure and only
refresh references:

```sh
tentman nav watch --refresh /path/to/project
```

Watch mode ignores `tentman/navigation-manifest.json`, `.git`, and `node_modules` so Tentman does
not retrigger itself on manifest writes or unrelated repo noise.

### Reusable Block Example

```json
{
	"type": "block",
	"id": "imageGallery",
	"label": "Image Gallery",
	"collection": true,
	"itemLabel": "Image",
	"blocks": [
		{ "id": "image", "type": "image", "label": "Image", "required": true },
		{ "id": "alt", "type": "text", "label": "Alt text", "required": true },
		{ "id": "caption", "type": "textarea", "label": "Caption" }
	]
}
```

Then use it inside a content config:

```json
{
	"id": "gallery",
	"type": "imageGallery",
	"label": "Gallery"
}
```

## Config Model

Top-level config files must use one of these shapes:

- `type: "content"` for editable content
- `type: "block"` for reusable structured blocks

Supported content storage modes:

- `content.mode: "file"` for a single file, optionally with `itemsPath` for nested JSON arrays
- `content.mode: "directory"` for one file per item with a template

Built-in block types:

- `text`
- `textarea`
- `markdown`
- `email`
- `url`
- `number`
- `date`
- `boolean`
- `toggle`
- `image`
- `select`
- `tentmanGroup`

Use `toggle` for on/off settings like `published`. It stores a boolean value and renders as a
switch in the editor. Existing `boolean` fields remain supported.

Common block fields:

- `id`
- `type`
- `label`
- `required`
- `collection`
- `itemLabel`
- `show`
- `minLength`
- `maxLength`
- `options` for `select` fields; supports static choices like `["stack", "inline"]` or
  `[{ "value": "stack", "label": "Stack" }]`

Tentman-owned collection grouping uses a dedicated block:

```json
{
	"type": "tentmanGroup",
	"label": "Group",
	"required": true,
	"collection": "projects",
	"addOption": true
}
```

`tentmanGroup` reads groups from `collection.groups` and the navigation manifest for the collection
identified by `collection`. Tentman stores the selected group stable id in
`_tentmanGroupId`, displays each group `label` with an `id` fallback, and carries the
developer-facing group `value` in the config and manifest. `addOption: true` lets authors add a
new group inline; Tentman creates or updates the manifest group as
`{ "id", "label", "value", "items": [] }`. Existing user content fields like `group` are left
alone and are no longer Tentman’s canonical group-membership storage.

- `assetsDir`
- `generated`
- top-level content config `id` for stable manual navigation
- `idField`, which becomes effectively required for manual collection ordering

Path rules:

- Root config paths resolve relative to `tentman.json`
- Content paths resolve relative to the config file that declares them
- Files beginning with `_` are skipped during top-level content discovery

## Best Reference Repo

[`apps/test-app`](/Users/kilmc/code/tentman/tentman/apps/test-app) is the current reference implementation for a consumer repo. It includes:

- Root config in [`/Users/kilmc/code/tentman/tentman/apps/test-app/tentman.json`](/Users/kilmc/code/tentman/tentman/apps/test-app/tentman.json)
- Content configs in [`/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/configs`](/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/configs)
- Reusable blocks in [`/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/blocks`](/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/blocks)
- A template file in [`/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/templates/post.md`](/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/templates/post.md)

## Scripts

```sh
pnpm run dev
pnpm run check
pnpm run test
pnpm run build
pnpm run verify:baseline
```

## Verification Baseline

For private release confidence, the current baseline is:

```sh
pnpm run verify:baseline
```

`pnpm run verify:baseline` runs:

```sh
pnpm run check
pnpm run build
pnpm run test:core
pnpm run test:unit -- --run
```

The same baseline is available as `pnpm run prepush`.

## Pre-push Hook

Tentman now keeps the baseline wired to Git's `pre-push` hook through the checked-in
[`/Users/kilmc/code/tentman/tentman/.githooks/pre-push`](/Users/kilmc/code/tentman/tentman/.githooks/pre-push).

- `pnpm install` runs the repo `prepare` script, which configures `core.hooksPath` to `.githooks`
  when this repo owns the Git checkout.
- If you want to install hooks manually, run `pnpm run hooks:install`.
- If you already use a custom `core.hooksPath`, Tentman leaves it alone and prints a message instead
  of overwriting it.
- Set `SKIP_GIT_HOOKS=1` to skip hook installation in local environments where you do not want it.

## Warning Policy

Policy for the baseline commands:

- TypeScript, `svelte-check`, and thin-backend guardrail errors are forbidden.
- Failing builds or failing tests are forbidden.
- Svelte accessibility warnings are forbidden.
- Runtime errors and architectural guard-rail failures are forbidden.

Temporarily allowed warnings, with explicit rationale:

- `gray-matter` direct `eval` build warning is temporarily allowed because it comes from the
  dependency's parser engine, not Tentman source, and replacing that dependency is a larger change
  than this baseline issue.
- Vite/Rolldown large chunk warnings are temporarily allowed because the current markdown/editor
  client bundle is still oversized and needs a dedicated code-splitting pass rather than a rushed
  threshold tweak.
- Rolldown `PLUGIN_TIMINGS` output is temporarily allowed because it is informational performance
  telemetry rather than a correctness or runtime-safety signal.

Policy for new warning classes:

- New warning classes should be treated as forbidden by default until they are either fixed or
  explicitly documented here with rationale.
- Allowed warnings should stay narrow, named, and temporary.

## Notes

- The old `template` / `filename` / `fields`-only schema in the previous README is obsolete.
- Package-distributed blocks currently work through the GitHub-backed/server path, not local browser-backed mode.
- Reusable local blocks currently use the generated structured adapter only.
