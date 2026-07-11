---
title: About this fixture
intro: >-
  This page is here to make Tentman feel concrete: a real route-backed markdown
  singleton with structured highlights, content components, and one shared image
  block.
highlights:
  - label: Singleton pages
    value: 3
    detail: >-
      About, FAQ, and Contact each use file-backed content with different field
      shapes.
  - label: Collections
    value: 1 blog
    detail: >-
      Posts live as individual markdown files and the frontend mirrors Tentman
      ordering.
  - label: Nested content
    value: FAQ sections
    detail: >-
      The FAQ schema includes repeatable sections with repeatable question items
      inside each one.
gallery:
  title: Reusable image block
  description: >-
    This page uses the shared image block data through a marker-only mdsvex
    component, so the route file stays the live content source.
  items:
    - image: /images/gallery/paper-stack.svg
      alt: Pinned planning notes and sketches on a studio wall
      caption: >-
        A reusable image block gives the fixture one clear place to exercise
        assets and captions.
    - image: /images/gallery/sunlit-desk.svg
      alt: 'A bright desk with a keyboard, coffee, and design comps'
      caption: >-
        The site stays deliberately restrained so content-model changes show up
        immediately.
    - image: /images/gallery/team-board.svg
      alt: A workshop board with cards arranged in lanes
      caption: >-
        This block is shared rather than page-specific, which makes it useful as
        a regression surface.
    - image: /images/gallery/entry-sign.svg
      alt: A hand-lettered studio sign beside an open doorway
      caption: >-
        Extra gallery entries help the fixture cover asset enumeration more
        realistically.
    - image: /images/gallery/meeting-table.svg
      alt: 'A meeting table with notebooks, markers, and scattered printouts'
      caption: >-
        The shared block now references every gallery asset so unused-file
        checks stay meaningful.
---

<svelte:head>
	<title>{title} | Tentman Test App</title>
</svelte:head>

<section class="page-header">
	<p class="eyebrow">Singleton page</p>
	<h1>{title}</h1>
	<p class="lead">{intro}</p>
</section>

<section class="stats-grid">
	{#each highlights as highlight (highlight.label)}
		<article class="metric-card">
			<p class="metric-value">{highlight.value}</p>
			<h2>{highlight.label}</h2>
			{#if highlight.detail}
				<p>{highlight.detail}</p>
			{/if}
		</article>
	{/each}
</section>

<section class="prose">

## Why this page exists

The test app is meant to show a small but believable content model. It should be plain enough that structural issues are obvious and varied enough that new Tentman features have somewhere honest to land.

- The homepage works like an index.
- The blog is a directory-backed collection.
- The FAQ page demonstrates nested collections.
- This page is a real mdsvex route file managed directly by Tentman.

## Content components

The first-class rich-content path is now a real markdown file. In this fixture, markdown can link readers toward :doc-link[the FAQ page]{href="/faq" variant="strong"} or :doc-link[the blog index]{href="/blog" variant="plain"} using semantic source markers instead of stored final HTML.

## Structured embeds

The gallery below is a marker-only content component. It resolves the current page's structured gallery data automatically through `@tentman/mdsvex`.

::gallery-embed

</section>
