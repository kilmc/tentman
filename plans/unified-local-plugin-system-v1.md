# Unified Local Plugin System for Tentman v1

## Summary

Design and implement a new Tentman plugin system that works in both local and GitHub-backed mode, with local folder plugins as the primary loading model. The first shipped capability will be a markdown plugin path that is powerful enough to deliver a `buy-button` plugin for Theresa, but the architecture will be unified from day one so later block/validation/site-runtime plugins fit the same host model instead of becoming separate systems.

The `buy-button` plugin will store a stable HTML marker in markdown, render as a real button in the rich editor, and render cleanly in Tentman preview. No paid/licensing gates are included in this phase.

## Current Status

v1 is mostly implemented. Root and field config parsing are in place, repo-local plugin loading works in local and GitHub-backed modes, markdown field plugins feed Tiptap extensions and toolbar/dialog contributions into the editor, and preview transforms run for enabled markdown plugins. The example `buy-button` plugin now inserts and edits stable HTML markers through the plugin dialog contract, reopens persisted markers as rich editor atoms, and renders cleanly in Tentman preview.

The Test App also includes a tiny repo-local `callout-chip` plugin used to manually verify the same contract on a SvelteKit consumer site. Its markdown field stores a `span[data-tentman-plugin="callout-chip"]` marker, and the site renders markdown with mdsvex so the stored inline HTML reaches the page as HTML rather than escaped text.

Recently completed polish:

- Plugin toolbar dialogs autofocus the first field when opened.
- Escape closes an open plugin dialog.
- Closing a plugin dialog restores focus to the toolbar trigger when possible.
- Open plugin dialogs lock background document scrolling and restore the previous body overflow on close.
- Nested markdown previews share plugin registry loading through recursive `ContentValueDisplay` children.
- GitHub plugin module loading now rejects paths outside the configured `pluginsDir`.
- Plugin registry cache invalidation has focused test coverage through `clearPluginRegistryCache`.
- Markdown field and preview plugin errors keep diagnostic detail while presenting a clearer user-facing label.

Final v1 cleanup:

- Combined focused plugin/editor/preview tests pass after formatting.
- `npm run check` has clean `svelte-check` output and then stops on the known unrelated thin-backend guardrail failures.
- No remaining v1 plugin-system implementation tasks are currently tracked here; broader plugin families such as npm package plugins, block plugins, validation plugins, site-runtime metadata, and marketplace distribution remain intentionally out of scope.

## Key Changes

### 1. Root config and field-level API

Add root-level plugin registration to `.tentman.json`:

```json
{
	"pluginsDir": "./tentman/plugins",
	"plugins": ["buy-button"]
}
```

Add field-level opt-in on compatible usages, starting with markdown fields:

```json
{
	"id": "body",
	"type": "markdown",
	"label": "Body",
	"plugins": ["buy-button"]
}
```

Public API decisions:

- `pluginsDir` is optional and resolves relative to `.tentman.json`
- `plugins` at the root is the list of available local plugin ids for the site
- `plugins` on a field/config is an allowlist of which registered plugins apply there
- Root registration does not imply automatic global activation
- Start by supporting field-level `plugins` on `markdown` blocks only, but keep the type/interface generic enough to reuse for other plugin-capable surfaces later

### 2. Unified plugin host model

Create one internal plugin system with capability-specific hooks rather than separate systems per feature type.

Core plugin shape for v1:

- `id`
- `version`
- `capabilities`
- optional `markdown`
- optional `preview`

v1 markdown capability supports:

- extra Tiptap extensions
- extra toolbar items
- optional commands/helpers for insert/edit behavior

v1 preview capability supports:

- HTML/markdown post-processing hooks for custom stored markers
- custom preview rendering metadata if needed for button-like display

Important architecture decisions:

- Local mode and GitHub-backed mode both load plugins from the site repo, not from server-installed npm packages
- Introduce a backend-neutral plugin loading abstraction similar to config/block discovery
- The backend difference is only how plugin source files are read/imported
- Existing `blockPackages` is not extended for this work; this is a new unified system that can later absorb block-style extensibility

### 3. Loading model across both environments

Implement local-folder plugin discovery under `pluginsDir`, with a conventional entrypoint such as `plugin.js`, `plugin.mjs`, or a resolved compiled output path. Plan around executable JS modules for plugin runtime, not JSON-only definitions.

