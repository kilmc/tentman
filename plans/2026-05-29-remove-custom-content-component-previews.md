# Remove Custom Content Component Previews

## Summary

Replace repo-authored `preview.njk` / `preview.css` with a fixed Tentman-owned grey label preview.
Content components should keep working as semantic markdown markers, rich editor atoms,
toolbar/dialog items, and final-site `render.njk` output. The only removed capability is
user-customized authoring previews.

This is a full contract removal: content component folders are now `component.json` + `render.njk`.
Existing `preview.njk` / `preview.css` files should be silently ignored.

## Key Changes

### Web Authoring Previews

- Replace `preview.njk` rendering in markdown preview and rich editor node views with app-owned
  HTML showing only `editor.toolbarLabel`.
- Use the existing humanized component-name fallback when `editor.toolbarLabel` is absent.
- Preserve current interaction behavior:
  - rich editor atoms remain selectable/clickable/editable;
  - read-only preview surfaces remain read-only.
- Keep validation for malformed attributes and missing references.
- Keep invalid markers in the existing red error presentation.

### Core Content Component Contract

- Stop loading, requiring, validating, inspecting, scaffolding, watching, or rendering
  `preview.njk` and `preview.css`.
- Keep `render.njk` as the only template file.
- Keep `renderContentComponent`, but change its signature to:

```ts
renderContentComponent(component, instance, options?)
```

- `renderContentComponent` should always render `render.njk`.
- Remove preview mode from render/resolve APIs.
- Change `referenceScope` to string-only:

```json
"referenceScope": "self"
```

Allowed values are `"self"`, `"container"`, and `"full"`.

- Remove `{ preview, render }` reference-scope object support.

### Browser Safety

- Split core so browser-safe content-component helpers do not import Nunjucks at module load time.
- Keep Nunjucks only in the Node/rendering module used for final `render.njk` output.
- Remove the web Vite Nunjucks browser shim once no browser code imports template rendering.
- Delete the safe-preview/shadow-root/sanitizer path from the web app, since generated preview
  HTML is now app-owned.

### Docs And Tooling

- Update active docs, README, app docs, CLI create/inspect output, scaffold generation, and package
  tests to describe only `component.json` + `render.njk`.
- Leave historical `plans/` documents untouched.
- Update the Vite reload plugin and local discovery signatures to watch only `component.json` and
  `render.njk`.
- Remove `preview.njk` from fixtures and example components where it only exists for the old
  contract.

## Test Plan

### Core Tests

- Component loading succeeds with only `component.json` and `render.njk`.
- Existing `preview.njk` / `preview.css` files are ignored silently.
- `renderContentComponent(component, instance, options?)` renders final HTML from `render.njk`.
- `referenceScope` string values resolve correctly.
- Object-shaped preview/render scopes are rejected.

### Web Tests

- Markdown preview replaces known component markers with grey label boxes using toolbar label or
  fallback.
- Rich editor atoms render the same fixed label and remain selectable/editable.
- Invalid markers still show red error states.
- Missing/unknown components still surface existing preview/component errors.
- Browser bundle no longer needs the Nunjucks browser shim.

### Tooling And Docs Tests

- CLI scaffold creates only `component.json` and `render.njk`.
- CLI inspect/list no longer prints preview template/CSS details.
- Vite reload plugin ignores `preview.njk` and reloads on `component.json` / `render.njk`.
- Run focused package tests plus:

```sh
pnpm --filter @tentman/web run check
```

## Assumptions

- Existing obsolete `preview.njk` / `preview.css` files should not break users and should not
  produce warnings.
- Historical planning docs should remain as historical records.
- Final site rendering through `render.njk` remains supported and continues to use Nunjucks outside
  the browser preview path.
- Any future customizable preview layouts will be app-owned, not repo-authored Nunjucks.

