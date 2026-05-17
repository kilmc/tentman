# First-Class Tentman Markdown in `@tentman/mdsvex`

## Summary

Make real markdown files the first-class rich-content path in Tentman, and make
`@tentman/mdsvex` automatically provide Tentman render context for those files.

This iteration is intentionally opinionated:

- rich content, marker components, and structured reference-aware embeds are a markdown-file feature
- JSON remains valid for structured content, but it is not being improved as a rich-content path here
- no `renderTentmanMarkdown` or similar compatibility API is designed or implemented in this iteration

## Key Changes

### 1. Product boundary and docs

Document one clear model:

- use `.md` / `.markdown` files for content that has a markdown body, rich text, or Tentman content components
- use JSON for structured content/settings
- mixed models may continue to work where already supported, but they are outside the main happy path

Update the main README and docs examples to show:

- a file-backed markdown singleton as the canonical singleton example
- marker-only components such as `::gallery-embed` resolving structured page data automatically in mdsvex
- the existing JSON-backed markdown cases as compatibility behavior, not the recommended architecture

Do not add warnings or errors for JSON-backed markdown in this iteration.

### 2. Shared file-to-content resolution in core

Add a shared core helper that maps a real markdown file back to its Tentman content record and
render context.

New core export:

- `resolveTentmanMarkdownFileRenderContext(project, absoluteFilePath)`

Behavior:

- accept a loaded Tentman project plus an absolute markdown file path
- only resolve for Tentman-managed markdown files:
  - file-backed markdown singletons: exact path match
  - directory-backed markdown collections: file path inside the configured content directory with `.md` or `.markdown`
- return:
  - `config`
  - `contentItem`
  - `blocks`
  - `referenceIndex`
  - `resolveStructuredBlocks`
- build `referenceIndex` with the existing shared reference logic
- reuse the same reusable-block expansion logic already used in diagnostics/test-app helpers
- return `null` when the file is not a Tentman-managed markdown file
- throw a clear error when the file is Tentman-managed markdown but the content record cannot be resolved or its reference context cannot be built

This helper is the single source of truth for file-backed markdown render context.

### 3. First-class auto mode in `@tentman/mdsvex`

Extend `tentmanComponents()` with native Tentman auto-context support.

Public API additions:

```ts
tentmanComponents({
  componentsDir?: string,
  projectRoot?: string,
  resolveTentmanContext?: 'off' | 'auto',
  resolveRenderOptions?: (file) => Promise<object> | object,
  onError?: 'throw' | 'warn',
  templateEngine?: 'nunjucks'
})
```

Defaults:

- `projectRoot`: `process.cwd()`
- `resolveTentmanContext`: `'off'`

Auto mode behavior:

- when `resolveTentmanContext === 'auto'`, load the Tentman project once from `projectRoot`
- for each compiled file, call the new core helper with the file path
- if the file resolves to a Tentman markdown record, use that render context automatically
- if the file is not Tentman-managed markdown, use no Tentman context and behave like today
- after auto-resolution, call `resolveRenderOptions(file)` if provided and shallow-merge its return value over the auto-generated context
- manual `resolveRenderOptions(file)` values win on key collisions so consumers can override or extend the auto context

Result:

- `::gallery-embed` and similar components in real Tentman markdown files work without site-specific `contentItem` / `referenceIndex` glue
- existing manual integrations remain supported

### 4. Example app alignment

Align the test app with the intended architecture without converting every current JSON page.

Use one canonical markdown-backed singleton example:

- convert one existing rich singleton page to a real mdsvex-backed markdown file
- recommended target: `about`
- point its Tentman config at the route-backed markdown file so the content file itself is the live route source
- enable `@tentman/mdsvex` + `remark-directive` in the test app Svelte config with auto mode enabled
- use this page in the README/docs as the reference example for first-class rich content

Keep the other JSON-backed pages unchanged for now, but stop presenting them as the canonical
rich-content approach.

## Test Plan

### Core

Add tests for `resolveTentmanMarkdownFileRenderContext()` covering:

- file-backed markdown singleton resolution
- directory-backed markdown item resolution
- reusable block expansion in returned context
- reference-index creation for marker-only and selector-based components
- non-Tentman markdown file returns `null`
- Tentman-managed markdown file with broken resolution throws a clear error

### mdsvex package

Add tests for `tentmanComponents({ resolveTentmanContext: 'auto' })` covering:

- marker-only block component resolves structured page data automatically for a markdown singleton
- reference-aware component resolves automatically for a directory-backed markdown item
- non-Tentman markdown file compiles without auto-context
- manual `resolveRenderOptions(file)` overrides auto-generated fields
- existing manual-only mode still behaves exactly as before

### Example app / integration

Add one integration-level check that proves the canonical markdown singleton path works end to
end:

- the markdown route compiles through mdsvex
- Tentman content components render through the auto-context path
- a reference-aware marker component receives the current entry's structured data without custom route glue

Update the README/example descriptions so they match the actual runtime architecture.

## Assumptions and Defaults

- first-class rich-content support means real markdown files only in this iteration
- JSON-backed markdown fields remain supported only through existing compatibility paths; they receive no new ergonomic investment here
- no new diagnostics are added for JSON-backed markdown in this change
- auto context is opt-in via `resolveTentmanContext: 'auto'` for backward compatibility
- the canonical example migration is limited to one markdown-backed singleton, not the whole test app
