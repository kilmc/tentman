# Tentman CMS

Tentman is a Git-backed content editor for static sites. It reads `*.tentman.json` files, builds forms from `blocks`, and saves content back to files in your repo.

It supports two working modes today:

- GitHub-backed mode for remote repositories
- Local browser-backed mode for editing a checked-out repo directly

The current docs live in two places:

- In-app config reference at `/docs`
- A complete example consumer repo in [`/Users/kilmc/code/tentman/test-app`](/Users/kilmc/code/tentman/test-app)

## Development Setup

1. Select the pinned Node version and install dependencies:

```sh
nvm use
pnpm install
```

2. Copy the example env file:

```sh
cp .env.example .env
```

3. Fill in the GitHub OAuth values in `.env`:

```env
GITHUB_CLIENT_ID=your_github_oauth_client_id_here
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret_here
SESSION_SECRET=your_random_session_secret_here
```

4. For local development, create a GitHub OAuth App with:

- Homepage URL: `http://localhost:5173`
- Authorization callback URL: `http://localhost:5173/auth/callback`

5. Start the app:

```sh
pnpm run dev
```

If you only want to test local-repo mode, GitHub auth is optional.

## Deploy To Netlify

This repo now includes a checked-in [Netlify config](/Users/kilmc/code/tentman/tentman/netlify.toml) and a pinned Node version in [package.json](/Users/kilmc/code/tentman/tentman/package.json) and [\.nvmrc](/Users/kilmc/code/tentman/tentman/.nvmrc).

To deploy:

1. Connect this repo to Netlify.
2. Keep the default build command `pnpm run build`.
3. Keep the publish directory `build`.
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

1. An optional root config at `.tentman.json`
2. One or more content configs like `tentman/configs/blog.tentman.json`
3. Optional reusable block configs like `tentman/blocks/image-gallery.tentman.json`
4. An optional manual navigation manifest at `tentman/navigation-manifest.json`

### Optional Root Config

```json
{
	"siteName": "Field Notes",
	"configsDir": "./tentman/configs",
	"blocksDir": "./tentman/blocks",
	"assetsDir": "./static/images",
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
- `pluginsDir`: directory containing repo-local plugins; defaults to `tentman/plugins`
- `plugins`: repo-local plugin ids that fields may opt into
- `local.previewUrl`: preview link shown in local mode
- `netlify.siteName`: enables Netlify preview links for draft branches
- `blockPackages`: package-distributed blocks in GitHub-backed/server mode

`blockPackages` is not supported in local browser-backed mode yet.

### Repo-Local Markdown Plugins

Markdown plugins live in the edited site repo and are registered from the root config:

```json
{
	"pluginsDir": "./tentman/plugins",
	"plugins": ["callout-chip"]
}
```

Then enable registered plugins on individual markdown blocks:

```json
{
	"id": "body",
	"type": "markdown",
	"label": "Body",
	"plugins": ["callout-chip"]
}
```

Plugin entrypoints are plain ESM files such as
`tentman/plugins/callout-chip/plugin.js`. The current plugin host supports markdown editor
contributions and Tentman preview transforms in both local and GitHub-backed modes.

Markdown plugins typically store stable inline HTML markers, for example:

```html
<span data-tentman-plugin="callout-chip" data-tone="info" data-label="Note">Note</span>
```

Tentman can recognize those markers in the rich editor, serialize them back to markdown, and run
plugin preview transforms inside Tentman previews. The consumer website still owns its runtime
markdown rendering and styling. Use a site markdown renderer that supports safe inline HTML, or add
a site-side allowlist transform for the stored marker shape.

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
	"blocks": [
		{ "id": "title", "type": "text", "label": "Title", "required": true, "show": "primary" },
		{ "id": "slug", "type": "text", "label": "Slug", "required": true },
		{
			"id": "date",
			"type": "date",
			"label": "Publish date",
			"required": true,
			"show": "secondary"
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

Use this for a single page or settings document stored in one JSON file.

```json
{
	"type": "content",
	"label": "About Page",
	"id": "about",
	"content": {
		"mode": "file",
		"path": "../../src/content/pages/about.json"
	},
	"blocks": [
		{ "id": "title", "type": "text", "label": "Title", "required": true, "show": "primary" },
		{ "id": "intro", "type": "textarea", "label": "Intro", "required": true, "maxLength": 220 },
		{ "id": "body", "type": "markdown", "label": "Body", "required": true }
	]
}
```

### Manual Navigation Manifest

Tentman can optionally read and write a conventional JSON manifest at
`tentman/navigation-manifest.json`. In v1, JSON is the only supported format.

Top-level manual ordering needs stable content config `id` values. Collection item ordering also
needs `idField`.

```json
{
	"version": 1,
	"content": {
		"items": ["about", "contact", "blog"]
	},
	"collections": {
		"blog": {
			"items": ["testing-content-workflows", "designing-a-realistic-fixture"],
			"groups": [
				{
					"id": "featured",
					"label": "Featured posts",
					"items": ["testing-content-workflows"]
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
The example app in [`/Users/kilmc/code/tentman/test-app`](/Users/kilmc/code/tentman/test-app)
shows that pattern.

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

- `content.mode: "file"` for a single JSON file, optionally with `itemsPath` for nested arrays
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
- `image`
- `select`

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
  `[{ "value": "stack", "label": "Stack" }]`, plus Tentman-owned navigation group choices:

```json
{
  "id": "group",
  "type": "select",
  "label": "Group",
  "required": true,
  "options": {
    "source": "tentman.navigationGroups",
    "collection": "projects",
    "addOption": true
  }
}
```

For `source: "tentman.navigationGroups"`, Tentman reads groups from
`tentman/navigation-manifest.json`, stores the selected group `id` in the content item, and
displays each group `label` with an `id` fallback. `addOption: true` lets authors add a new group
inline; Tentman creates or updates the manifest group as `{ "id", "label", "items": [] }`.
Generic JSON-backed select option sources are not implemented yet. Saving a content item stores
only the selected group id; Tentman does not yet automatically move existing item ids between
manifest group `items` arrays when this field changes.
- `assetsDir`
- `generated`
- top-level content config `id` for stable manual navigation
- `idField`, which becomes effectively required for manual collection ordering

Path rules:

- Root config paths resolve relative to `.tentman.json`
- Content paths resolve relative to the config file that declares them
- Block adapter paths resolve relative to the block config that declares them
- Files beginning with `_` are skipped during top-level content discovery

## Best Reference Repo

[`/Users/kilmc/code/tentman/test-app`](/Users/kilmc/code/tentman/test-app) is the current reference implementation for a consumer repo. It includes:

- Root config in [`/Users/kilmc/code/tentman/test-app/.tentman.json`](/Users/kilmc/code/tentman/test-app/.tentman.json)
- Content configs in [`/Users/kilmc/code/tentman/test-app/tentman/configs`](/Users/kilmc/code/tentman/test-app/tentman/configs)
- Reusable blocks in [`/Users/kilmc/code/tentman/test-app/tentman/blocks`](/Users/kilmc/code/tentman/test-app/tentman/blocks)
- A template file in [`/Users/kilmc/code/tentman/test-app/tentman/templates/post.md`](/Users/kilmc/code/tentman/test-app/tentman/templates/post.md)

## Scripts

```sh
pnpm run dev
pnpm run check
pnpm run test
pnpm run build
```

## Notes

- The old `template` / `filename` / `fields`-only schema in the previous README is obsolete.
- Package-distributed blocks currently work through the GitHub-backed/server path, not local browser-backed mode.
- Custom local block adapters must be self-contained ESM `.js` or `.mjs` modules.
