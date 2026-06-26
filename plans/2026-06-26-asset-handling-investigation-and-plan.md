# Asset Handling Investigation And Phased Plan

## Summary

Tentman's asset handling should stay intentionally simple.

The goal is not to understand every framework's image pipeline, import graph, optimizer, or route output behavior. Tentman should be a polite Git-backed editing layer: it saves files where the developer configured them to live, and it writes the reference string the developer configured content to use.

The site's own framework and build process remain responsible for serving those references.

Recommended product boundary:

> Tentman does not process, bundle, transform, optimize, or import assets. It saves asset files to configured locations and writes configured references into content. Your site's framework/build system is responsible for serving those references.

This keeps Tentman flexible enough for SvelteKit, 11ty, Astro, Next, Nuxt, and custom setups without turning core into a framework-specific compatibility matrix.

## Why This Came Up

Issue #39 reported missing assets for a site where Tentman generated a broken asset proxy URL.

The failing shape was roughly:

```txt
value=/assets/05-skiingdino_carolinabuzio.jpg
assetsDir=tentman/configs/assets/
```

Tentman's current web asset proxy appears to assume that a leading-slash public URL can be mapped back to a repository file only when the configured assets directory is under a SvelteKit-style `static/` directory.

That assumption is too narrow.

For this reported site, the repository asset storage path and the public URL path are different concepts:

- repository storage path: `tentman/configs/assets/`
- public reference path: `/assets/...`

That is a legitimate setup if the site build, likely 11ty in this case, copies `tentman/configs/assets/` to the public `/assets/` output.

Tentman should be able to represent that mapping directly instead of deriving it from framework conventions.

## What We Learned

### SvelteKit

SvelteKit's straightforward public asset convention is `static/`.

Files in `static/` are served from the site root. For example:

```txt
static/uploads/photo.jpg -> /uploads/photo.jpg
```

SvelteKit/Vite can also process imported assets, but that only happens when assets are part of the import graph.

Important finding: `mdsvex` does not appear to automatically copy co-located Markdown images, rewrite them into Vite imports, or emit hashed build URLs. Its built-in image handling is minimal; custom behavior belongs in remark/rehype plugins or site-specific code.

So this Markdown:

```md
![Hello](./hello-world.jpg)
```

should not be assumed to make a neighboring `hello-world.jpg` available on the built SvelteKit site. Without custom site handling, it is just a browser-relative URL.

### 11ty

11ty is much friendlier to arbitrary asset layouts because passthrough copy can map repo paths/globs into output paths.

That makes setups like this reasonable:

```txt
tentman/configs/assets/photo.jpg -> /assets/photo.jpg
```

But Tentman still does not need to understand 11ty internals. It only needs enough config to know:

- where to save the file in the repository
- what reference to write into content

The 11ty site config remains responsible for copying/serving the file.

### Astro, Next, Nuxt, And Other Frameworks

Most modern frameworks distinguish between:

- public/static files copied as-is and referenced by URL
- imported/bundled assets processed by the build tool

Tentman should support the first category well.

Tentman should not attempt to support framework-imported assets in core. Imported assets are application source-code concerns, not content editing concerns.

## Design Position

Core asset handling should be rudimentary but flexible.

Tentman should model this:

```json
{
	"assets": {
		"path": "./static/uploads",
		"publicPath": "/uploads"
	}
}
```

Meaning:

- save uploaded files under `./static/uploads`
- write content references like `/uploads/file.jpg`
- use that mapping for previews/proxying inside Tentman
- trust the site to serve `/uploads/file.jpg`

The same model can support non-SvelteKit projects:

```json
{
	"assets": {
		"path": "./tentman/configs/assets",
		"publicPath": "/assets"
	}
}
```

This should be enough for the current 11ty-style need if the site build copies `./tentman/configs/assets` to `/assets`.

## Collection-Level Assets

Root assets should provide the default behavior.

Collections should be able to override that default when a particular content type has a different asset convention:

```json
{
	"label": "Blog Posts",
	"type": "collection",
	"content": {
		"path": "./content/posts"
	},
	"assets": {
		"path": "./content/posts/assets",
		"publicPath": "/posts/assets"
	}
}
```