Loading behavior:

- In local browser-backed mode, load plugin modules from repo files through the local backend path
- In GitHub-backed mode, load plugin modules from repo files through the GitHub-backed/server path
- Validate plugin shape and surface clear UI errors if a plugin cannot be loaded
- If a field references a plugin id that is not registered or not loadable, Tentman shows a field/plugin error and leaves the field otherwise usable

Implementation boundary:

- Do not require custom per-client Tentman builds
- Do not require npm publishing for v1
- Leave room for npm package loading later as a second plugin source, but do not include it in this implementation

### 4. Markdown plugin integration

Extend the markdown editor boundary so `createMarkdownEditor` and `MarkdownField` can accept field-scoped plugin contributions.

Behavior changes:

- `MarkdownField` resolves which plugins apply to that field and passes their markdown contributions into the editor
- `createMarkdownEditor` merges plugin-provided Tiptap extensions and toolbar items with the built-in editor setup
- Toolbar items remain deterministic and field-scoped
- Raw Markdown tab continues to show persisted markdown source of truth

Store/serialization choice:

- `buy-button` stores HTML markers, not shortcode syntax and not Svelte component syntax
- Default stored shape is an anchor with a stable data attribute, for example:

  ```html
  <a data-tentman-plugin="buy-button" href="..." data-label="Buy online" data-variant="default"
  	>Buy online</a
  >
  ```

- The editor node view can look like a styled button while preserving this serialized output

### 5. Preview behavior and buy-button example plugin

Extend Tentman preview rendering so plugin-provided stored markers display nicely in admin preview rather than only as raw HTML/text.

For the `buy-button` example plugin:

- rich editor adds a `Buy Button` toolbar action
- insert/edit flow captures `href`, `label`, and optional `variant`
- rich editor renders a visible button-like node
- raw markdown shows the stored HTML marker
- Tentman preview recognizes and styles/renders the same marker cleanly

Deliberate v1 limitation:

- The plugin system does not attempt to compile or render site-side Svelte components inside Tentman
- Site-side centralized rendering/styling is achieved by using the same stored HTML marker and a shared CSS/rendering contract in the consumer site
- Tentman `preview.transformMarkdown` hooks apply to Tentman admin previews only; they do not run inside the consumer site runtime
- Consumer sites need a markdown rendering pipeline that supports the stored marker shape, such as mdsvex for safe inline HTML in a SvelteKit site, or a site-side allowlist transform before rendering
- Site-runtime metadata can be added to the plugin shape later, but is not required to ship the Tentman-side plugin host

## Test Plan

- Config parsing:
  - root config accepts `pluginsDir` and root `plugins`
  - markdown block usage accepts field-level `plugins`
  - invalid plugin references produce clear errors

- Plugin loading:
  - local mode loads plugins from repo files
  - GitHub-backed mode loads the same plugin shape from repo files
  - missing entrypoint, malformed plugin export, or duplicate plugin id surfaces a clear registry/load error

- Markdown editor integration:
  - field-scoped plugins only affect fields that opt in
  - plugin toolbar items appear only when enabled for that field
  - plugin extensions round-trip through Rich and Markdown tabs without data loss

- Buy button behavior:
  - inserting a buy button creates the expected HTML marker
  - editing an existing button updates attrs and label correctly
  - rich editor renders it as a button-like element
  - raw markdown shows the stable serialized HTML
  - multiple buy buttons in one document work correctly

- Preview rendering:
  - Tentman preview renders stored buy-button markers cleanly
  - preview remains safe and stable when plugin output is malformed or partially missing attrs
  - documents without plugins render exactly as before

- Cross-environment:
  - same example plugin works in both local and GitHub-backed mode
  - plugin-enabled markdown saves and reopens identically in both environments

## Assumptions and Defaults

- v1 prioritizes local-folder plugins in the site repo; npm/plugin marketplace support is out of scope
- v1 is a unified plugin architecture, but only markdown + preview capabilities are implemented now
- Block/validation/site-runtime capabilities are planned for by the shared plugin host shape, not implemented in this first phase
- No payment, entitlement, or licensing gate is included
- Stored buy-button representation is HTML with stable data attributes
- Raw markdown remains the persisted source of truth for markdown fields
- Existing `blockPackages` limitations are not carried into this new system; the new plugin host is expected to work in both environments
