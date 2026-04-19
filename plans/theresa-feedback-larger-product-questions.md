# Theresa Integration Feedback: Larger Product Questions

## Summary

This note captures larger product questions that came out of using Tentman with Theresa Grieben's SvelteKit site on April 18, 2026.

It is not a roadmap and it is not a commitment to build these features. It is a parking place for the parts of the feedback that are larger than quick fixes, so the conversation can be picked up later without losing the product shape.

The most likely near-term larger directions are:

- compact, reorderable collection item previews
- content/editor adapters for project-specific markdown-like syntax and file formats

Other ideas in this note are supporting possibilities or longer-term directions, not settled product decisions.

## Context

The Theresa site integration used:

- root config: `.tentman.json`
- project collection config: `tentman/configs/projects.tentman.json`
- reusable image gallery block: `tentman/blocks/image-gallery.tentman.json`
- navigation manifest: `tentman/navigation-manifest.json`
- project content: `src/lib/projects/content/*.md`

The integration exposed both smaller app bugs and broader questions about how Tentman should support real framework-backed content sites without forcing those sites to reshape their source files around Tentman's current editor model.

## Product Separation

A useful framing from the feedback is that Tentman should keep these concerns separate:

- content identity: stable ids, filenames, slugs, and config ids
- editor display: labels, compact previews, thumbnails, secondary metadata, and warnings
- public site rendering: the consumer app owns the final rendered output
- source preservation: Tentman should edit declared content without damaging source it does not understand
- workflow state: local disk writes, commits, branches, drafts, reviews, and publish steps

Several rough edges came from those concepts being coupled too implicitly. For example, using the first field as the collection label couples schema order to editor display, and treating markdown support as only `.md` / `.markdown` couples content editing to file extension assumptions.

## Collection Item Previews And Reordering

Image gallery editing made it obvious that collection items need a better compact representation. This is not only an image-field problem. The same issue applies to FAQs, long text blocks, testimonials, links, navigation entries, or any nested array where the user needs to scan, edit, and reorder items.

A future collection item display model could support:

- a compact row or card representation
- a clear drag handle when reordering is available
- a primary label
- optional secondary metadata
- optional thumbnail or preview
- a warning or empty state for missing required fields
- click-to-edit behavior that does not conflict with drag behavior
- image thumbnails that can be expanded when useful

The simple configuration path might be:

```json
{
	"displayField": "title",
	"secondaryDisplayField": "group",
	"thumbnailField": "image.src"
}
```

The richer long-term path might allow a custom collection item display registered by an advanced extension bundle. That should be treated as a later design question rather than the first implementation.

Open questions:

- Should reordering be available for all array-backed collections by default?
- Should collection configs explicitly declare whether order is meaningful?
- How should Tentman represent drag handles, selection, and edit actions without making compact rows feel crowded?
- How should empty or invalid item previews appear to a non-technical editor?
- Should nested collection item previews use the same display config shape as top-level collection navigation?

## Content Adapters And Markdown-Like Files

The feedback around `.svx` / mdsvex is not that Tentman should understand or render Svelte components. The more useful boundary is:

Tentman should let a developer define how project-specific source syntax appears inside the editor and how it serializes back to the source file.

That means Tentman could allow a site to:

- declare additional markdown-like file extensions, such as `.svx` or `.mdx`
- parse known project-specific syntax into named editor placeholders
- show something like `Gallery: main` as a small UI element in the editor
- serialize that placeholder back into the exact syntax the site expects
- preserve unknown syntax as much as possible

This keeps public rendering owned by the site. Tentman does not need to render React, Svelte, MDX, or mdsvex components. It only needs a bounded editor representation and a save contract.

Example direction:

```json
{
	"type": "content",
	"id": "projects",
	"label": "Projects",
	"format": {
		"kind": "markdown",
		"extensions": [".md", ".svx"],
		"adapter": "theresaProjectMarkdown"
	}
}
```

The adapter might contribute:

- file extension support
- parser behavior for known body syntax
- serializer behavior for known editor nodes
- Tiptap node definitions or placeholder views
- validation messages for adapter-owned syntax

Open questions:

- Are adapters JSON-configured, local trusted code, compiled extension-bundle code, or some combination?
- What is the smallest useful adapter API for v1?
- Can adapters operate only on body content, or also on frontmatter?
- What should happen when an adapter is missing or fails to load?
- How should unknown source syntax appear in the editor?
- How much formatting preservation should Tentman promise on save?
- Which parts of this belong in core Tentman and which belong in a pro/custom extension layer?

## Source Preservation

Source preservation means that when Tentman opens a file, edits a declared field, and saves it again, it should avoid rewriting or damaging parts of the file it does not own.

For example, if a user edits only a frontmatter `title`, Tentman should not accidentally remove a framework component in the markdown body, flatten carefully formatted YAML, reorder unrelated keys unnecessarily, or normalize custom syntax away.

This is important for artist and portfolio sites where content files may include hand-authored HTML, framework-specific component islands, gallery markers, imports, or unusual markdown conventions.

This does not mean Tentman must perfectly preserve every byte of every file in the first version. It does mean Tentman should be honest about what it can safely edit, provide escape hatches, and avoid broad rewrites where a narrower edit is possible.

Open questions:

- What preservation guarantees should the default markdown parser make?
- Should stronger preservation require an adapter?
- Should Tentman warn when a save will substantially rewrite a file?
- Should there be a raw source fallback for unsupported syntax?

## Local Workflow State

The Theresa integration also raised broader questions about local mode.

Possible future state distinctions:

- changed in the editor but not written
- written to disk
- committed locally
- staged for review
- saved as a draft branch
- ready to publish or push

The most important near-term product need is clarity. Users should know whether a button writes files, creates a commit, switches branches, pushes remotely, or only stores a draft in Tentman state.

Full Git-aware local drafts are a larger feature and should be planned separately if pursued. Auto-committing directly to `main` or `master` should require a deliberate review/confirmation step.

## Related But Less Certain Ideas

The following ideas came up during triage but are less definite than collection previews/reordering and content adapters:

- custom collection item layout templates
- richer config diagnostics with linked warnings and fix suggestions
- first-class media pipeline for uploads, dimensions, path normalization, thumbnails, and alt requirements
- deeper local Git workflow with draft branches and review states
- plugin-contributed parser and serializer behavior
- richer manual navigation setup and preview flows

These may become real features, but they should not be treated as already accepted scope.

## Likely Planning Threads

If this work continues, the two most useful planning threads are:

1. Collection item previews and reordering

   Define the compact item display model, configuration shape, drag behavior, nested collection behavior, and image preview affordances.

2. Content adapters for markdown-like source files

   Define how a repo can opt into additional file extensions and project-specific editor placeholders without requiring Tentman to understand the site's rendering framework.

Both threads should use the Theresa site as a realistic test case, but the resulting design should remain general enough for other SvelteKit, mdsvex, MDX, and framework-backed content sites.
