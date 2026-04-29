<script lang="ts">
	import { resolve } from '$app/paths';
	import GalleryGrid from '$lib/components/GalleryGrid.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Tentman Fixture Site</title>
	<meta
		name="description"
		content="A small SvelteKit app for testing Tentman content configs, blog collections, and reusable blocks."
	/>
</svelte:head>

<section class="hero">
	<div class="hero-copy">
		<p class="eyebrow">Tentman test app</p>
		<h1>A simple site for testing content.</h1>
		<p class="lead">
			This app uses the same block-based config schema described in the plans folder and the Tentman
			docs page, so edits here are a good way to check the current content system.
		</p>

		<div class="cta-row">
			<a class="button" href={resolve('/blog')}>Read the blog</a>
			<a class="button button-secondary" href={resolve('/about')}>View pages</a>
		</div>
	</div>

	<div class="hero-notes">
		<p class="eyebrow">Included here</p>
		<ul class="feature-list">
			<li>JSON-backed singleton pages for About and Contact</li>
			<li>A directory-backed blog collection with markdown post bodies</li>
			<li>A reusable gallery block shared across pages</li>
			<li>Primitive field types like email, URL, image, textarea, and date</li>
		</ul>
	</div>
</section>

<section class="page-grid">
	<article class="summary-block">
		<p class="eyebrow">About page</p>
		<h2>{data.about.title}</h2>
		<p>{data.about.intro}</p>
		<a class="text-link" href={resolve('/about')}>Read the full page</a>
	</article>

	<article class="summary-block">
		<p class="eyebrow">Contact page</p>
		<h2>{data.contact.title}</h2>
		<p>{data.contact.intro}</p>
		<a class="text-link" href={resolve('/contact')}>View contact details</a>
	</article>

	<article class="summary-block">
		<p class="eyebrow">Blog</p>
		<h2>Directory-backed posts</h2>
		<p>Use these entries to test create, update, preview, and listing flows.</p>
		<a class="text-link" href={resolve('/blog')}>Open the blog index</a>
	</article>
</section>

<section class="stack-lg">
	<div class="section-heading">
		<div>
			<p class="eyebrow">Editable surfaces</p>
			<h2>Configs included in this fixture</h2>
		</div>
		<p class="section-copy">
			These live under `test-app/tentman` and mirror the current Tentman schema.
		</p>
	</div>

	<div class="page-grid">
		<div class="config-block">
			<p class="eyebrow">Root config</p>
			<code>.tentman.json</code>
		</div>
		<div class="config-block">
			<p class="eyebrow">Content configs</p>
			<code>tentman/configs/about.tentman.json</code><br />
			<code>tentman/configs/contact.tentman.json</code><br />
			<code>tentman/configs/blog.tentman.json</code>
		</div>
		<div class="config-block">
			<p class="eyebrow">Reusable block</p>
			<code>tentman/blocks/image-gallery.tentman.json</code>
		</div>
	</div>
</section>

<section class="stack-lg">
	<div class="section-heading">
		<div>
			<p class="eyebrow">Recent posts</p>
			<h2>Blog content rendered from the fixture files</h2>
		</div>
	</div>

	<div class="post-list">
		{#each data.posts as post (post.slug)}
			<article class="post-card">
				{#if post.coverImage}
					<img class="post-cover" src={post.coverImage} alt="" />
				{/if}
				<div class="post-copy">
					<p class="post-meta">{post.date} · {post.readingTimeMinutes} min read</p>
					<h3>{post.title}</h3>
					<p>{post.excerpt}</p>
					<a class="text-link" href={resolve(`/blog/${post.slug}`)}>Read post</a>
				</div>
			</article>
		{/each}
	</div>
</section>

<GalleryGrid
	items={data.about.gallery}
	title="Shared gallery block"
	description="The gallery on this homepage is coming from the About singleton and uses the reusable block config in `tentman/blocks`."
/>
