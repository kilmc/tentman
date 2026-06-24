# Tentman

Tentman is a Git-backed CMS for existing static sites. It gives people a friendly way to edit the content already stored in their repository, while the site keeps its own framework, rendering, build, and deployment.

Add a small Tentman configuration layer to describe the content you want to edit—such as pages, posts, collections, and reusable blocks. Tentman then turns that configuration into an editor and writes changes back to the same JSON, Markdown, and asset files your site already uses.

## Getting started

Start with the [Tentman documentation](https://tentman.netlify.app/docs), which walks through a minimal blog-post setup and the configuration model.

The local CLI helps inspect and maintain a configured site:

```sh
npm install --save-dev tentman
npx tentman doctor
```

See the [CLI reference](packages/cli/README.md) for its available checks and maintenance commands.

## What Tentman manages

- `tentman.json` for site-wide settings and discovery paths
- `*.tentman.json` files describing editable content and fields
- Content stored in your repository: JSON, Markdown, directories of files, and assets
- Optional reusable blocks, content components, and navigation metadata

Tentman is deliberately additive: begin with one page or collection, keep the first configuration small, and expand it only where it earns its place.

## Learn more

- [Documentation](https://tentman.netlify.app/docs)
- [Configuration reference](https://tentman.netlify.app/docs/reference/root-config)
- [Blog-post guide](https://tentman.netlify.app/docs/getting-started/blog-posts)
- [CLI reference](packages/cli/README.md)
