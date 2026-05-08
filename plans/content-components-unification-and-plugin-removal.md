# Unify on Content Components and Remove Plugins

## Summary

This should be treated as a medium-sized continuation project, not a rewrite. The core content-component model is already good and already spans core validation, authoring, preview, and mdsvex rendering. The bigger work is expanding that model in a few places that are currently inline-only or globally discovered, then deleting the parallel plugin path entirely.

The end state should be:

- content components are the only reusable markdown extension system
- markdown fields opt into them with `components: ["..."]`
- components get a small declarative editor config
- components support both inline and standalone block authoring
- inline components with no markdown-label source serialize as `:name{...}` instead of `:name[]{...}`
- the entire repo-local plugin system, config surface, runtime, docs, and tests are removed with no compatibility layer

## Implementation Workflow

- Prioritize steady implementation progress over phase-by-phase reporting.
- Do not stop after each phase or commit just to summarize progress.
- Ask for input only when a real decision, blocker, or clarification is needed.
- Keep running relevant tests and checks throughout the work.
- As context usage approaches roughly 70%, provide a concise high-signal summary so the work can continue without relying on auto-compacting.

## Key Changes

### 1. Replace plugin config with component allowlists

- Remove root config support for `pluginsDir` and `plugins`.
- Remove markdown block support for `plugins`.
- Add markdown block support for `components?: string[]` as an explicit allowlist.
- Treat missing or empty `components` as no custom components enabled for that field.
- Keep `componentsDir` as the only root-level extension discovery config.

Implementation shape:

- Tighten config typing so `components` is a markdown-field concern, not a generic block property.
- In the markdown editor, load the full repo component registry once, then filter it to the field allowlist before building extensions and toolbar items.
- In Tentman preview rendering, apply component preview transforms only for components enabled on that markdown field.
- If a field contains a directive for a component not enabled on that field, preserve the source marker and show a clear preview/editor diagnostic.

### 2. Add a small declarative editor config to `component.json`

Keep the content-component model declarative. Do not introduce JS hooks.

Add an optional component-level editor config:

```json
{
  "editor": {
    "toolbarLabel": "Buy Button",
    "dialogTitle": "Buy button",
    "submitLabel": "Save buy button"
  }
}
```

Add an optional attribute-level editor config:

```json
{
  "attributes": {
    "href": {
      "type": "string",
      "required": true,
      "editor": {
        "label": "URL",
        "control": "url"
      }
    },
    "label": {
      "type": "string",
      "default": "Buy online",
      "editor": {
        "hidden": true
      }
    }
  }
}
```

Rules:

- `editor.toolbarLabel`, `editor.dialogTitle`, and `editor.submitLabel` are optional string overrides.
- `attribute.editor.label` overrides the generated field label.
- `attribute.editor.control` may be `text`, `url`, or `select`.
- `attribute.editor.hidden` suppresses that field from the dialog UI.
- Hidden attributes still participate in normalization, defaults, serialization, preview rendering, and final render output.
- Enum attributes continue to infer `select` by default; `href` and `url` still infer `url` by default when no override is present.

This is enough to support fixed-label components like Theresa’s buy button without building a more complex UI DSL.

### 3. Support label-less inline syntax cleanly

Extend inline directive parsing and serialization so components with no `valueFromMarkdownLabel` attribute use a label-less syntax.

Rules:

- Keep existing inline syntax when a markdown-label attribute exists:
  - `:buy-button[Buy tickets]{href="/tickets"}`
- Use label-less inline syntax when no attribute uses `valueFromMarkdownLabel`:
  - `:buy-button{href="/tickets"}`
- Never serialize empty `[]`.
- Parsing should accept both forms.
- Serialization should always choose the canonical form for the component definition.

Implementation areas:

- core normalization and serialization helpers
- editor markdown tokenizer and parser
- Tentman markdown preview transform
- `@tentman/mdsvex` adapter parsing and rendering
- tests for both parse and serialize paths

### 4. Add real block component support as standalone block atoms

Support `kind: "block"` as a real authoring and rendering path, but keep v1 intentionally narrow:

- support standalone block atoms
- do not support nested rich-text bodies or container content yet

Chosen block syntax:

- with markdown label: `::callout-box[Latest update]{tone="warning"}`
- without markdown label: `::callout-box{tone="warning"}`

Behavior:

- block components become selectable block-level editor nodes
- they render through `preview.njk` in Tentman
- they serialize back to canonical block directive syntax
- the site build renders them through `render.njk`
- they can be inserted and edited from the same declarative dialog system as inline components

Implementation changes:

- extend content-component editor artifacts to build both inline and block Tiptap nodes
- add a block-node tokenizer, parser, and serializer path
- expand Tentman preview transforms to detect and render block directives
- expand `@tentman/mdsvex` to transform block directives, not just inline directives embedded in paragraph source
- keep block components atomic in the editor for this phase

This is why block support is medium-sized: it is the same system, but it touches the editor node model, markdown parsing, preview transforms, and mdsvex adapter together.

### 5. Remove the repo-local plugin system completely

Delete the plugin system rather than preserving it as an escape hatch.

Remove:

- plugin types, registry, browser loaders, markdown node-view runtime, preview-transform runtime
- plugin-related local repository probing and diagnostics
- `/api/repo/plugin-module`
- plugin root-config parsing and validation
- markdown-field plugin handling in the editor
- preview plugin handling in markdown preview surfaces
- plugin docs, examples, fixtures, and tests
- plugin references in README, docs, and example configs

Also remove plugin-specific terminology from the product surface so `content components` is the single concept.

## Test Plan

- Config parsing:
  - root config rejects or ignores removed plugin fields
  - markdown blocks accept `components`
  - non-markdown blocks cannot declare `components`
- Component editor config:
  - toolbar and dialog labels honor overrides
  - hidden attributes stay out of the dialog but still render and serialize correctly
  - control overrides render the expected form inputs
- Inline components:
  - parse and serialize both `:name[label]{...}` and `:name{...}`
  - canonical serialization omits `[]` when no markdown-label attribute exists
  - per-field allowlist limits available toolbar items and editable directives
- Block components:
  - insert, edit, preview, and serialize block atoms end to end
  - block directives render correctly in Tentman preview and mdsvex build output
  - invalid block directives preserve source and surface errors
- Cleanup:
  - all plugin runtime tests removed or replaced
  - docs and examples updated to component-only usage
  - repository checks no longer probe or mention plugins

## Assumptions and Defaults

- No backward compatibility is required for old plugin configs, plugin files, or stored plugin HTML markers.
- `components` is the only per-field API; no allow-all mode is added.
- The initial editor config remains deliberately small and declarative.
- Block component v1 supports standalone block atoms only, not nested rich-text bodies.
- Public-site rendering continues to be owned by `@tentman/mdsvex` plus component templates, not by Tentman preview-specific transforms.
