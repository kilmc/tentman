# Test App

This app is the current reference consumer repo for Tentman.

If you want another repository to copy the Tentman config layout, this is the best example in the workspace.

## What It Shows

- Root config in [`/Users/kilmc/code/tentman/tentman/apps/test-app/tentman.json`](/Users/kilmc/code/tentman/tentman/apps/test-app/tentman.json)
- Content configs in [`/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/configs`](/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/configs)
- Reusable block configs in [`/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/blocks`](/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/blocks)
- A directory-backed collection for blog posts
- A route-backed markdown singleton for `about` plus file-backed singleton pages like `contact`
- A reusable `imageGallery` block
- A checked-in manual navigation manifest at [`/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/navigation-manifest.json`](/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/navigation-manifest.json)
- A small site-side loader that reads the same manifest to mirror Tentman ordering
- Auto Tentman mdsvex context for the canonical markdown-backed singleton example
- Server-side markdown rendering with mdsvex plus Tentman content components for manual compatibility paths

## Folder Layout

```text
test-app/
  tentman.json
  tentman/
    blocks/
    configs/
    navigation-manifest.json
    templates/
  src/content/
    pages/
    posts/
  src/routes/
    about/
```

## Key Files

- [`/Users/kilmc/code/tentman/tentman/apps/test-app/tentman.json`](/Users/kilmc/code/tentman/tentman/apps/test-app/tentman.json)
- [`/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/configs/blog.tentman.json`](/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/configs/blog.tentman.json)
- [`/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/configs/about.tentman.json`](/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/configs/about.tentman.json)
- [`/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/configs/contact.tentman.json`](/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/configs/contact.tentman.json)
- [`/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/navigation-manifest.json`](/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/navigation-manifest.json)
- [`/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/blocks/image-gallery.tentman.json`](/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/blocks/image-gallery.tentman.json)
- [`/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/templates/post.md`](/Users/kilmc/code/tentman/tentman/apps/test-app/tentman/templates/post.md)
- [`/Users/kilmc/code/tentman/tentman/apps/test-app/src/routes/about/+page.md`](/Users/kilmc/code/tentman/tentman/apps/test-app/src/routes/about/+page.md)
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

For the newer content-components workflow:

- The canonical setup docs live in the repo root [README.md](/Users/kilmc/code/tentman/tentman/README.md)
  and in Tentman’s in-app `/docs` page.
- The canonical singleton example is the route-backed markdown file
  [`/Users/kilmc/code/tentman/tentman/apps/test-app/src/routes/about/+page.md`](/Users/kilmc/code/tentman/tentman/apps/test-app/src/routes/about/+page.md).
- The Test App is ready for checked-in content components under
  [`/Users/kilmc/code/tentman/tentman/apps/test-app/src/lib/content-components`](/Users/kilmc/code/tentman/tentman/apps/test-app/src/lib/content-components).
- `svelte.config.js` already wires `@tentman/mdsvex` plus `remark-directive` with
  `resolveTentmanContext: 'auto'`.
- The blog route still uses manual markdown rendering so the app covers both the new markdown-first
  path and the existing compatibility path.