If a developer wants co-located assets, Tentman should not prevent it:

```json
{
	"label": "Blog Posts",
	"type": "collection",
	"content": {
		"path": "./content/posts"
	},
	"assets": {
		"path": "./content/posts/{{slug}}",
		"publicPath": "/posts/{{slug}}"
	}
}
```

But Tentman should not add special framework machinery to make that work. This is only valid if the developer's site already serves that path correctly.

In other words: co-location is a storage/reference convention, not a Tentman build feature.

## Things We Are Explicitly Not Solving In Core

Tentman should not try to:

- import images into Svelte/React/Vue files
- rewrite Markdown images into Vite imports
- generate framework-specific image components
- run image optimization pipelines
- infer output routes from framework conventions
- copy files into framework build output directories
- deeply understand mdsvex, Astro content collections, Next Image, Nuxt assets, or 11ty passthrough internals

Those may be useful in specific sites, but they should remain site build concerns or future integration/plugin concerns, not the core asset model.

## Phase 1: Unblock Issue #39

Goal: get the reported site working without designing the entire future asset system.

Likely quick fix:

- stop deriving public URLs only from `static/`
- allow asset storage path and public path to be configured separately
- make the asset proxy resolve a public value such as `/assets/photo.jpg` back to the configured repository path, such as `tentman/configs/assets/photo.jpg`
- preserve compatibility with the existing `assetsDir` behavior while introducing the new mapping

MVP config shape could be:

```json
{
	"assets": {
		"path": "./tentman/configs/assets",
		"publicPath": "/assets"
	}
}
```

Phase 1 should answer these practical questions:

- Where does the friend's site actually store uploaded assets in the repo?
- What URL path does the built site use for those assets?
- Does the 11ty config already copy that repo folder to the expected public path?
- Are existing content references already written as `/assets/...`?

If those answers match the suspected shape, Phase 1 can be a small but meaningful asset mapping fix rather than a full asset-system rebuild.

## Phase 2: First-Class Simple Asset Config

Goal: turn the Phase 1 mapping into a clear, documented asset model.

This phase should refine and stabilize:

- root-level default asset config
- collection-level asset overrides
- migration path from `assetsDir` to `assets.path`
- how Markdown image insertion chooses an asset config
- how structured image/file fields choose an asset config
- validation for unsafe paths and malformed public paths
- preview/proxy behavior based on explicit `path` + `publicPath`
- docs explaining what Tentman does and does not do

Possible base vocabulary:

```json
{
	"assets": {
		"path": "./static/uploads",
		"publicPath": "/uploads"
	}
}
```

This may be enough for a long time.

If later needed, collection-level overrides can use the same shape:

```json
{
	"assets": {
		"path": "./content/posts/assets",
		"publicPath": "/posts/assets"
	}
}
```

Named asset locations or presets can come later as sugar if the project starts repeating the same asset policy in many places. They should not drive the first design.

## Phase 3: Bucket Storage

Goal: support assets stored outside the Git repository.

This is intentionally not part of the urgent fix.

The likely future shape is to define storage separately, then point asset handling at that storage:

```json
{
	"assetStores": {
		"site-media": {
			"type": "bucket",
			"provider": "cloudflare-r2",
			"bucket": "site-media",
			"publicUrl": "https://media.example.com"
		}
	},
	"assets": {
		"store": "site-media",
		"path": "uploads",
		"publicPath": "https://media.example.com/uploads"
	}
}
```

Open questions for the bucket phase:

- Which providers matter first?
- Where do credentials live?
- Does Tentman upload directly, or does it create draft records for another process?
- How are deletes, renames, and orphan cleanup handled?
- How do draft previews work before an asset is publicly available?

This should be treated as a larger feature with its own design pass.

## Recommended Next Step

Start with Phase 1.

For issue #39, ask the site developer for:

- the current Tentman config
- the 11ty config, especially passthrough copy settings
- the repo path where the missing image file actually exists
- the public URL where that file is expected to appear on the live site
- one example content file that references the broken asset

With that information, confirm whether this is simply a missing `path` + `publicPath` mapping.

If yes, implement the smallest asset config/proxy change that supports that mapping, then use Phase 2 to make the model feel deliberate instead of patched-on.

