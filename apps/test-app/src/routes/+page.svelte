<script lang="ts">
	import { resolve } from '$app/paths';

	let { data } = $props();

	const componentExample = `:doc-link[the FAQ page]{href="/faq" variant="strong"}
:doc-link[tentman/configs/blog.tentman.json]{href="/blog" variant="plain"}`;
</script>

<svelte:head>
	<title>Tentman Test App</title>
	<meta
		name="description"
		content="A plain fixture site for showing Tentman singleton pages, collections, nested collections, content components, and manual ordering."
	/>
</svelte:head>

<section class="home-hero">
	<div>
		<p class="eyebrow">Tentman test app</p>
		<h1>A small, plain website that demonstrates what Tentman can model.</h1>
		<div class="hero-rule"></div>
	</div>

	<div class="home-intro">
		<p class="lead">
			This fixture is intentionally quiet. It exists to show singleton pages, a directory-backed blog,
			a nested FAQ collection, repo-local <strong>content components</strong>, a reusable block, and
			manifest-driven ordering without dressing any of that up as a marketing site.
		</p>
		<div class="cta-row">
			<a class="button-link" href={resolve('/about')}>Open the pages</a>
			<a class="button-link" href={resolve('/blog')}>Read the blog</a>
		</div>
	</div>
</section>

<section class="index-section">
	<div class="section-heading">
		<div>
			<p class="section-id">01</p>
			<h2>Singleton pages</h2>
		</div>
		<p class="section-copy">
			The site uses simple file-backed pages for stable sections, then varies the schema enough to
			make each one a meaningful Tentman test.
		</p>
	</div>

	<div class="index-list">
		<article class="index-row">
			<div class="index-meta">
				<p class="eyebrow">About</p>
				<p class="tiny">JSON singleton + reusable block</p>
			</div>
			<div class="index-copy">
				<h3>{data.about.title}</h3>
				<p>{data.about.intro}</p>
				<a class="text-link" href={resolve('/about')}>Open About</a>
			</div>
		</article>
		<article class="index-row">
			<div class="index-meta">
				<p class="eyebrow">FAQ</p>
				<p class="tiny">Nested collections</p>
			</div>
			<div class="index-copy">
				<h3>{data.faq.title}</h3>
				<p>{data.faq.intro}</p>
				<a class="text-link" href={resolve('/faq')}>Open FAQ</a>
			</div>
		</article>
		<article class="index-row">
			<div class="index-meta">
				<p class="eyebrow">Contact</p>
				<p class="tiny">Structured fields</p>
			</div>
			<div class="index-copy">
				<h3>{data.contact.title}</h3>
				<p>{data.contact.intro}</p>
				<a class="text-link" href={resolve('/contact')}>Open Contact</a>
			</div>
		</article>
	</div>
</section>

<section class="index-section">
	<div class="section-heading">
		<div>
			<p class="section-id">02</p>
			<h2>Collection: blog posts</h2>
		</div>
		<p class="section-copy">
			The blog is a directory-backed collection with markdown bodies, manual ordering from the
			navigation manifest, and enough variety to exercise longform editing.
		</p>
	</div>

	<div class="post-list compact-post-list">
		{#each data.featuredPosts as post (post.slug)}
			<article class="post-card">
				<div class="post-copy">
					<p class="post-meta">featured · {post.date} · {post.readingTimeMinutes} min read</p>
					<h3>{post.title}</h3>
					<p>{post.excerpt}</p>
					<a class="text-link" href={resolve(`/blog/${post.slug}`)}>Read post</a>
				</div>
			</article>
		{/each}
	</div>

	<p class="section-note">
		The fixture currently includes {data.postCount} published posts, and the homepage feature order
		is driven by `tentman/navigation-manifest.json`.
	</p>
</section>

<section class="index-section">
	<div class="section-heading">
		<div>
			<p class="section-id">03</p>
			<h2>Markdown with content components</h2>
		</div>
		<p class="section-copy">
			The official term in the Tentman docs is <strong>content components</strong>. This fixture uses
			a repo-local inline component to show the feature in actual site copy.
		</p>
	</div>

	<div class="component-demo">
		<p class="component-render">
			Use
			<a class="content-link content-link--strong" href={resolve('/blog/rendering-with-content-components')}>doc-link</a>
			markers inside markdown to refer to
			<a class="content-link content-link--plain" href={resolve('/faq')}>routes</a>,
			<a class="content-link content-link--plain" href={resolve('/blog')}>configs</a>, or
			<a class="content-link content-link--plain" href={resolve('/about')}>related pages</a>
			without storing final HTML in source.
		</p>
		<pre>{componentExample}</pre>
	</div>
</section>

<section class="index-section">
	<div class="section-heading">
		<div>
			<p class="section-id">04</p>
			<h2>What this fixture covers</h2>
		</div>
		<p class="section-copy">
			You asked if anything important was missing. The extra capability worth showing is
			manifest-driven ordering, because it demonstrates Tentman-managed structure flowing through to
			the public site.
		</p>
	</div>

	<div class="file-grid">
		<div class="file-card">
			<p class="eyebrow">Root config</p>
			<code>.tentman.json</code>
		</div>
		<div class="file-card">
			<p class="eyebrow">Content configs</p>
			<code>tentman/configs/about.tentman.json</code>
			<code>tentman/configs/faq.tentman.json</code>
			<code>tentman/configs/blog.tentman.json</code>
			<code>tentman/configs/contact.tentman.json</code>
		</div>
		<div class="file-card">
			<p class="eyebrow">Repo-local components</p>
			<code>src/lib/content-components/doc-link</code>
		</div>
		<div class="file-card">
			<p class="eyebrow">Reusable block</p>
			<code>tentman/blocks/image-gallery.tentman.json</code>
		</div>
	</div>
</section>
