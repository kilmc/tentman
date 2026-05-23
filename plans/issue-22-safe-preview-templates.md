# Issue 22: Safe Preview Templates

## Summary

Replace the current "repo-rendered HTML goes straight into Tentman DOM" model with a presentational-only preview pipeline for `preview.njk`.

This work will keep the feature, but redefine its security contract:

- `preview.njk` remains supported for authoring previews
- rendered preview output is sanitized before display
- sanitized output is mounted inside a Shadow DOM preview host
- Tentman owns all interactivity around the preview
- no repo-controlled interactive HTML is allowed
- optional `preview.css` is part of this project as phase 2, loaded only inside the Shadow DOM and filtered to a safe CSS subset
- developer-facing warnings belong in CLI validation/inspect output, not the editor UI

Suggested branch name:
`issue-22-safe-preview-templates`

The implementation should begin by creating that branch, then carry the work through to a PR.

## Key Changes

### 1. Define the new preview security contract

Document `preview.njk` as a sanitized presentational fragment, not arbitrary DOM.

Allowed HTML in phase 1:

- `div`, `span`, `p`
- `strong`, `em`, `b`, `i`
- `ul`, `ol`, `li`
- `br`, `hr`
- `h1`, `h2`, `h3`, `h4`, `h5`, `h6`
- `img`

Disallowed HTML:

- all interactive/navigation/form elements
- `a`, `button`, `input`, `select`, `textarea`, `form`, `label`, `details`, `summary`
- document/style/script/embed tags
- `script`, `style`, `link`, `meta`, `base`, `template`, `iframe`, `object`, `embed`
- `canvas`
- `svg` is out of scope for this phase

Allowed attributes:

- `class`
- `src` on `img`
- `alt` on `img`

Disallowed attributes:

- `style`
- all `on*` event attributes
- `href`, `action`, `formaction`, `srcdoc`
- `title`, `role`, `data-*`
- any attribute not explicitly allowed for the safe subset

Image `src` policy:

- allow root-relative and relative paths such as `/images/...`, `./x.jpg`, `../x.jpg`
- allow `http:` and `https:`
- block `data:`, `file:`, `javascript:`, and all other schemes

### 2. Replace direct DOM insertion with sanitized Shadow DOM rendering

Refactor the preview rendering path used by markdown component previews so repo output is never assigned directly into shared app DOM as trusted HTML.

Implementation shape:

- render `preview.njk` exactly as today through the existing Nunjucks pipeline
- sanitize the rendered HTML fragment after rendering
- mount the sanitized fragment into a dedicated shadow root preview host
- keep Tentman click/popover/reference behavior attached to the outer host or wrapper, not to repo markup
- preserve existing component preview data flow and reference resolution

Containment rules for the preview host:

- outer Tentman-owned wrapper clips the preview with `overflow: hidden`
- inner preview root inside the shadow tree uses `position: relative`
- repo preview content must not be able to visually escape the bounded preview region
- Tentman should provide base preview styles inside the shadow root so existing simple previews keep rendering cleanly

This should cover both:

- rich editor content-component node previews
- read-only markdown/content previews that currently pass repo-generated preview HTML through markdown rendering

### 3. Add developer-facing sanitization diagnostics

Add sanitization diagnostics to developer tooling, not end-user UI.

CLI behavior:

- extend existing component validation/inspect surfaces to report stripped/unsafe preview HTML patterns
- later in phase 2, extend the same tooling to report stripped/unsafe `preview.css` rules
- warnings are developer-facing by default; they should not show as runtime editor warnings in Tentman UI

Docs/CLI scaffolding:

- update generated component guidance so authors know `preview.njk` is sanitized
- when `preview.css` lands, document it as optional and scoped to preview rendering only

### 4. Phase 2: add optional `preview.css`

Support an optional `preview.css` adjacent to each component preview, loaded only inside the shadow root for that component preview.

File/interface addition:

- optional `preview.css` alongside `component.json`, `render.njk`, and `preview.njk`

Runtime behavior:

- load `preview.css` only for preview rendering, never for final site rendering
- inject it only into the component's shadow root
- filter unsafe CSS before applying it
- no user-facing runtime warning banners; filtered rules are surfaced through CLI diagnostics

Phase-2 CSS policy:

- allow normal presentational/layout CSS including typography, spacing, borders, colors, flex/grid, sizing, `overflow`, and `position: absolute`
- disallow `position: fixed`
- disallow `z-index`
- disallow `pointer-events`
- disallow `transform`
- disallow animation and transition features
- disallow `@import`
- disallow `url(...)`
- Tentman wrapper still owns clipping and outer containment regardless of allowed internal CSS

## Test Plan

Add tests at the core, web, and compatibility levels.

Core/security behavior:

- preview sanitizer preserves allowed tags/attributes
- sanitizer strips disallowed tags entirely
- sanitizer strips disallowed attributes from otherwise allowed elements
- `img src` accepts relative/root-relative and `http(s)` URLs
- `img src` rejects `data:`, `file:`, `javascript:` and unknown schemes

Web rendering behavior:

- rich editor component preview renders through Shadow DOM, not shared `innerHTML`
- preview remains non-interactive even if repo output contains links/forms/events
- outer Tentman click/popover behavior still works after Shadow DOM migration
- bounded preview host clips oversized/absolutely positioned content
- read-only markdown/content preview path applies the same sanitization rules

CSS phase-2 behavior:

- safe CSS applies inside the shadow root
- blocked CSS rules do not apply
- repo CSS cannot affect page styles outside the shadow root
- absolute positioning works within the preview root
- fixed positioning, `z-index`, pointer-event tricks, transforms, animation, `@import`, and `url(...)` are rejected/removed

Compatibility coverage:

- Theresa's current preview components continue to render without repo changes
- existing simple `tm-component-preview` text previews remain visually acceptable after Shadow DOM isolation

## Assumptions and Defaults

- branch creation is part of implementation, not planning; the first implementation step is to create `issue-22-safe-preview-templates`
- `preview.css` is included in project scope, but implemented after HTML sanitization and Shadow DOM migration
- SVG is intentionally excluded from this phase
- freeform class names are allowed; selector naming is not restricted
- no repo-authored interactivity is supported in previews
- no end-user warning UI will be added for stripped preview content or CSS
- Theresa's repo does not need content changes for phase 1 based on its current `preview.njk` files, which are already simple presentational spans
