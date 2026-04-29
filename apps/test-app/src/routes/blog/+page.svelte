<script lang="ts">
	import { resolve } from '$app/paths';

	let { data } = $props();

	const dateFormatter = new Intl.DateTimeFormat('en', { dateStyle: 'long' });
</script>

<svelte:head>
	<title>Blog | Tentman Fixture Site</title>
</svelte:head>

<section class="page-header">
	<p class="eyebrow">Directory-backed collection</p>
	<h1>Blog posts</h1>
	<p class="lead">
		These entries live in `src/content/posts` and are driven by `tentman/configs/blog.tentman.json`.
	</p>
</section>

<section class="post-list">
	{#each data.posts as post (post.slug)}
		<article class="post-card">
			{#if post.coverImage}
				<img class="post-cover" src={post.coverImage} alt="" />
			{/if}

			<div class="post-copy">
				<p class="post-meta">
					{dateFormatter.format(new Date(post.date))} · {post.author} · {post.readingTimeMinutes} min
					read
				</p>
				<h2>{post.title}</h2>
				<p>{post.excerpt}</p>
				<a class="text-link" href={resolve(`/blog/${post.slug}`)}>Read article</a>
			</div>
		</article>
	{/each}
</section>
