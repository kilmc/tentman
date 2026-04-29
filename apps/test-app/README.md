# Test App

This app is the current reference consumer repo for Tentman.

If you want another repository to copy the Tentman config layout, this is the best example in the workspace.

## What It Shows

- Root config in [`/Users/kilmc/code/tentman/tentman/apps/test-app/.tentman.json`](/Users/kilmc/code/tentman/tentman/apps/test-app/.tentman.json)
- Content configs in [`/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/configs`](/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/configs)
- Reusable block configs in [`/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/blocks`](/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/blocks)
- A directory-backed collection for blog posts
- File-backed singleton pages for `about` and `contact`
- A reusable `imageGallery` block
- A checked-in manual navigation manifest at [`/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/navigation-manifest.json`](/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/navigation-manifest.json)
- A small site-side loader that reads the same manifest to mirror Tentman ordering
- A small repo-local markdown plugin at [`/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/plugins/callout-chip/plugin.js`](/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/plugins/callout-chip/plugin.js)
- Server-side markdown rendering with mdsvex so plugin HTML markers render as HTML on the site

## Folder Layout

```text
test-app/
  .tentman.json
  tentman/
    blocks/
    configs/
    navigation-manifest.json
    plugins/
    templates/
  src/content/
    pages/
    posts/
```

## Key Files

- [`/Users/kilmc/code/tentman/tentman/apps/test-app/.tentman.json`](/Users/kilmc/code/tentman/tentman/apps/test-app/.tentman.json)
- [`/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/configs/blog.tentman.json`](/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/configs/blog.tentman.json)
- [`/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/configs/about.tentman.json`](/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/configs/about.tentman.json)
- [`/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/configs/contact.tentman.json`](/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/configs/contact.tentman.json)
- [`/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/navigation-manifest.json`](/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/navigation-manifest.json)
- [`/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/blocks/image-gallery.tentman.json`](/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/blocks/image-gallery.tentman.json)
- [`/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/plugins/callout-chip/plugin.js`](/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/plugins/callout-chip/plugin.js)
- [`/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/templates/post.md`](/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/templates/post.md)
- [`/Users/kilmc/code/tentman/tentman/apps/test-app/src/lib/content/markdown.ts`](/Users/kilmc/code/tentman/tentman/apps/test-app/src/lib/content/markdown.ts)
- [`/Users/kilmc/code/tentman/tentman/apps/test-app/src/lib/server/content.ts`](/Users/kilmc/code/tentman/tentman/apps/test-app/src/lib/server/content.ts)
- [`/Users/kilmc/code/tentman/tentman/apps/test-app/src/routes/+layout.server.ts`](/Users/kilmc/code/tentman/tentman/apps/test-app/src/routes/+layout.server.ts)

## Running It

```sh
pnpm install
pnpm run dev
```

This repo is mainly here to exercise Tentman’s config discovery and content-editing flows, not to serve as polished product docs.

The fixture now also demonstrates the manual navigation contract:

- Top-level content configs include stable `id` values.
- The blog collection uses `idField: "slug"` so Tentman can persist item order.
- The site reads `tentman/navigation-manifest.json` on the server to mirror Tentman’s top-level and collection ordering.

It also demonstrates the repo-local markdown plugin contract:

- `.tentman.json` registers `callout-chip` in root `plugins`.
- `tentman/configs/blog.tentman.json` enables `callout-chip` on the blog `body` markdown field.
- The plugin stores stable inline HTML markers such as
  `<span data-tentman-plugin="callout-chip" data-tone="info" data-label="Note">Note</span>`.
- Tentman uses the plugin for rich editor atoms, toolbar dialogs, markdown serialization, and
  Tentman preview transforms.
- The Test App site renders markdown with mdsvex in `src/lib/content/markdown.ts`, because the
  consumer site is responsible for rendering and styling stored plugin markers at runtime.
